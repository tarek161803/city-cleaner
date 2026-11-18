import { wrapAngle } from '../core/math';

/**
 * Weapon pose, all in the character's local frame (character faces +Z, its right side is -X).
 * yaw/pitch/roll rotate the arm pivot at the chest; wrist rotates the hammer around the grip.
 * Negative pitch raises the hammer; positive yaw swings it toward the character's left.
 */
export interface Pose {
  yaw: number;
  pitch: number;
  roll: number;
  wristYaw: number;
  wristPitch: number;
}

const P = (yaw: number, pitch: number, roll: number, wristYaw = 0, wristPitch = 0): Pose => ({
  yaw,
  pitch,
  roll,
  wristYaw,
  wristPitch,
});

/**
 * Carrying pose (standing, walking, running): right hand in front of the chest, the handle lying back
 * over the right shoulder, the head resting behind it.
 */
export const GUARD_POSE = P(-0.1, 0.1, 0, -0.03, -2.92);

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number) {
  out.yaw = a.yaw + (b.yaw - a.yaw) * t;
  out.pitch = a.pitch + (b.pitch - a.pitch) * t;
  out.roll = a.roll + (b.roll - a.roll) * t;
  out.wristYaw = a.wristYaw + (b.wristYaw - a.wristYaw) * t;
  out.wristPitch = a.wristPitch + (b.wristPitch - a.wristPitch) * t;
  return out;
}

interface Key {
  t: number;
  pose: Pose;
  /** 'in' = accelerating (a heavy strike), 'out' = decelerating (follow-through), default ease in-out. */
  ease?: 'in' | 'out' | 'inout';
}

export interface AttackDef {
  name: string;
  keys: Key[];
  activeStart: number;
  activeEnd: number;
  duration: number;
  /** From this time a buffered input chains into the next attack. */
  comboFrom: number;
  damage: number;
  hitStop: number;
  shake: number;
  /** Ground-slam radius: everything this close to the head when the swing lands also takes damage. */
  shockwave?: number;
}

const TAU = Math.PI * 2;
/** No extra roll needed: the head already stands in the swing plane, so its face leads a vertical chop. */
const FACE = 0;
/** Overall swing tempo: < 1 is snappier. Applied to every key time and window below. */
const SWING_TIME = 0.8;
const tempo = (d: AttackDef): AttackDef => ({
  ...d,
  keys: d.keys.map((k) => ({ ...k, t: k.t * SWING_TIME })),
  activeStart: d.activeStart * SWING_TIME,
  activeEnd: d.activeEnd * SWING_TIME,
  duration: d.duration * SWING_TIME,
  comboFrom: d.comboFrom * SWING_TIME,
});

/*
 * Heavy-hammer timing: a slow, effortful wind-up ('inout'), a strike that accelerates into the
 * target ('in'), momentum carrying it past ('out' follow-through), then a slow haul back to the shoulder.
 */
export const PLAYER_LIGHTS: AttackDef[] = ([
  {
    // Woodchopper: hauled up over the right shoulder, chopped down diagonally in front.
    name: 'light1',
    keys: [
      { t: 0.3, pose: P(-0.7, -2.0, FACE, 0, -0.5) },
      { t: 0.44, pose: P(0.3, 0.85, FACE, 0, 0.25), ease: 'in' },
      { t: 0.64, pose: P(0.42, 1.15, FACE, 0, 0.35), ease: 'out' },
      { t: 1.05, pose: GUARD_POSE },
    ],
    activeStart: 0.3, activeEnd: 0.46, duration: 1.05, comboFrom: 0.56,
    damage: 20, hitStop: 0.09, shake: 0.32,
  },
  {
    // Straight overhead chop.
    name: 'light2',
    keys: [
      { t: 0.28, pose: P(-0.15, -2.4, FACE, 0, -0.6) },
      { t: 0.42, pose: P(0, 0.9, FACE, 0, 0.2), ease: 'in' },
      { t: 0.62, pose: P(0, 1.12, FACE, 0, 0.3), ease: 'out' },
      { t: 1.0, pose: GUARD_POSE },
    ],
    activeStart: 0.28, activeEnd: 0.44, duration: 1.0, comboFrom: 0.54,
    damage: 20, hitStop: 0.09, shake: 0.32,
  },
  {
    // Overhead ground slam: hauled high, driven down, sticks in the ground, rebounds.
    name: 'light3',
    keys: [
      { t: 0.44, pose: P(-0.1, -1.75, FACE, 0, -1.1) },
      { t: 0.56, pose: P(0, 0.95, FACE, 0, 0.2), ease: 'in' },
      { t: 0.66, pose: P(0, 0.72, FACE, 0, 0.1), ease: 'out' },
      { t: 0.86, pose: P(0, 0.98, FACE, 0, 0.2) },
      { t: 1.3, pose: GUARD_POSE },
    ],
    activeStart: 0.44, activeEnd: 0.57, duration: 1.3, comboFrom: 0.95,
    damage: 24, hitStop: 0.14, shake: 0.7, shockwave: 3.2,
  },
] as AttackDef[]).map(tempo);

/** Wide spinning sweep that hits everything around the player; its momentum overshoots before recovering. */
export const PLAYER_HEAVY: AttackDef = tempo({
  name: 'heavy',
  keys: [
    { t: 0.58, pose: P(-2.55, 0, -1.5, -0.45) },
    { t: 0.98, pose: P(4.1, 0.15, -1.5, 0.4), ease: 'in' },
    { t: 1.28, pose: P(5.0, 0.3, -1.5, 0.5), ease: 'out' },
    { t: 1.65, pose: { ...GUARD_POSE, yaw: GUARD_POSE.yaw + TAU } },
  ],
  activeStart: 0.58, activeEnd: 1.0, duration: 1.65, comboFrom: 1.35,
  damage: 24, hitStop: 0.15, shake: 0.75,
});

export type Phase = 'windup' | 'active' | 'recovery';

export class AttackRunner {
  def: AttackDef | null = null;
  t = 0;
  readonly hitSet = new Set<unknown>();
  /** True if the active window overlapped this frame's time step, even when dt skipped past it. */
  activeThisFrame = false;
  private keys: Key[] = [];
  /** Set when the hammer bounced off something: the swing is over, it's coming back. */
  private bounced = false;
  private endT = 0;
  private chainT = 0;

  start(def: AttackDef, from: Pose) {
    this.def = def;
    this.t = 0;
    this.hitSet.clear();
    this.keys = [{ t: 0, pose: { ...from } }, ...def.keys];
    this.bounced = false;
    this.endT = def.duration;
    this.chainT = def.comboFrom;
  }

  /**
   * The hammer hit something solid that didn't give way: stop the sweep where it struck, bounce back a
   * little against the swing, then return to the shoulder. The next swing can chain in sooner.
   */
  rebound(at: Pose) {
    const d = this.def;
    if (!d || this.bounced) return;
    // Which way was the swing travelling? (Compare the strike key with the one before it.)
    const strike = d.keys.findIndex((k) => k.ease === 'in');
    const from = strike > 0 ? d.keys[strike - 1].pose : at;
    const to = strike >= 0 ? d.keys[strike].pose : at;
    const back: Pose = {
      ...at,
      yaw: at.yaw - Math.sign(to.yaw - from.yaw) * 0.35,
      pitch: at.pitch - Math.sign(to.pitch - from.pitch) * 0.3,
    };
    const t = this.t;
    this.keys = [
      { t, pose: { ...at } },
      { t: t + 0.09, pose: back, ease: 'out' },
      { t: t + 0.42, pose: GUARD_POSE },
    ];
    this.bounced = true;
    this.endT = t + 0.42;
    this.chainT = t + 0.14;
  }

  cancel() {
    this.def = null;
    this.activeThisFrame = false;
  }

  get phase(): Phase | null {
    const d = this.def;
    if (!d) return null;
    if (this.bounced) return 'recovery';
    return this.t < d.activeStart ? 'windup' : this.t < d.activeEnd ? 'active' : 'recovery';
  }

  get inComboWindow() {
    return !!this.def && this.t >= this.chainT;
  }

  update(dt: number, out: Pose) {
    const d = this.def;
    this.activeThisFrame = false;
    if (!d) return;
    const prev = this.t;
    this.t += dt;
    this.activeThisFrame = !this.bounced && prev < d.activeEnd && this.t >= d.activeStart;
    if (this.t >= this.endT) {
      Object.assign(out, this.keys[this.keys.length - 1].pose);
      out.yaw = wrapAngle(out.yaw);
      this.def = null;
      return;
    }
    let i = 0;
    while (i < this.keys.length - 2 && this.keys[i + 1].t <= this.t) i++;
    const k0 = this.keys[i], k1 = this.keys[i + 1];
    let u = Math.min(1, (this.t - k0.t) / Math.max(1e-4, k1.t - k0.t));
    u = k1.ease === 'in' ? Math.pow(u, 2.2) : k1.ease === 'out' ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u);
    lerpPose(out, k0.pose, k1.pose, u);
  }
}
