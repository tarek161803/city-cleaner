import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HumanRig } from './core/HumanRig';
import { IS_TOUCH, Input } from './core/Input';
import type { Actor } from './core/Actor';
import { Particles, Shake, TimeControl } from './combat/Feel';
import { Debris } from './combat/Debris';
import { sweepBladeVsCapsule } from './combat/HitDetection';
import type { AttackDef, Phase } from './combat/ComboSystem';
import { City, roadCentre } from './world/City';
import { Player } from './player/Player';
import { ThirdPersonCamera } from './player/ThirdPersonCamera';
import { Crowd, PLAYER_LOOK } from './npcs/Crowd';
import { Person, type PersonContext } from './npcs/Person';
import { Stall } from './city/Stall';
import { Rickshaw } from './city/Rickshaw';
import type { Vehicle } from './city/Vehicle';
import type { CircleCollider } from './world/City';
import { Traffic, type Blocker } from './city/Traffic';
import { Market } from './city/Market';
import { HUD } from './ui/HUD';
import { Sfx } from './audio/Sfx';

/** People further than this from the player don't collide with each other. */
const ACTOR_RANGE = 40;
/** Vertical field of view (degrees) on a landscape or square screen. */
const FOV = 65;
/** On a portrait screen the view widens so at least this much is visible side to side (capped at MAX_FOV). */
const MIN_H_FOV = 55;
const MAX_FOV = 90;
/** Extra reach added to target radius for the hammer head. */
const HEAD_RADIUS = 0.3;
const DUST = new THREE.Color(0xa89880);
const SPARK = new THREE.Color(0xffd27a);
/** Electric arcing from a shorted battery: blue-white. */
const ARC = new THREE.Color(0xbfe6ff);
const SPLINTER = new THREE.Color(0x8a6a45);
/** How long a smashed rickshaw's battery keeps fizzing. */
const WRECK_BURN = 4;

const _base = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _shake = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _feet = new THREE.Vector3();
const _circles: CircleCollider[] = [];
const _bat = new THREE.Vector3();

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 5000);
  private input: Input;
  private city: City;
  private camCtl: ThirdPersonCamera;
  private time = new TimeControl();
  private shake = new Shake();
  private dust = new Particles(2500, 0.18, false, 2.5);
  private sparks = new Particles(800, 0.07, true, 9);
  /** Brief blue-white light from battery arcs. */
  private flash = new THREE.PointLight(0x9fd8ff, 0, 9, 2);
  private flashI = 0;
  /** Smashed rickshaws' batteries, still shorting out where they lay. */
  private wrecks: { pos: THREE.Vector3; t: number }[] = [];
  private debris: Debris;
  private hud = new HUD();
  private sfx = new Sfx();
  private player!: Player;
  private crowd!: Crowd;
  private traffic!: Traffic;
  private market!: Market;
  private actors: Actor[] = [];
  private targets: (Rickshaw | Stall)[] = [];
  private ctx!: PersonContext;
  private blockers: Blocker[] = [];
  private lastPhase: Phase | null = null;
  private lastDef: AttackDef | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Phones have very dense screens and weaker GPUs: render at a lower resolution there.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    // Audio may only start after a user gesture: the click that starts/resumes the game.
    this.renderer.domElement.addEventListener('click', () => this.sfx.unlock());
    this.city = new City(this.scene);
    this.camCtl = new ThirdPersonCamera(this.camera);
    this.debris = new Debris(this.scene, (x, z) => this.city.heightAt(x, z));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    // The flash light is always in the scene (at zero intensity) so adding it never recompiles shaders.
    this.scene.add(this.dust.points, this.sparks.points, this.flash);

    this.fitCamera();
    addEventListener('resize', () => {
      this.fitCamera();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  /** Match the screen's shape; a tall phone screen gets a wider view so the sides aren't cut off. */
  private fitCamera() {
    const aspect = innerWidth / innerHeight;
    const forWidth = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MIN_H_FOV / 2)) / aspect));
    this.camera.aspect = aspect;
    this.camera.fov = THREE.MathUtils.clamp(forWidth, FOV, MAX_FOV);
    this.camera.updateProjectionMatrix();
  }

  async init() {
    this.city.build();

    const rig = new HumanRig(PLAYER_LOOK, { weapon: { trailColor: new THREE.Color(0xffe0a0) } });
    this.player = new Player(rig);
    // Middle of the road on the west side of the central block, looking up the street.
    this.player.pos.set(roadCentre(2), 0, -10);
    this.scene.add(rig.root, rig.trail!.mesh);

    this.crowd = new Crowd(this.scene, this.city);
    this.crowd.populate();
    this.traffic = new Traffic(
      this.scene,
      this.city,
      (v) => (v.owner = this.crowd.spawnDriver(v)),
      (a, b, at) => this.onCrash(a, b, at),
      this.camera,
    );
    this.traffic.populate(this.player.pos);
    this.market = new Market(this.scene, this.city, (s) => (s.owner = this.crowd.spawnKeeper(s)));
    this.market.populate();
    this.hud.ready();
  }

  start() {
    let last = performance.now();
    const frame = (now: number) => {
      const rawDt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      this.update(rawDt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private update(rawDt: number) {
    // The game is paused whenever the mouse is released (pause menu showing).
    const paused = !this.input.locked;
    const dt = paused ? 0 : this.time.step(rawDt);
    const { input, player, city } = this;

    this.targets.length = 0;
    for (const r of this.traffic.rickshaws) if (r.alive) this.targets.push(r);
    for (const s of this.market.stalls) if (s.alive) this.targets.push(s);
    this.updateObstacles();

    this.sfx.setPaused(paused);
    if (input.wasPressed('KeyM')) this.hud.popup(player.pos, this.sfx.toggleMute() ? 'MUTED' : 'SOUND ON', 'small');

    this.actors.length = 0;
    this.actors.push(player);
    // Only people near the player push each other (and the player) around: checking every pair across
    // the whole crowd each frame is far too slow, and nobody sees it further off.
    for (const p of this.crowd.people) if (p.mode !== 'post' && p.distTo(player.pos) < ACTOR_RANGE) this.actors.push(p);

    player.update(dt, input, this.camCtl.yaw, city, this.actors);
    if (player.swung) {
      player.swung = false;
      const name = player.attack.def?.name;
      this.sfx.whoosh(player.pos, name === 'heavy' || name === 'light3');
    }
    if (player.rig.stepped && player.grounded) this.sfx.footstep(player.pos, Math.hypot(player.vel.x, player.vel.z) > 4);
    this.traffic.update(dt, player.pos, this.roadBlockers());
    this.market.update(dt, player.pos);
    const ctx: PersonContext = {
      playerPos: player.pos,
      city,
      actors: this.actors,
      say: (who, text) => this.hud.speak(who.pos, text),
      shove: (by) => this.onShove(by),
      stalls: this.market.stalls,
    };
    this.ctx = ctx;
    this.crowd.update(dt, ctx);

    this.resolveHammer();

    this.city.update(dt);
    this.debris.update(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.updateElectrics(dt);
    player.rig.trail!.update(dt);
    this.shake.update(rawDt, _shake);
    this.camCtl.update(rawDt, input, player.pos, city, _shake);
    this.sfx.setListener(this.camera.position, this.camCtl.yaw);
    this.sfx.tick(dt);
    // Drivers ring bells / honk now and then, and constantly when stuck in a jam.
    for (const v of this.traffic.vehicles) {
      if (!v.alive || !v.owner) continue;
      const rate = v.speed < 0.4 ? 0.3 : 0.04;
      if (Math.random() >= dt * rate || player.distTo(v.pos) > 35) continue;
      this.honk(v);
    }
    city.follow(player.pos);

    this.hud.updateGrit(this.crowd.people.filter((p) => p.mode === 'defend'));
    // Keep the menu hidden while the click to play is still settling into fullscreen + pointer lock.
    this.hud.update(paused ? 0 : rawDt, input.locked || input.settling, this.camera);
    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }

  /** Rickshaws (two circles along their length) and stalls block movement while intact. */
  /** Vehicles (a row of circles along their length) and stalls block movement while intact. */
  private updateObstacles() {
    const dyn = this.city.dynamic;
    dyn.length = 0;
    for (const v of this.traffic.vehicles) if (v.alive) v.circles(dyn);
    for (const s of this.market.stalls) if (s.alive) dyn.push({ x: s.pos.x, z: s.pos.z, r: 1.1 });
  }

  /**
   * Everything traffic must brake for: the player, anyone walking in the road (pushed off the
   * footpath by stalls, jaywalking, arguing after a crash), and stalls set up in the road.
   */
  private roadBlockers() {
    const out = this.blockers;
    out.length = 0;
    out.push({ pos: this.player.pos, half: 0.5 });
    for (const p of this.crowd.people) {
      if (p.mode !== 'post' && this.city.heightAt(p.pos.x, p.pos.z) === 0) out.push({ pos: p.pos, half: 0.4, soft: true });
    }
    for (const s of this.market.stalls) if (s.alive && s.slot.onRoad) out.push({ pos: s.pos, half: 0.8 });
    return out;
  }

  /** Bell for rickshaws, horn for everything else. */
  private honk(v: Vehicle) {
    if (v.kind === 'rickshaw') this.sfx.ringBell(v.pos);
    else this.sfx.horn(v.pos, v.kind === 'bus' || v.kind === 'truck' ? 'bus' : v.kind === 'bike' || v.kind === 'cng' || v.kind === 'leguna' ? 'cng' : 'car');
  }

  private resolveHammer() {
    const { player } = this;
    const hammer = player.rig.weapon!;
    hammer.segment(_base, _tip);
    const pa = player.attack;
    if (pa.def && pa.activeThisFrame) {
      player.rig.trail!.push(_base, _tip);
      if (hammer.hasPrev) {
        for (const t of this.targets) {
          if (!t.alive || pa.hitSet.has(t)) continue;
          if (!sweepBladeVsCapsule(hammer.prevBase, hammer.prevTip, _base, _tip, t.pos, t.height, t.radius + HEAD_RADIUS, _hit)) continue;
          pa.hitSet.add(t);
          this.hit(t, pa.def.damage, _hit);
          player.rig.impact(pa.def.name === 'heavy' || pa.def.name === 'light3' ? 0.8 : 0.35);
          this.time.hitStop(pa.def.hitStop);
          this.shake.add(pa.def.shake);
        }
        this.bonkVehicles(pa.hitSet);
      }
    }
    // Ground slam: shockwave where the head lands.
    if (this.lastPhase === 'active' && pa.phase !== 'active' && this.lastDef?.shockwave) {
      player.rig.impact(1.2);
      this.shockwave(_tip, this.lastDef.shockwave, this.lastDef.damage * 0.6, pa.hitSet);
    }
    this.lastPhase = pa.phase;
    this.lastDef = pa.def;
    hammer.storePrev(_base, _tip);
  }

  private hit(t: Rickshaw | Stall, damage: number, at: THREE.Vector3) {
    // Clearing a spot while its owner stands guard is worth a bonus.
    const defended = this.crowd.isDefended(t);
    const res = t.smash(damage, at);
    this.dust.emit(at, _up, 22, 3, 1.4, DUST, 0.9);
    const material = t instanceof Rickshaw ? 'metal' : 'wood';
    if (res === 'destroyed') this.sfx.smash(at, material);
    else this.sfx.hammerHit(at, material);
    this.crowd.propertyHit(t, this.ctx);
    if (res !== 'destroyed') {
      // Pieces near the blow come off; a stall's goods spill out further than a rickshaw's bits drop.
      if (t instanceof Rickshaw) this.debris.explode(t.loose, t.model, at, 2.5, [1, 3.5]);
      else this.debris.explode(t.loose, t.model, at, 3.5, [1.5, 4.5]);
      if (t instanceof Rickshaw) {
        this.sparks.emit(at, _up, 18, 4.5, 1.5, SPARK, 0.4);
        // A wheel came off: it rolls away down the road, wobbling until it falls over.
        if (t.fallenWheel) {
          const w = t.fallenWheel;
          this.debris.rollWheel(w, t.spec.wheelR, t.group.rotation.y);
          this.dust.emit(w.getWorldPosition(new THREE.Vector3()), _up, 12, 2, 1.4, DUST, 0.8);
        }
        // Every blow jars the battery; the harder it's been hit, the worse it arcs.
        if (t.damage > 0.3) this.arc(this.batteryPos(t), 0.6 + t.damage);
      } else {
        this.dust.emit(at, _up, 14, 4, 1.6, SPLINTER, 0.7);
      }
      this.hud.onHit(at);
      // Solid hit that didn't break it: the hammer stops at the impact and bounces back (except the spin,
      // which ploughs on through everything around).
      const pa = this.player.attack;
      if (pa.def && pa.def.name !== 'heavy') pa.rebound(this.player.rig.pose);
      return;
    }
    const rickshaw = t instanceof Rickshaw;
    const blockedRoad = t instanceof Stall && t.slot.onRoad;
    // A beat of slow motion as it comes apart.
    this.time.slowMo(0.22, 0.35);
    this.hud.onSmash(rickshaw ? 'rickshaw' : 'stall', t.pos, defended, blockedRoad);
    this.debris.explode(t.parts, t.model, this.player.pos, rickshaw ? 6 : 5);
    this.dust.emit(t.pos.clone().setY(t.pos.y + 0.8), _up, 60, 4, 2, DUST, 1.4);
    if (rickshaw) {
      // The battery pack splits open: a shower of sparks, and a blue-white arc flash,
      // then it lies there fizzing for a few seconds.
      const bat = this.batteryPos(t).clone();
      this.sparks.emit(bat, _up, 70, 7, 1.8, SPARK, 0.7);
      this.arc(bat, 2.2);
      bat.y = this.city.heightAt(bat.x, bat.z) + 0.15;
      this.wrecks.push({ pos: bat, t: WRECK_BURN });
    } else {
      this.dust.emit(t.pos.clone().setY(t.pos.y + 1), _up, 40, 5, 2, SPLINTER, 1);
    }
    this.shake.add(0.25);
  }

  private batteryPos(r: Rickshaw) {
    r.model.updateMatrixWorld(true);
    return r.model.localToWorld(_bat.copy(r.battery));
  }

  /** A battery shorting out: blue-white sparks, a crackle and a flash of light. */
  private arc(at: THREE.Vector3, strength: number) {
    this.sparks.emit(at, _up, Math.round(10 * strength), 3 + 2 * strength, 2, ARC, 0.35);
    this.sparks.emit(at, _up, Math.round(6 * strength), 2.5, 2.2, SPARK, 0.5);
    this.flash.position.copy(at);
    this.flashI = Math.max(this.flashI, 25 * strength);
    this.sfx.shortCircuit(at, Math.min(1, 0.4 + strength * 0.3));
  }

  /**
   * Damaged rickshaws' batteries spark now and then (more often the worse they're hit);
   * smashed ones keep arcing on the ground for a while.
   */
  private updateElectrics(dt: number) {
    if (dt <= 0) return;
    for (const r of this.traffic.rickshaws) {
      const d = r.damage;
      if (!r.alive || d < 0.3 || this.player.distTo(r.pos) > 40) continue;
      if (Math.random() < dt * (0.8 + d * 3)) this.arc(this.batteryPos(r), 0.4 + Math.random() * 0.5);
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t -= dt;
      if (w.t <= 0) {
        this.wrecks.splice(i, 1);
        continue;
      }
      const k = w.t / WRECK_BURN;
      if (Math.random() < dt * 5 * k) this.arc(w.pos, 0.5 + Math.random() * k);
    }
    this.flashI *= Math.exp(-20 * dt);
    this.flash.intensity = this.flashI * (0.7 + Math.random() * 0.3);
  }

  /** Two rickshaws collided: dust, a bang, and both drivers jump off to argue. */
  /** The hammer clanks off cars, buses, pickups and bikes: no damage, but the driver lays on the horn. */
  private bonkVehicles(hitSet: Set<unknown>) {
    const hammer = this.player.rig.weapon!;
    for (const v of this.traffic.vehicles) {
      if (v.kind === 'rickshaw' || !v.alive || hitSet.has(v) || this.player.distTo(v.pos) > v.spec.halfLength + 3) continue;
      _circles.length = 0;
      v.circles(_circles);
      const touched = _circles.some((c) =>
        sweepBladeVsCapsule(hammer.prevBase, hammer.prevTip, _base, _tip, _feet.set(c.x, 0, c.z), v.height, c.r + 0.15, _hit),
      );
      if (!touched) continue;
      hitSet.add(v);
      v.jolt();
      this.sfx.hammerHit(_hit, 'metal');
      this.sparks.emit(_hit, _up, 14, 4, 1.4, SPARK, 0.35);
      this.time.hitStop(0.05);
      this.shake.add(0.15);
      this.honk(v);
      if (v.owner instanceof Person) this.hud.speak(v.owner.pos, 'গাড়িতে হাত দিস না!');
    }
  }

  private onCrash(a: Vehicle, b: Vehicle, at: THREE.Vector3) {
    this.dust.emit(at, _up, 30, 3, 1.6, DUST, 0.9);
    this.sfx.crash(at);
    if (a.kind !== 'rickshaw' || b.kind !== 'rickshaw') this.honk(a.kind !== 'rickshaw' ? a : b);
    this.sparks.emit(at, _up, 12, 4, 1.4, SPARK, 0.4);
    const near = this.player.distTo(at);
    if (near < 25) this.shake.add(0.2 * (1 - near / 25));
    if (near < 45) this.hud.popup(at, 'CRASH!', 'crash');
    const da = a.owner, db = b.owner;
    if (da instanceof Person && db instanceof Person) {
      da.quarrel(db, true);
      db.quarrel(da, false);
    }
  }

  /** A defending owner pushes the player back. */
  private onShove(by: Person) {
    this.player.shove(by.pos);
    this.shake.add(0.18);
    this.hud.popup(this.player.pos, 'SHOVED!', 'crash');
  }

  private shockwave(center: THREE.Vector3, radius: number, damage: number, already: Set<unknown>) {
    const ground = this.city.heightAt(center.x, center.z);
    const c = _dir.set(center.x, ground + 0.1, center.z).clone();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      this.dust.emit(c, _fwd.set(Math.cos(a), 0.15, Math.sin(a)), 6, 6, 0.4, DUST, 0.8);
    }
    this.shake.add(0.3);
    this.sfx.slam(c);
    for (const t of this.targets) {
      if (!t.alive || already.has(t)) continue;
      if (Math.hypot(t.pos.x - c.x, t.pos.z - c.z) < radius + t.radius) this.hit(t, damage, c);
    }
  }
}
