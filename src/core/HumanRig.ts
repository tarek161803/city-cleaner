import * as THREE from 'three';
import { GUARD_POSE, type Pose } from '../combat/ComboSystem';
import { Hammer } from '../combat/Hammer';
import { Trail } from '../combat/Feel';
import { clamp } from './math';
import { buildArm, buildCarry, buildLeg, buildTorso, FORE, HIP_Y, KNEE, UPPER, type Carry, type Look } from './Outfit';

export type { Look } from './Outfit';

const HIP_X = 0.1;
const SHOULDER_Y = 1.45;
const SHOULDER_X = 0.24;
/** The hammer swings around the right shoulder (character space, right side is -X). */
const PIVOT = new THREE.Vector3(-0.2, 1.4, 0.05);
/** Mid-swing the hands come together, so the swing pivot moves in toward the chest centre. */
const PIVOT_X_TWO_HANDED = -0.05;
/** Where the left hand grips the handle (hammer local Z, below the right hand at the knob end). */
const LEFT_GRIP_Z = -0.13;
/** Shoulder-to-hand distance along the swing. */
const GRIP_REACH = 0.45;
const DOWN = new THREE.Vector3(0, -1, 0);

const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _h = new THREE.Vector3();
const _bend = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);

interface Arm {
  side: 1 | -1;
  upper: THREE.Mesh;
  /** Only the player has separate forearms (for IK onto the hammer). */
  fore: THREE.Mesh | null;
}

/**
 * Procedural low-poly person: boxes and cylinders, animated in code (walk, run, ride, panic,
 * and two-bone arm IK onto the hammer for the player).
 */
export class HumanRig {
  readonly root = new THREE.Group();
  /** Internal animation bob/lean. */
  readonly body = new THREE.Group();
  /** Hip joint: the upper body (torso, arms, hammer) bends here while the legs stay planted. */
  readonly spine = new THREE.Group();
  /** Upper-body frame inside the spine, offset back down so its children keep body coordinates. */
  private chest = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly weapon: Hammer | null = null;
  readonly trail: Trail | null = null;
  readonly pose: Pose = { ...GUARD_POSE };
  seated = false;
  /** Seated on a low stool: knees up, forearms resting on them. */
  stool = false;
  panic = false;
  /** Arguing: jabbing finger, waving the other arm. */
  argue = false;
  /** Holding the right hand out: paying, or handing something over. */
  reach = false;
  /** Right hand up and waving: a hawker calling out. */
  hail = false;
  /** Something bought, hanging from the left hand. */
  private carried: THREE.Mesh | null = null;
  /** Player only: in the air (legs tucked). */
  airborne = false;
  /** Player only: sideways lean into turns (radians). */
  turnLean = 0;
  /** Player only: 0..1 crouch, e.g. bracing for a heavy swing. */
  crouch = 0;
  /** True on the frame a foot hits the ground (for footstep sounds). */
  stepped = false;
  /** Player only: how hard the body is turning (rad/s) and speeding up/slowing down (m/s²). */
  turnRate = 0;
  forwardAccel = 0;
  /** Player only: 1 while carrying, 0 mid-swing (the swing itself drives the hammer then). */
  carry = 1;
  /** Hammer inertia: a sprung lag on the carried hammer (yaw, pitch and their velocities). */
  private lag = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  /** Impact kick-back on the swing pivot, sprung back to zero. */
  private kick = { x: 0, v: 0 };
  private dipT = 0;
  private torso: THREE.Mesh;
  private arms: Arm[] = [];
  private legs: THREE.Mesh[] = [];
  /** Player only: shins hanging from the knees. */
  private shins: THREE.Mesh[] = [];
  private phase = Math.random() * 10;
  private t = Math.random() * 10;
  private landT = 0;
  private gait = 0;

  constructor(look: Look, opts: { weapon?: { trailColor: THREE.Color }; knees?: boolean } = {}) {
    this.root.add(this.body);
    this.spine.position.y = HIP_Y;
    this.chest.position.y = -HIP_Y;
    this.spine.add(this.chest);
    this.body.add(this.spine);
    this.torso = buildTorso(look);
    this.chest.add(this.torso);

    const knees = !!opts.weapon || !!opts.knees;
    for (const side of [1, -1] as const) {
      // The player and shopkeepers get a knee joint; everyone else keeps a cheap one-piece leg.
      const leg = buildLeg(look, knees ? 'thigh' : 'whole');
      leg.position.set(side * HIP_X, HIP_Y, 0);
      this.legs.push(leg);
      this.body.add(leg);
      if (knees) {
        const shin = buildLeg(look, 'shin');
        shin.position.y = -KNEE;
        leg.add(shin);
        this.shins.push(shin);
      }

      const split = !!opts.weapon;
      const upper = buildArm(look, split ? 'upper' : 'whole');
      upper.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      this.chest.add(upper);
      let fore: THREE.Mesh | null = null;
      if (split) {
        fore = buildArm(look, 'fore');
        this.chest.add(fore);
      }
      this.arms.push({ side, upper, fore });
    }

    if (opts.weapon) {
      this.pivot.position.copy(PIVOT);
      this.chest.add(this.pivot);
      this.weapon = new Hammer();
      this.weapon.object.position.z = GRIP_REACH;
      this.pivot.add(this.weapon.object);
      this.trail = new Trail(opts.weapon.trailColor);
    }
  }

  /** Carry a bag (or cone) in the left hand; null puts it away. Pedestrians only (one-piece arms). */
  holdItem(kind: Carry | null, color = 0xffffff) {
    const arm = this.arms.find((a) => a.side > 0)!;
    if (this.carried) {
      arm.upper.remove(this.carried);
      this.carried.geometry.dispose();
      this.carried = null;
    }
    if (!kind || arm.fore) return;
    this.carried = buildCarry(kind, color);
    // At the hand, below the forearm.
    this.carried.position.y = -UPPER - FORE - 0.04;
    arm.upper.add(this.carried);
  }

  /** Landed from a jump: brief squash. */
  land() {
    this.landT = 0.18;
  }

  /** The hammer struck something: it kicks back and the body sags under the blow. */
  impact(strength: number) {
    this.kick.v -= 7 * strength;
    this.dipT = Math.max(this.dipT, 0.12 * strength);
  }

  update(dt: number, speed: number) {
    this.t += dt;
    // Cadence and stride both grow with speed: about 1.7 steps/s walking, 3+ when running.
    const stepLen = 0.6 + speed * 0.2;
    const prev = this.phase;
    if (speed > 0.15) this.phase += dt * Math.PI * (speed / stepLen);
    this.stepped = Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    // Ease the gait in and out so starting and stopping doesn't snap.
    this.gait += (Math.min(1, speed / 1.2) - this.gait) * Math.min(1, dt * 8);
    const hipAmp = Math.min(0.7, 0.18 + speed * 0.09) * this.gait;
    this.landT = Math.max(0, this.landT - dt);
    this.dipT = Math.max(0, this.dipT - dt * 0.6);
    if (this.weapon) this.updateHammerInertia(dt);

    if (this.seated && this.stool) {
      // Low stool: the upper body leans over the goods at the hips (below). With knees: thighs a
      // little above level, shins hanging straight down to the feet. Without: legs angled to the ground.
      if (this.shins.length) {
        for (const [i, leg] of this.legs.entries()) leg.rotation.set(-1.65, 0, i === 0 ? 0.14 : -0.14);
        for (const shin of this.shins) shin.rotation.x = 1.55;
      } else {
        this.legs[0].rotation.set(-1.15, 0, 0.18);
        this.legs[1].rotation.set(-1.15, 0, -0.18);
      }
      this.body.position.y = 0;
      this.body.rotation.set(0, 0, 0);
    } else if (this.seated) {
      // Driving: feet resting on the footrest, hands on the handlebar.
      this.legs[0].rotation.set(-0.6, 0, 0.05);
      this.legs[1].rotation.set(-0.6, 0, -0.05);
      this.body.position.y = 0;
      this.body.rotation.set(0.15, 0, 0);
    } else if (this.airborne) {
      // Jumping: knees tucked.
      for (const [i, leg] of this.legs.entries()) leg.rotation.set(-0.55 - i * 0.15, 0, 0);
      for (const shin of this.shins) shin.rotation.x = 1.0;
      this.body.position.y = 0;
      this.body.rotation.set(0.12, 0, this.turnLean);
    } else {
      // Walk/run cycle: legs swing in opposition, knees bend through the swing phase.
      const knee = Math.min(1.35, 0.3 + speed * 0.16) * this.gait;
      for (const [i, leg] of this.legs.entries()) {
        const sn = i === 0 ? s : -s, cs = i === 0 ? c : -c;
        leg.rotation.set(-hipAmp * sn - this.crouch * 0.35, 0, 0);
        if (this.shins[i]) this.shins[i].rotation.x = knee * Math.max(0, cs) + 0.08 * this.gait + this.crouch * 0.6;
      }
      // Bob (highest at mid-stance), forward lean with speed, hip sway, lean into turns.
      const bob = Math.min(0.045, speed * 0.008) * this.gait * Math.cos(2 * this.phase);
      this.body.position.y = bob - this.crouch * 0.08 - this.landT * 0.4 - this.dipT;
      this.body.rotation.set(Math.min(0.2, speed * 0.022) + this.crouch * 0.12, 0, s * 0.03 * this.gait + this.turnLean);
    }
    // Idle breathing.
    this.torso.scale.y = 1 + Math.sin(this.t * 1.8) * 0.008 * (1 - this.gait);

    if (this.weapon) {
      this.updateWeaponArms(s, hipAmp);
    } else {
      this.spine.rotation.x = this.seated && this.stool ? 0.3 : 0;
      for (const [i, arm] of this.arms.entries()) {
        let x: number, z: number;
        if (this.reach && arm.side < 0) {
          x = -1.25;
          z = 0.05;
        } else if (this.hail && arm.side < 0) {
          x = -2.4 + Math.sin(this.t * 9) * 0.25;
          z = 0.3;
        } else if (this.seated && this.stool) {
          // Forearms on the knees, one hand reaching a little toward the goods.
          x = i === 0 ? -0.7 : -0.55 + Math.sin(this.t * 0.7) * 0.08;
          z = 0.18;
        } else if (this.seated) {
          x = -0.95;
          z = 0.1;
        } else if (this.argue) {
          x = i === 0 ? -1.45 + Math.sin(this.t * 11) * 0.3 : -2.3 + Math.sin(this.t * 6 + 1) * 0.6;
          z = i === 0 ? 0.1 : 0.4;
        } else if (this.panic) {
          // Hands up, flailing.
          x = -2.7 + Math.sin(this.t * 14 + i * Math.PI) * 0.35;
          z = 0.35;
        } else {
          // Arms swing opposite to the legs (less with a bag in hand), a little out from the side to hold it clear.
          const loaded = arm.side > 0 && this.carried;
          x = (i === 0 ? s : -s) * hipAmp * (loaded ? 0.45 : 0.85) - 0.05;
          z = loaded ? 0.14 : 0.08;
        }
        arm.upper.rotation.set(x, 0, arm.side * z);
        // Whatever is carried keeps hanging straight down as the arm swings.
        if (arm.side > 0 && this.carried) this.carried.rotation.set(-x, 0, -arm.side * z, 'ZYX');
      }
    }
    this.root.updateMatrixWorld(true);
  }

  /**
   * The carried hammer has mass: it lags behind turns, rocks back when accelerating and forward when
   * braking, and bounces on the shoulder with every step. Under-damped springs give it a little sway.
   */
  private updateHammerInertia(dt: number) {
    if (dt <= 0) return;
    const l = this.lag;
    if (this.stepped) l.vp += 0.9 * this.gait;
    const ty = THREE.MathUtils.clamp(-this.turnRate * 0.09, -0.45, 0.45);
    const tp = THREE.MathUtils.clamp(-this.forwardAccel * 0.025, -0.25, 0.25);
    const K = 70, C = 8;
    l.vy += (K * (ty - l.yaw) - C * l.vy) * dt;
    l.vp += (K * (tp - l.pitch) - C * l.vp) * dt;
    l.yaw += l.vy * dt;
    l.pitch += l.vp * dt;
    const k = this.kick;
    k.v += (-90 * k.x - 11 * k.v) * dt;
    k.x += k.v * dt;
  }

  /**
   * The right hand follows the grip via analytic two-bone IK; the left arm swings free while carrying
   * and joins the right hand on the handle (also IK) for the swing itself.
   */
  private updateWeaponArms(stride: number, hipAmp: number) {
    const p = this.pose;
    const w = this.weapon!;
    // Torso throws its weight into the swing, plus a little shoulder counter-rotation while walking.
    const twist = clamp(p.yaw * 0.42, -0.75, 0.75) + stride * 0.07 * this.gait;
    this.torso.rotation.y = twist;
    const lag = this.lag, c = this.carry;
    // Mid-swing (c → 0): bend at the hips. Lean back a touch on the wind-up, fold forward over the
    // strike as the hammer comes down, plus a slight athletic hunch throughout.
    const two = 1 - c;
    const bend = clamp(p.pitch > 0 ? p.pitch * 0.38 : p.pitch * 0.06, -0.15, 0.45) + 0.06;
    this.spine.rotation.set(bend * two, twist * 0.25 * two, 0);
    this.pivot.position.x = PIVOT.x + (PIVOT_X_TWO_HANDED - PIVOT.x) * two;
    this.pivot.rotation.set(p.pitch + this.kick.x, p.yaw + lag.yaw * c, p.roll, 'YXZ');
    w.object.rotation.set(p.wristPitch + lag.pitch * c, p.wristYaw + lag.yaw * 0.5 * c, 0, 'YXZ');
    this.pivot.updateMatrix();
    w.object.updateMatrix();
    const swing = clamp(Math.abs(p.yaw - GUARD_POSE.yaw) * 0.25, 0, 0.6);
    for (const arm of this.arms) {
      _s.set(arm.side * SHOULDER_X, SHOULDER_Y, 0).applyAxisAngle(_p.set(0, 1, 0), twist);
      if (arm.side < 0) {
        _t.set(0, 0, 0).applyMatrix4(w.object.matrix).applyMatrix4(this.pivot.matrix);
        solveArm(arm, _s, _t, _p.set(-1, -0.6, -0.4).normalize());
      } else {
        // Left arm: swings free while carrying, and grabs the handle below the right hand to swing two-handed.
        poseArm(arm, _s, stride * hipAmp * 0.9 - 0.08 - swing * 0.5, 0.1 + swing, 0.25 + swing * 0.6);
        if (two > 0.01) {
          _h.set(0, -FORE, 0).applyQuaternion(arm.fore!.quaternion).add(arm.fore!.position);
          _t.set(0, 0, LEFT_GRIP_Z).applyMatrix4(w.object.matrix).applyMatrix4(this.pivot.matrix);
          _h.lerp(_t, two);
          solveArm(arm, _s, _h, _p.set(1, -0.6, -0.4).normalize());
        }
      }
    }
  }
}

/** Free arm in two parts: upper arm rotated at the shoulder, forearm hung from the elbow with a bend. */
function poseArm(arm: Arm, shoulder: THREE.Vector3, swingX: number, spread: number, bend: number) {
  arm.upper.position.copy(shoulder);
  arm.upper.rotation.set(swingX, 0, arm.side * spread);
  arm.upper.updateMatrix();
  _e.set(0, -UPPER, 0).applyQuaternion(arm.upper.quaternion).add(shoulder);
  arm.fore!.position.copy(_e);
  arm.fore!.quaternion.copy(arm.upper.quaternion).multiply(_bend.setFromAxisAngle(_x, -bend));
}

function solveArm(arm: Arm, shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3) {
  const dist = _d.subVectors(target, shoulder).length();
  const dir = _d.divideScalar(Math.max(dist, 1e-4));
  const d = clamp(dist, 0.1, UPPER + FORE - 0.001);
  const a = Math.acos(clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
  const perp = _p.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  _e.copy(shoulder).addScaledVector(dir, Math.cos(a) * UPPER).addScaledVector(perp, Math.sin(a) * UPPER);
  arm.upper.position.copy(shoulder);
  arm.upper.quaternion.setFromUnitVectors(DOWN, _t.subVectors(_e, shoulder).normalize());
  const hand = _t.copy(shoulder).addScaledVector(dir, d);
  arm.fore!.position.copy(_e);
  arm.fore!.quaternion.setFromUnitVectors(DOWN, hand.sub(_e).normalize());
}
