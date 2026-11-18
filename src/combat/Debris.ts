import * as THREE from 'three';
import type { Part } from '../city/Parts';
import { rand } from '../core/math';

const MAX_PIECES = 36;
const GRAVITY = 18;

interface Piece {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

/** A wheel that came off: rolls along, leans, curves toward the lean and falls flat. */
interface LooseWheel {
  mesh: THREE.Mesh;
  radius: number;
  /** Heading, lean (0 upright, ±π/2 flat on its side) and how far it has rolled about its axle. */
  yaw: number;
  lean: number;
  leanVel: number;
  roll: number;
  /** Signed speed along the heading, and vertical speed. */
  speed: number;
  vy: number;
  life: number;
}

const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _e = new THREE.Euler();

/** A smashed prop falls apart into its actual parts, which tumble, settle and shrink away. */
export class Debris {
  private pieces: Piece[] = [];
  private wheels: LooseWheel[] = [];
  private materials = new Map<number, THREE.MeshStandardMaterial>();

  constructor(
    private scene: THREE.Scene,
    private groundAt: (x: number, z: number) => number,
  ) {}

  /** `lift` is the range of upward launch speeds: a blown-apart prop flies, a knocked-off piece just drops. */
  explode(parts: Part[], object: THREE.Object3D, from: THREE.Vector3, force: number, lift: [number, number] = [2.5, 7]) {
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(_q);
    const chosen = [...parts].sort((a, b) => b.size - a.size).slice(0, MAX_PIECES);
    for (const p of chosen) {
      const mesh = new THREE.Mesh(p.geo, this.material(p.color));
      mesh.position.copy(p.center).applyMatrix4(object.matrixWorld);
      mesh.quaternion.copy(_q).multiply(p.quat);
      mesh.castShadow = true;
      const vel = new THREE.Vector3(mesh.position.x - from.x, 0, mesh.position.z - from.z);
      if (vel.lengthSq() < 1e-4) vel.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      vel.normalize().multiplyScalar(force * rand(0.4, 1.2));
      vel.y = rand(...lift);
      // Big heavy pieces fly slower and tumble less than small bits.
      const heavy = Math.min(1, p.size / 1.5);
      vel.multiplyScalar(1 - heavy * 0.5);
      const spin = new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)).multiplyScalar(1 - heavy * 0.6);
      this.pieces.push({ mesh, vel, spin, life: rand(4.5, 6.5) });
      this.scene.add(mesh);
    }
  }

  /**
   * A copy of `wheel` (axle along its local X) pops off and rolls away, forward or back along
   * `heading` (the vehicle's yaw), wobbling until it falls over.
   */
  rollWheel(wheel: THREE.Mesh, radius: number, heading: number) {
    wheel.updateWorldMatrix(true, false);
    const mesh = new THREE.Mesh(wheel.geometry, wheel.material);
    wheel.getWorldPosition(mesh.position);
    mesh.castShadow = true;
    this.wheels.push({
      mesh,
      radius,
      yaw: heading + rand(-0.5, 0.5),
      lean: (Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.15),
      leanVel: 0,
      roll: 0,
      speed: (Math.random() < 0.5 ? -1 : 1) * rand(2.5, 4.5),
      vy: rand(1, 2.5),
      life: rand(7, 9),
    });
    this.scene.add(mesh);
  }

  private updateWheels(dt: number) {
    for (let i = this.wheels.length - 1; i >= 0; i--) {
      const w = this.wheels[i];
      const m = w.mesh;
      w.life -= dt;
      if (w.life <= 0) {
        this.scene.remove(m);
        this.wheels.splice(i, 1);
        continue;
      }
      const flat = Math.abs(w.lean) >= Math.PI / 2 - 1e-3;
      if (!flat) {
        // Falls over like an inverted pendulum; spinning fast holds it up a while (gyroscopic).
        w.leanVel += (14 * Math.sin(w.lean)) / (1 + Math.abs(w.speed) * 0.8) * dt;
        w.lean += w.leanVel * dt;
        if (Math.abs(w.lean) >= Math.PI / 2) {
          w.lean = Math.sign(w.lean) * (Math.PI / 2);
          w.leanVel = 0;
        }
        // A leaning wheel curves toward the side it leans to.
        w.yaw += w.lean * w.speed * 0.6 * dt;
      }
      w.speed *= Math.exp(-(flat ? 6 : 0.6) * dt);
      w.roll += (w.speed / w.radius) * dt;
      m.position.x += Math.sin(w.yaw) * w.speed * dt;
      m.position.z += Math.cos(w.yaw) * w.speed * dt;
      w.vy -= GRAVITY * dt;
      m.position.y += w.vy * dt;
      // Upright it stands on its rim; lying flat, on its side.
      const ground = this.groundAt(m.position.x, m.position.z) + Math.max(0.04, w.radius * Math.cos(w.lean));
      if (m.position.y < ground) {
        m.position.y = ground;
        w.vy = w.vy < -1.5 ? w.vy * -0.3 : 0;
      }
      m.rotation.set(w.roll, w.yaw, w.lean, 'YZX');
      m.scale.setScalar(Math.min(1, w.life / 0.5));
    }
  }

  update(dt: number) {
    this.updateWheels(dt);
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      const m = p.mesh;
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(m);
        this.pieces.splice(i, 1);
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(p.vel, dt);
      _dq.setFromEuler(_e.set(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt));
      m.quaternion.multiply(_dq);
      const ground = this.groundAt(m.position.x, m.position.z) + 0.05;
      if (m.position.y < ground) {
        m.position.y = ground;
        if (p.vel.y < -1.5) {
          // Bounce, losing most of the energy.
          p.vel.y *= -0.3;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
          p.spin.multiplyScalar(0.6);
        } else {
          // Resting on the ground: scrape to a stop.
          p.vel.y = 0;
          const f = Math.exp(-7 * dt);
          p.vel.x *= f;
          p.vel.z *= f;
          p.spin.multiplyScalar(Math.exp(-9 * dt));
        }
      }
      // Disappear: shrink away over the last half second.
      m.scale.setScalar(Math.min(1, p.life / 0.5));
    }
  }

  private material(color: number) {
    let m = this.materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
      this.materials.set(color, m);
    }
    return m;
  }
}
