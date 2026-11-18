import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One primitive of a prop. Kept so a destroyed prop can fall apart into its real pieces. */
export interface Part {
  /** Centred at the origin. */
  geo: THREE.BufferGeometry;
  center: THREE.Vector3;
  quat: THREE.Quaternion;
  color: number;
  size: number;
}

export const PROP_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.85,
  side: THREE.DoubleSide,
});

const _e = new THREE.Euler();
const _c = new THREE.Color();
const _size = new THREE.Vector3();

/** Builds low-poly props out of coloured primitives and merges them into a single mesh. */
export class PartsBuilder {
  readonly parts: Part[] = [];

  add(geo: THREE.BufferGeometry, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0) {
    geo.computeBoundingBox();
    this.parts.push({
      geo,
      center: new THREE.Vector3(x, y, z),
      quat: new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz)),
      color,
      size: geo.boundingBox!.getSize(_size).length(),
    });
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, color, rx, ry, rz);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y, z, color, rx, ry, rz);
  }

  sphere(r: number, x: number, y: number, z: number, color: number) {
    return this.add(new THREE.IcosahedronGeometry(r, 0), x, y, z, color);
  }

  build(material: THREE.Material = PROP_MATERIAL) {
    const mesh = new THREE.Mesh(mergeParts(this.parts), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Bakes parts (placed, vertex-coloured) into one geometry. */
export function mergeParts(parts: Part[]) {
  if (!parts.length) return new THREE.BufferGeometry();
  // mergeGeometries needs all-indexed or all-non-indexed; icosahedrons are non-indexed. Keep shared
  // vertices whenever possible — far fewer vertices to transform.
  const indexed = parts.every((p) => p.geo.index);
  const geos = parts.map((p) => {
    const g = (indexed || !p.geo.index ? p.geo.clone() : p.geo.toNonIndexed()).applyQuaternion(p.quat);
    g.translate(p.center.x, p.center.y, p.center.z);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    _c.set(p.color);
    for (let i = 0; i < n; i++) _c.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}
