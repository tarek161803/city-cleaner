import * as THREE from 'three';
import { clamp, damp, rand } from '../core/math';
import { LANE_OFFSET, MEDIAN_HALF, type CircleCollider, type Lane } from '../world/City';
import type { Post } from '../npcs/Person';
import { Destructible, type Owner } from './Destructible';

/** How far past the edge of the map a vehicle may drive on (the ground ends not much further out). */
export const EXIT_RUN = 55;
/** How far before the start of its road a vehicle re-enters, among the scenery past the far edge. */
export const ENTRY_RUN = 40;
import { PartsBuilder, type Part } from './Parts';

export type VehicleKind = 'rickshaw' | 'bike' | 'car' | 'pickup' | 'bus' | 'cng' | 'microbus' | 'truck' | 'leguna';

/** How a type of vehicle is built and how it drives. */
export interface VehicleSpec {
  kind: VehicleKind;
  /** Half the length and width of the footprint, for queueing, crashes and collision. */
  halfLength: number;
  halfWidth: number;
  height: number;
  speed: [number, number];
  /** Sideways weave amplitude range (m). */
  weave: [number, number];
  /** Chance to spawn driving on the wrong side, and per-second chance to swerve into it. */
  wrongWayChance: number;
  swerveRate: number;
  /** Per-second chance to stop for passengers. */
  stopRate: number;
  /** Seconds stuck behind something before swerving into the oncoming lane to get past it. */
  patience: number;
  /** Driver's seat in local space; hidden drivers sit inside a cabin. */
  seat: [number, number, number];
  hiddenDriver: boolean;
  /** How far to the side the driver steps out. */
  exitDist: number;
  /** Only rickshaws can be smashed; other vehicles just clank. */
  maxHp: number;
  wheelR: number;
  wheels: [number, number][];
}

/** Sideways shift into the oncoming lane (lanes sit LANE_OFFSET either side of the road centre). */
const WRONG_WAY_LAT = -2 * LANE_OFFSET;
/** Bumper-to-bumper room kept behind the vehicle ahead. */
const BUMPER_GAP = 1.2;

/** How far toward its own kerb a vehicle pulls to squeeze past oncoming traffic. */
const HEAD_ON_DODGE = 1.6;

let nextId = 0;

/**
 * A vehicle on a lane: queues behind whatever is ahead, but drives like Dhaka traffic — weaving,
 * drifting, stopping for passengers and sometimes cutting into the oncoming lane.
 */
export class Vehicle extends Destructible implements Post {
  readonly maxHp: number;
  readonly radius: number;
  readonly height: number;
  readonly respawnDelay = 18;
  readonly seated = true;
  lane!: Lane;
  s = 0;
  speed = 0;
  /** Sideways offset from the lane centre (toward the oncoming lane is negative). */
  lat = 0;
  wrongWay = false;
  /** No new crash until this runs out. */
  crashCooldown = 0;
  readonly id = nextId++;
  /** Seconds without moving, for clearing hopeless gridlock out of sight. */
  idleT = 0;
  /** Seconds crawling at most, for spotting deadlocks where everyone just inches back and forth. */
  slowT = 0;
  /** Seconds spent waiting for a pedestrian in the road. */
  pedestrianWaitT = 0;
  /** The vehicle it is queued behind this frame, if any (for spotting deadlocks). */
  leader: Vehicle | null = null;
  /** Giving way to break a deadlock: backs up to let the others through. */
  yieldT = 0;
  /** Free space behind it (m), for backing up out of a deadlock. */
  backRoom = Infinity;
  /** Nose to nose with oncoming traffic: pull toward own kerb to squeeze past. */
  private headOnT = 0;
  /** Careless drivers (many rickshaws, some bikers) don't look out for oncoming or crossing traffic. */
  private careless: boolean;
  private maxSpeed: number;
  /** >0 = stopped for passengers; negative counts the cooldown before the next stop. */
  private stopT = -rand(0, 8);
  private wheelMeshes: THREE.Mesh[] = [];
  /** Each wheel's parts (model-local), so a wheel that comes off no longer explodes with the rest. */
  private wheelParts: Part[][] = [];
  /** A wheel knocked off by the last blow, for the game to send rolling away. */
  fallenWheel: THREE.Mesh | null = null;
  private wheelAngle = 0;
  private drift = 0;
  private weavePhase = Math.random() * 10;
  private weaveAmp: number;
  private weaveFreq = rand(0.25, 0.6);
  private heading = 0;
  private wrongT = 0;
  private stuckT = 0;

  constructor(
    readonly spec: VehicleSpec,
    body: PartsBuilder,
    wheel: () => PartsBuilder,
  ) {
    super();
    this.maxHp = spec.maxHp;
    this.radius = spec.halfWidth + 0.3;
    this.height = spec.height;
    this.maxSpeed = rand(...spec.speed);
    this.careless = Math.random() < (spec.kind === 'rickshaw' ? 0.6 : spec.kind === 'bike' ? 0.35 : spec.kind === 'cng' || spec.kind === 'leguna' ? 0.2 : 0);
    this.weaveAmp = rand(...spec.weave);
    this.setModel(body);
    // Wheels are separate meshes so they can spin; their parts still fly off as debris.
    for (const [x, z] of spec.wheels) {
      const wb = wheel();
      const mesh = wb.build();
      mesh.position.set(x, spec.wheelR, z);
      this.model.add(mesh);
      this.wheelMeshes.push(mesh);
      const parts = wb.parts.map((p) => ({ ...p, center: p.center.clone().add(mesh.position) }));
      this.wheelParts.push(parts);
      this.parts.push(...parts);
    }
    this.restore();
  }

  restore() {
    super.restore();
    for (const w of this.wheelMeshes) w.visible = true;
    this.fallenWheel = null;
  }

  smash(damage: number, at?: THREE.Vector3) {
    this.fallenWheel = null;
    return super.smash(damage, at);
  }

  /** The wheel nearest the blow comes off and the vehicle drops onto that corner. */
  protected onCrumble(_damage: number, hit: THREE.Vector3) {
    let best = -1, bestD = Infinity;
    for (const [i, w] of this.wheelMeshes.entries()) {
      if (!w.visible) continue;
      const d = w.position.distanceTo(hit);
      if (d < bestD) (best = i), (bestD = d);
    }
    if (best < 0) return;
    const wheel = this.wheelMeshes[best];
    wheel.visible = false;
    const gone = new Set(this.wheelParts[best]);
    this.parts = this.parts.filter((p) => !gone.has(p));
    this.fallenWheel = wheel;
    this.lean(wheel.position.x, wheel.position.z, 0.14);
  }

  /** Ploughing on without looking — how most crashes happen. Never right after a crash. */
  get reckless() {
    return this.careless && this.crashCooldown <= 0;
  }

  get kind() {
    return this.spec.kind;
  }

  get hidden() {
    return this.spec.hiddenDriver;
  }

  get exitDist() {
    return this.spec.exitDist;
  }

  get moveSpeed() {
    return this.speed;
  }

  place(lane: Lane, s: number) {
    this.lane = lane;
    this.s = s;
    this.speed = 0;
    this.crashCooldown = 3;
    this.yieldT = 0;
    this.idleT = 0;
    this.slowT = 0;
    // No wrong-way driving where a divider separates the two directions.
    this.wrongWay = !lane.divided && Math.random() < this.spec.wrongWayChance;
    this.wrongT = rand(10, 25);
    this.lat = this.wrongWay ? WRONG_WAY_LAT : 0;
    this.syncTransform();
  }

  /**
   * Car-following toward the vehicle (or player) ahead; `leaderHalf` is the half-length of what is in front.
   * `latMin`/`latMax` keep it from sliding sideways into whatever is alongside.
   */
  drive(dt: number, gap: number, leaderHalf: number, latMin = -Infinity, latMax = Infinity, headOn = false, oncoming = false, backRoom = Infinity) {
    this.backRoom = backRoom;
    const spec = this.spec;
    this.crashCooldown -= dt;
    this.yieldT -= dt;
    if (this.owner) {
      this.stopT -= dt;
      if (this.stopT < -6 && Math.random() < dt * spec.stopRate) this.stopT = rand(2, 6);
      if (this.wrongWay) {
        this.wrongT -= dt;
        if (this.wrongT <= 0) this.wrongWay = false;
      } else if (!this.lane.divided && !oncoming && Math.random() < dt * spec.swerveRate) {
        this.wrongWay = true;
        this.wrongT = rand(6, 14);
      }
    }
    // Abandoned vehicles just sit there and block the lane.
    const room = gap - (spec.halfLength + leaderHalf + BUMPER_GAP);
    const want = this.owner && this.stopT <= 0 && this.yieldT <= 0 ? clamp(room * 1.2, 0, this.maxSpeed) : 0;
    // Stuck behind something: impatient drivers pull out into the oncoming lane to get round it.
    const blocked = this.owner && this.stopT <= 0 && room < 1 && this.speed < 0.4;
    this.idleT = this.speed < 0.3 ? this.idleT + dt : 0;
    this.slowT = this.speed < 1 ? this.slowT + dt : 0;
    this.headOnT = headOn && room < 2 ? this.headOnT + dt : Math.max(0, this.headOnT - dt);
    this.stuckT = blocked ? this.stuckT + dt : 0;
    // Already on the wrong side and still stuck: give up and pull back over.
    // Only pull out when the oncoming side ahead is clear — pulling into oncoming traffic is how junctions lock up.
    if (this.stuckT > spec.patience) {
      this.wrongWay = this.lane.divided || (oncoming && !this.wrongWay) ? false : !this.wrongWay;
      this.wrongT = rand(3, 6);
      this.stuckT = 0;
    }
    this.speed = damp(this.speed, want, 3, dt);
    // Gentle braking can't stop in time when something stops dead or cuts in close ahead: never move
    // further than the room there is, so it never drives into what's in front.
    if (dt > 0) this.speed = Math.min(this.speed, Math.max(0, room) / dt);
    this.s += this.speed * dt;
    // Giving way: reverse slowly into whatever room there is behind.
    if (this.yieldT > 0 && backRoom > 0) {
      const back = Math.min(1.2 * dt, backRoom);
      this.s = Math.max(-ENTRY_RUN, this.s - back);
      this.wheelAngle -= back / spec.wheelR;
    }
    // Past the edge of the map it drives on into the scenery until Traffic takes it away; never off the ground.
    if (this.s > this.lane.length + EXIT_RUN) {
      this.s = this.lane.length + EXIT_RUN;
      this.speed = 0;
    }
    this.wheelAngle += (this.speed * dt) / spec.wheelR;
    for (const w of this.wheelMeshes) w.rotation.x = this.wheelAngle;

    // Never quite straight: a slow weave plus random drift, steering toward the chosen side of the road.
    if (dt > 0) {
      const prevLat = this.lat;
      this.drift = clamp(this.drift + (Math.random() - 0.5) * dt * 0.8, -0.6, 0.6);
      this.weavePhase += this.speed * dt * this.weaveFreq;
      // Cars and buses hold their line better than rickshaws and bikes.
      const driftScale = spec.weave[1] > 0.3 ? 1 : 0.4;
      const dodge = this.headOnT > 0.8 ? HEAD_ON_DODGE : 0;
      const target =
        (this.wrongWay ? WRONG_WAY_LAT : 0) + dodge + this.drift * driftScale + Math.sin(this.weavePhase) * this.weaveAmp;
      // Steer sideways while rolling, or when pulling out of / back into a lane from a standstill.
      const steer = this.speed > 0.2 || (this.owner && Math.abs(target - this.lat) > 1) ? 1.2 : 0;
      // Never squeeze sideways into something alongside (but don't get shoved either).
      // Divided road: stay out of the divider.
      if (this.lane.divided) latMin = Math.max(latMin, -(LANE_OFFSET - MEDIAN_HALF - spec.halfWidth - 0.1));
      this.lat = clamp(damp(this.lat, target, steer, dt), Math.min(latMin, prevLat), Math.max(latMax, prevLat));
      const latVel = (this.lat - prevLat) / dt;
      this.heading = damp(this.heading, clamp(Math.atan2(latVel, Math.max(this.speed, 0.5)), -0.6, 0.6), 6, dt);
    }
    this.syncTransform();
  }

  /** Has driven right off the end of its road, past the edge of the map. */
  get offEdge() {
    return this.s > this.lane.length + this.spec.halfLength;
  }

  /** At the furthest it may drive past the edge: time to go, seen or not. */
  get atRunEnd() {
    return this.s >= this.lane.length + EXIT_RUN;
  }

  /** Bumped into another vehicle: stop dead where it is. */
  crash() {
    this.speed = 0;
    this.crashCooldown = 4;
    this.jolt();
    this.syncTransform();
  }

  /** Front and back ends of the footprint's centre line (for crash tests). */
  ends(a: THREE.Vector3, b: THREE.Vector3) {
    const r = this.group.rotation.y, h = this.spec.halfLength - this.spec.halfWidth;
    const fx = Math.sin(r) * Math.max(0, h), fz = Math.cos(r) * Math.max(0, h);
    a.set(this.pos.x + fx, 0, this.pos.z + fz);
    b.set(this.pos.x - fx, 0, this.pos.z - fz);
  }

  /** Footprint as a row of circles, for blocking movement and hammer contact. */
  circles(out: CircleCollider[]) {
    const { halfLength, halfWidth } = this.spec;
    const n = Math.max(1, Math.round((halfLength * 2) / (halfWidth * 1.6)));
    const r = this.group.rotation.y;
    const span = halfLength - halfWidth;
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      out.push({ x: this.pos.x + Math.sin(r) * span * k, z: this.pos.z + Math.cos(r) * span * k, r: halfWidth });
    }
  }

  seat(out: THREE.Vector3) {
    this.group.localToWorld(out.set(...this.spec.seat));
    return this.group.rotation.y;
  }

  leave() {
    this.owner = null;
  }

  /** The driver climbs back on/in after an argument. */
  reclaim(owner: Owner) {
    if (this.broken || this.owner) return false;
    this.owner = owner;
    this.crashCooldown = 6;
    // Usually they drive off on the proper side after the shouting.
    if (Math.random() < 0.6) this.wrongWay = false;
    return true;
  }

  private syncTransform() {
    const { origin, dir } = this.lane;
    // Lateral axis: positive toward the kerb, negative toward the oncoming lane.
    const lx = dir.z, lz = -dir.x;
    this.group.position.set(origin.x + dir.x * this.s + lx * this.lat, 0, origin.z + dir.z * this.s + lz * this.lat);
    this.group.rotation.y = Math.atan2(dir.x, dir.z) + this.heading;
    this.group.updateMatrixWorld(true);
  }
}
