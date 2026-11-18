import * as THREE from 'three';
import { AttackRunner, lerpPose, type Pose } from '../combat/ComboSystem';
import { WORLD_HALF, type City } from '../world/City';
import type { HumanRig } from './HumanRig';

const GRAVITY = 25;

/** Shared movement/collision for the player and pedestrians. */
export abstract class Actor {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly knock = new THREE.Vector3();
  readonly attack = new AttackRunner();
  facing = 0;
  radius = 0.35;
  grounded = true;

  constructor(readonly rig: HumanRig) {}

  forward(out: THREE.Vector3) {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  angleTo(p: THREE.Vector3) {
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  distTo(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  protected updatePose(dt: number, idle: Pose) {
    if (this.attack.def) this.attack.update(dt, this.rig.pose);
    else {
      this.attack.activeThisFrame = false;
      lerpPose(this.rig.pose, this.rig.pose, idle, 1 - Math.exp(-12 * dt));
    }
  }

  protected integrate(dt: number, city: City, others: readonly Actor[]) {
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt).addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-7 * dt));

    city.pushOut(this.pos, this.radius);
    for (const o of others) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const min = o.radius + this.radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        const push = (min - d) * 0.5;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -WORLD_HALF, WORLD_HALF);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -WORLD_HALF, WORLD_HALF);

    const ground = city.heightAt(this.pos.x, this.pos.z);
    // Snap down kerbs while walking, but not while rising from a jump.
    if (this.pos.y <= ground || (this.grounded && this.vel.y <= 0 && this.pos.y - ground < 0.4)) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  protected syncRig(dt: number, speed = Math.hypot(this.vel.x, this.vel.z)) {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    this.rig.update(dt, speed);
  }
}
