import * as THREE from 'three';
import { mergeParts, type Part, type PartsBuilder } from './Parts';
import { rand } from '../core/math';

const CULL_DIST = 150;

/** How a prop comes apart under blows that don't finish it. */
export interface Breakup {
  /** Share of the model's parts knocked loose by each blow. */
  looseShare: number;
  /** The largest pieces (this fraction up, by size) stay on until the final blow. */
  keepAbove: number;
  /** Parts this close to a blow (m) get bent, pushed in and scuffed. */
  dentRadius: number;
  /** How much each blow adds to the whole prop's lean, and the most it can lean (rad). */
  tiltStep: number;
  maxTilt: number;
  /** How far the top of the prop drops per blow on the side that was hit (m): a buckling leg or pole. */
  slump: number;
}

/** Rigid metal frame: dents and loses bits, but holds its shape. */
const DEFAULT_BREAKUP: Breakup = { looseShare: 0.12, keepAbove: 0.8, dentRadius: 0.75, tiltStep: 1, maxTilt: 0.16, slump: 0 };

export type SmashResult = 'hit' | 'destroyed';

/** Whoever runs this rickshaw/stall; they bolt when it gets hit. */
export interface Owner {
  scare(from: THREE.Vector3): void;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _in = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * A prop that can be hammered apart, disappears, and later respawns. Each blow that doesn't finish it
 * knocks pieces off near the impact, dents what's around it and leaves the whole thing leaning a bit
 * more; the last blow blows the rest apart.
 */
export abstract class Destructible {
  readonly group = new THREE.Group();
  model!: THREE.Mesh;
  /** Everything still attached (merged body plus any separate child meshes such as wheels). */
  parts: Part[] = [];
  /** Pieces knocked off by the last blow that didn't destroy it (model-local, for debris). */
  loose: Part[] = [];
  owner: Owner | null = null;
  broken = false;
  respawnT = 0;
  hp = 0;
  abstract readonly maxHp: number;
  abstract readonly radius: number;
  abstract readonly height: number;
  abstract readonly respawnDelay: number;
  protected readonly breakup: Breakup = DEFAULT_BREAKUP;
  /** Parts baked into the model mesh. */
  private bodyParts: Part[] = [];
  /** Undamaged state, restored on respawn. */
  private pristine: { parts: Part[]; body: Part[]; geo: THREE.BufferGeometry } | null = null;
  private tilt = { x: 0, z: 0, sag: 0 };
  private wobble = 0;
  private t = Math.random() * 10;

  get pos() {
    return this.group.position;
  }

  get alive() {
    return !this.broken;
  }

  /** 0 = untouched, 1 = about to fall apart. */
  get damage() {
    return this.broken ? 1 : 1 - Math.max(0, this.hp) / this.maxHp;
  }

  protected setModel(b: PartsBuilder) {
    if (this.model) {
      this.group.remove(this.model);
      this.model.geometry.dispose();
    }
    this.model = b.build();
    this.parts = [...b.parts];
    this.bodyParts = [...b.parts];
    this.pristine = null;
    this.group.add(this.model);
  }

  /** `at` is the impact point in world space; it decides which pieces come off. */
  smash(damage: number, at?: THREE.Vector3): SmashResult {
    this.hp -= damage;
    this.wobble = 1;
    this.loose = [];
    if (this.hp > 0) {
      if (at) this.crumble(this.model.worldToLocal(at.clone()));
      return 'hit';
    }
    this.broken = true;
    this.respawnT = this.respawnDelay;
    this.group.visible = false;
    return 'destroyed';
  }

  /** Shake without damage (e.g. a traffic bump). */
  jolt() {
    this.wobble = 1;
  }

  restore() {
    if (!this.pristine) {
      this.pristine = { parts: [...this.parts], body: [...this.bodyParts], geo: this.model.geometry };
    } else if (this.model.geometry !== this.pristine.geo) {
      this.model.geometry.dispose();
      this.model.geometry = this.pristine.geo;
      this.parts = [...this.pristine.parts];
      this.bodyParts = [...this.pristine.body];
    }
    this.tilt = { x: 0, z: 0, sag: 0 };
    this.loose = [];
    this.hp = this.maxHp;
    this.broken = false;
    this.wobble = 0;
    this.group.visible = true;
  }

  /** Hit shake, damage lean and distance culling. */
  updateVisual(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    this.wobble = Math.max(0, this.wobble - dt * 3);
    this.model.rotation.z = Math.sin(this.t * 45) * 0.07 * this.wobble + this.tilt.z;
    this.model.rotation.x = Math.cos(this.t * 38) * 0.05 * this.wobble + this.tilt.x;
    this.model.position.y = -this.tilt.sag;
    const near = Math.abs(this.pos.x - playerPos.x) < CULL_DIST && Math.abs(this.pos.z - playerPos.z) < CULL_DIST;
    this.group.visible = !this.broken && near;
  }

  /** Knock off the pieces nearest the blow, dent the ones around it and lean the whole thing away. */
  private crumble(hit: THREE.Vector3) {
    const cfg = this.breakup;
    const body = this.bodyParts;
    // The biggest pieces (chassis, roof, table top) hold it together until the final blow.
    const sizes = body.map((p) => p.size).sort((a, b) => a - b);
    const structural = sizes[Math.floor(sizes.length * cfg.keepAbove)] ?? Infinity;
    const count = Math.max(2, Math.round(body.length * cfg.looseShare));
    const near = body
      .filter((p) => p.size < structural)
      .map((p) => ({ p, d: p.center.distanceTo(hit) + Math.random() * 0.35 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((e) => e.p);
    this.loose = near;
    const gone = new Set(near);
    this.parts = this.parts.filter((p) => !gone.has(p));

    _in.set(-hit.x, 0, -hit.z).normalize();
    // Which way the blow came from, horizontally; the side facing it buckles.
    _dir.copy(_in).negate();
    _axis.set(_dir.z, 0, -_dir.x);
    const top = Math.max(0.5, ...body.map((p) => p.center.y));
    this.bodyParts = body
      .filter((p) => !gone.has(p))
      .map((p) => {
        const d = p.center.distanceTo(hit);
        const k = Math.max(0, 1 - d / cfg.dentRadius);
        // Slump: higher up and nearer the struck side drops further and leans toward it.
        const side = 0.3 + 0.7 * Math.max(0, (p.center.x * _dir.x + p.center.z * _dir.z) / (Math.hypot(p.center.x, p.center.z) || 1));
        const drop = cfg.slump * Math.min(1.2, p.center.y / top) * side;
        if (k <= 0 && drop < 0.005) return p;
        // Dents: pushed in away from the blow, twisted a little and scuffed darker.
        const center = p.center.clone().addScaledVector(_in, rand(0.03, 0.09) * k);
        center.y -= 0.03 * k + drop;
        center.addScaledVector(_dir, drop * 0.5);
        const quat = p.quat.clone().premultiply(_q.setFromEuler(_e.set(rand(-0.3, 0.3) * k, rand(-0.3, 0.3) * k, rand(-0.3, 0.3) * k)));
        if (drop > 0) quat.premultiply(_q.setFromAxisAngle(_axis, drop * 1.2));
        const bent: Part = { ...p, center, quat, color: _c.set(p.color).multiplyScalar(1 - 0.25 * k).getHex() };
        const i = this.parts.indexOf(p);
        if (i >= 0) this.parts[i] = bent;
        return bent;
      });

    const t = this.tilt, step = cfg.tiltStep, max = cfg.maxTilt;
    t.z = THREE.MathUtils.clamp(t.z + Math.sign(hit.x) * rand(0.02, 0.05) * step, -max, max);
    t.x = THREE.MathUtils.clamp(t.x - Math.sign(hit.z) * rand(0.015, 0.035) * step, -max, max);
    t.sag = Math.min(0.08 * step, t.sag + 0.025 * step);

    if (this.model.geometry !== this.pristine?.geo) this.model.geometry.dispose();
    this.model.geometry = mergeParts(this.bodyParts);
    this.onCrumble(this.damage, hit);
  }

  /**
   * Extra damage effects for a particular prop (damage: 0 = untouched, 1 = about to fall apart;
   * hit in model space).
   */
  protected onCrumble(_damage: number, _hit: THREE.Vector3) {}

  /** Drop the corner at local (x, z) by tipping the whole prop toward it, e.g. onto a lost wheel. */
  protected lean(x: number, z: number, amount: number) {
    const t = this.tilt;
    t.z = THREE.MathUtils.clamp(t.z - Math.sign(x) * amount, -0.4, 0.4);
    t.x = THREE.MathUtils.clamp(t.x + Math.sign(z) * amount * Math.min(1, Math.abs(z)), -0.4, 0.4);
  }
}
