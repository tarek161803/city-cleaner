import * as THREE from 'three';

const SUBSTEPS = 6;
const SAMPLES = 10;
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Sweeps the weapon from last frame's segment to this frame's and tests it against an upright
 * cylinder of `radius` standing at `feet`, `height` tall (works for knee-high goods as well as tall
 * stalls). Writes the first contact point to `out`.
 */
export function sweepBladeVsCapsule(
  prevBase: THREE.Vector3,
  prevTip: THREE.Vector3,
  base: THREE.Vector3,
  tip: THREE.Vector3,
  feet: THREE.Vector3,
  height: number,
  radius: number,
  out: THREE.Vector3,
) {
  const r2 = radius * radius;
  for (let s = 0; s <= SUBSTEPS; s++) {
    const a = s / SUBSTEPS;
    _b.lerpVectors(prevBase, base, a);
    _t.lerpVectors(prevTip, tip, a);
    for (let k = 0; k <= SAMPLES; k++) {
      _p.lerpVectors(_b, _t, k / SAMPLES);
      if (_p.y < feet.y - 0.1 || _p.y > feet.y + height) continue;
      const dx = _p.x - feet.x, dz = _p.z - feet.z;
      if (dx * dx + dz * dz < r2) {
        out.copy(_p);
        return true;
      }
    }
  }
  return false;
}
