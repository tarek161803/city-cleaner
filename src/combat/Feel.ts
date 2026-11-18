import * as THREE from 'three';

/** Hit-stop (frozen frames) and slow motion. */
export class TimeControl {
  private stop = 0;
  private slowT = 0;
  private slowScale = 1;

  hitStop(d: number) {
    this.stop = Math.max(this.stop, d);
  }

  slowMo(d: number, scale: number) {
    this.slowT = d;
    this.slowScale = scale;
  }

  step(rawDt: number) {
    if (this.stop > 0) {
      this.stop -= rawDt;
      return 0;
    }
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      return rawDt * this.slowScale;
    }
    return rawDt;
  }
}

export class Shake {
  private trauma = 0;
  private t = 0;

  add(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, out: THREE.Vector3) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.t += dt;
    const m = this.trauma * this.trauma * 0.3;
    const t = this.t * 40;
    out.set(Math.sin(t * 1.1) * m, Math.sin(t * 1.7 + 1) * m, Math.sin(t * 1.3 + 2) * m * 0.5);
  }
}

export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;

  constructor(private max: number, size: number, additive: boolean, private gravity: number) {
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  emit(at: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number, spread: number, color: THREE.Color, life = 0.8) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set(
        [
          (dir.x + (Math.random() - 0.5) * spread) * s,
          (dir.y + (Math.random() - 0.2) * spread) * s,
          (dir.z + (Math.random() - 0.5) * spread) * s,
        ],
        i * 3,
      );
      const k = 0.7 + Math.random() * 0.3;
      this.col.set([color.r * k, color.g * k, color.b * k], i * 3);
      this.life[i] = life * (0.6 + Math.random() * 0.6);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      this.vel[i * 3 + 1] -= this.gravity * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const TRAIL_MAX = 48;
const TRAIL_LIFE = 0.14;

/** Ribbon following the blade during the cutting window. Lives in world space. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private samples: { b: THREE.Vector3; t: THREE.Vector3; age: number }[] = [];
  private pos = new Float32Array(TRAIL_MAX * 2 * 3);
  private col = new Float32Array(TRAIL_MAX * 2 * 3);
  private pushedThisFrame = false;
  private wasPushing = false;

  constructor(private color: THREE.Color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  push(base: THREE.Vector3, tip: THREE.Vector3) {
    const last = this.samples[this.samples.length - 1];
    // Fill fast swings with in-between samples so the ribbon stays smooth.
    if (last && this.wasPushing) {
      for (let k = 1; k <= 3; k++) {
        const a = k / 4;
        this.samples.push({ b: last.b.clone().lerp(base, a), t: last.t.clone().lerp(tip, a), age: 0 });
      }
    }
    this.samples.push({ b: base.clone(), t: tip.clone(), age: 0 });
    while (this.samples.length > TRAIL_MAX) this.samples.shift();
    this.pushedThisFrame = true;
  }

  update(dt: number) {
    for (const s of this.samples) s.age += dt;
    this.samples = this.samples.filter((s) => s.age < TRAIL_LIFE);
    const n = this.samples.length;
    this.samples.forEach((s, i) => {
      const k = (1 - s.age / TRAIL_LIFE) * ((i + 1) / n);
      // Inner edge fades out so the ribbon looks like it trails off the tip.
      this.pos.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6);
      const c = this.color;
      const a = k * 0.55;
      this.col.set([c.r * a * 0.15, c.g * a * 0.15, c.b * a * 0.15, c.r * a, c.g * a, c.b * a], i * 6);
    });
    // Only interpolate between consecutive frames of the same swing.
    this.wasPushing = this.pushedThisFrame;
    this.pushedThisFrame = false;
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
