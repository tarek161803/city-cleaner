export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const turnToward = (from: number, to: number, maxStep: number) => {
  const d = wrapAngle(to - from);
  return from + clamp(d, -maxStep, maxStep);
};

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Deterministic PRNG so the world layout is the same every run. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
