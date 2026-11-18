import * as THREE from 'three';
import { Actor } from '../core/Actor';
import type { HumanRig } from '../core/HumanRig';
import type { Input } from '../core/Input';
import { clamp, damp, turnToward, wrapAngle } from '../core/math';
import { GUARD_POSE, PLAYER_HEAVY, PLAYER_LIGHTS, type AttackDef } from '../combat/ComboSystem';
import type { City } from '../world/City';

const RUN_SPEED = 5.5;
const SPRINT_SPEED = 8.5;
const _wish = new THREE.Vector3();

export class Player extends Actor {
  private comboIndex = 0;
  /** Set on the frame a swing begins (for the whoosh). */
  swung = false;
  private wasGrounded = true;
  private lastSpeed = 0;
  /** Staggered after being shoved: no control briefly. */
  private stunT = 0;

  constructor(rig: HumanRig) {
    super(rig);
    this.radius = 0.4;
  }

  update(
    dt: number,
    input: Input,
    camYaw: number,
    city: City,
    others: readonly Actor[],
  ) {

    // Camera-relative input. Camera forward is (sin yaw, 0, cos yaw); its right is (-cos yaw, 0, sin yaw).
    const ix = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const iz = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    _wish
      .set(Math.sin(camYaw) * iz - Math.cos(camYaw) * ix, 0, Math.cos(camYaw) * iz + Math.sin(camYaw) * ix)
      .normalize();
    this.stunT -= dt;
    if (this.stunT > 0) _wish.set(0, 0, 0);
    const hasWish = _wish.lengthSq() > 0;

    if (this.stunT <= 0) this.tryAttack(input, hasWish);

    // Horizontal movement.
    const sprinting = input.down('ShiftLeft') && hasWish && !this.attack.def;
    const speed = this.attack.def ? 0.8 : sprinting ? SPRINT_SPEED : RUN_SPEED;
    const tx = _wish.x * speed, tz = _wish.z * speed;
    // Weight: build up speed gradually, brake a bit quicker, and brake hard when reversing.
    const cur = Math.hypot(this.vel.x, this.vel.z), want = Math.hypot(tx, tz);
    const reversing = this.vel.x * tx + this.vel.z * tz < 0;
    const accel = !this.grounded ? 2.5 : reversing ? 11 : want > cur ? 6.5 : 9;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.z = damp(this.vel.z, tz, accel, dt);

    // Facing: toward movement when not committed to a swing.
    // The faster you go, the wider you turn.
    const prevFacing = this.facing;
    const turnRate = 13 - 8 * Math.min(1, cur / SPRINT_SPEED);
    if (!this.attack.def && hasWish) {
      this.facing = turnToward(this.facing, Math.atan2(_wish.x, _wish.z), turnRate * dt);
    }

    if (input.wasPressed('Space') && this.grounded && !this.attack.def) {
      this.vel.y = 7.5;
      this.grounded = false;
    }

    this.updatePose(dt, GUARD_POSE);
    this.integrate(dt, city, others);

    // Body language: lean into turns, crouch to wind up a swing, tuck in the air, squash on landing.
    const rig = this.rig;
    if (dt > 0) {
      const turnVel = wrapAngle(this.facing - prevFacing) / dt;
      rig.turnLean = damp(rig.turnLean, clamp(-turnVel * cur * 0.025, -0.22, 0.22), 8, dt);
      // Feed the hammer's inertia: how fast we turn and how hard we speed up or brake.
      const speedNow = Math.hypot(this.vel.x, this.vel.z);
      rig.turnRate = damp(rig.turnRate, turnVel, 12, dt);
      rig.forwardAccel = damp(rig.forwardAccel, (speedNow - this.lastSpeed) / dt, 10, dt);
      this.lastSpeed = speedNow;
    }
    rig.carry = damp(rig.carry, this.attack.def ? 0 : 1, this.attack.def ? 14 : 4, dt);
    const a = this.attack;
    const brace = a.phase === 'windup' ? Math.min(1, a.t / a.def!.activeStart) : 0;
    rig.crouch = damp(rig.crouch, brace * (a.def?.name === 'heavy' || a.def?.name === 'light3' ? 1 : 0.5), 12, dt);
    rig.airborne = !this.grounded;
    if (this.grounded && !this.wasGrounded) rig.land();
    this.wasGrounded = this.grounded;
    this.syncRig(dt);
  }

  /** Pushed back by a defending owner: knocked away and the swing is interrupted. */
  shove(from: THREE.Vector3) {
    this.knock.set(this.pos.x - from.x, 0, this.pos.z - from.z).setLength(7);
    this.attack.cancel();
    this.stunT = 0.45;
  }

  private tryAttack(input: Input, hasWish: boolean) {
    const action = input.peekAction();
    if (!action || (this.attack.def && !this.attack.inComboWindow)) return;
    input.consumeAction();
    let def: AttackDef;
    if (action === 'light') {
      const chaining = this.attack.def?.name.startsWith('light');
      this.comboIndex = chaining ? (this.comboIndex + 1) % PLAYER_LIGHTS.length : 0;
      def = PLAYER_LIGHTS[this.comboIndex];
    } else {
      def = PLAYER_HEAVY;
    }
    if (hasWish) this.facing = Math.atan2(_wish.x, _wish.z);
    this.attack.start(def, this.rig.pose);
    this.swung = true;
  }
}
