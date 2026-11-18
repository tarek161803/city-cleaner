import * as THREE from 'three';
import type { Input } from '../core/Input';
import { clamp, damp } from '../core/math';
import type { City } from '../world/City';

const SENSITIVITY = 0.0024;
const DISTANCE = 5.2;
const SHOULDER = 0.55;
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Over-the-shoulder orbit camera that pulls in instead of clipping into buildings or the ground. */
export class ThirdPersonCamera {
  /** Camera looks along (sin yaw, 0, cos yaw). */
  yaw = 0;
  /** Positive pitch = camera above the player looking down. */
  pitch = 0.3;
  private dist = DISTANCE;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  update(dt: number, input: Input, target: THREE.Vector3, city: City, shake: THREE.Vector3) {
    this.yaw -= input.mouseDX * SENSITIVITY;
    this.pitch += input.mouseDY * SENSITIVITY;
    this.pitch = clamp(this.pitch, -0.35, 1.2);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    _pivot.set(target.x - fz * SHOULDER, target.y + 1.75, target.z + fx * SHOULDER);
    _dir.set(-fx * Math.cos(this.pitch), Math.sin(this.pitch), -fz * Math.cos(this.pitch));

    let want = DISTANCE;
    for (let t = 0.4; t <= DISTANCE; t += 0.2) {
      _p.copy(_pivot).addScaledVector(_dir, t);
      if (_p.y < city.heightAt(_p.x, _p.z) + 0.35 || city.solidAt(_p.x, _p.y, _p.z)) {
        want = Math.max(0.6, t - 0.35);
        break;
      }
    }
    this.dist = want < this.dist ? want : damp(this.dist, want, 4, dt);

    this.camera.position.copy(_pivot).addScaledVector(_dir, this.dist).add(shake);
    this.camera.lookAt(_pivot);
  }
}
