import * as THREE from 'three';
import { PartsBuilder } from '../city/Parts';

const Q = Math.PI / 2;
const STEEL = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.65, roughness: 0.38 });
/** Distance from the hand to the centre of the head. */
const HEAD_Z = 0.95;

/**
 * One-handed sledgehammer. Local frame: the right hand grips the origin, handle along +Z, head at z≈0.95.
 */
export class Hammer {
  readonly object = new THREE.Group();
  readonly prevBase = new THREE.Vector3();
  readonly prevTip = new THREE.Vector3();
  hasPrev = false;

  constructor() {
    // Hickory handle: tapered, slightly two-tone, with a ridged rubber grip and a steel collar.
    const wood = new PartsBuilder();
    const segs = 4;
    for (let k = 0; k < segs; k++) {
      const z0 = 0.1 + (k / segs) * 0.78, z1 = 0.1 + ((k + 1) / segs) * 0.78;
      const r0 = 0.03 - (k / segs) * 0.006, r1 = 0.03 - ((k + 1) / segs) * 0.006;
      wood.cyl(r1, r0, z1 - z0, 8, 0, 0, (z0 + z1) / 2, k % 2 ? 0x8a5f37 : 0x9a6b3f, Q);
    }
    wood.cyl(0.034, 0.036, 0.26, 8, 0, 0, -0.01, 0x1b1b1b, Q);
    for (const z of [-0.09, 0.0, 0.09]) wood.cyl(0.038, 0.038, 0.02, 8, 0, 0, z, 0x111111, Q);
    wood.cyl(0.04, 0.034, 0.04, 8, 0, 0, -0.15, 0x111111, Q);
    this.object.add(wood.build());

    // Octagonal steel head standing across the handle in the up/down direction (local Y), so from
    // behind it reads as vertical; polished striking faces top and bottom, chamfered ends.
    const steel = new PartsBuilder();
    steel.cyl(0.085, 0.085, 0.3, 8, 0, 0, HEAD_Z, 0x4b5057);
    for (const s of [-1, 1]) {
      steel.cyl(s > 0 ? 0.078 : 0.092, s > 0 ? 0.092 : 0.078, 0.04, 8, 0, s * 0.17, HEAD_Z, 0x5d6269);
      steel.cyl(0.08, 0.08, 0.015, 8, 0, s * 0.197, HEAD_Z, 0xb8bec6);
    }
    steel.cyl(0.04, 0.04, 0.13, 8, 0, 0, HEAD_Z - 0.05, 0x3a3e44, Q);
    this.object.add(steel.build(STEEL));
  }

  /** Striking part of the hammer (upper handle → head) in world space. */
  segment(base: THREE.Vector3, tip: THREE.Vector3) {
    this.object.localToWorld(base.set(0, 0, 0.45));
    this.object.localToWorld(tip.set(0, 0, HEAD_Z + 0.1));
  }

  storePrev(base: THREE.Vector3, tip: THREE.Vector3) {
    this.prevBase.copy(base);
    this.prevTip.copy(tip);
    this.hasPrev = true;
  }
}
