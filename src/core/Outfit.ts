import * as THREE from 'three';
import { PartsBuilder } from '../city/Parts';

/** Body proportions shared with the rig (metres, character faces +Z, its right side is -X). */
export const HIP_Y = 0.92;
export const UPPER = 0.3;
export const FORE = 0.32;

export type Top = 'shirt' | 'polo' | 'tshirt' | 'vest' | 'kameez' | 'blouse';
export type Bottom = 'trousers' | 'jeans' | 'lungi' | 'saree' | 'salwar';
export type Sleeves = 'long' | 'rolled' | 'short' | 'none';

/** What a character looks like and wears. Colours are hex. */
export interface Look {
  skin: number;
  hair: number;
  hairStyle: 'short' | 'quiff' | 'long' | 'bald';
  top: Top;
  topColor: number;
  /** Collar/buttons/print on tops, border on sarees, contrast on lungis. */
  accent: number;
  sleeves: Sleeves;
  bottom: Bottom;
  bottomColor: number;
  feet: 'sneakers' | 'sandals' | 'shoes';
  helmet?: number;
  /** Lungi folded up to the knees (how vendors and workers wear it), rather than down to the ankles. */
  lungiFolded?: boolean;
  /** Cotton gamchha towel: round the neck or tied on the head. */
  gamchha?: { color: number; onHead: boolean };
  /** Dupatta (salwar kameez) or saree aanchal colour. */
  drape?: number;
  belt?: number;
  beard?: boolean;
  mustache?: boolean;
  shades?: boolean;
  watch?: boolean;
}

/** Blocky low poly with flat shading: clean, readable shapes like a toy figure. */
export const CHARACTER_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/**
 * Tapered block: `wTop`/`wBot` wide at top/bottom, `d` deep, `h` tall, centred on the origin.
 * (A four-sided cylinder turned 45°, then squashed to the requested depth.)
 */
function prism(wTop: number, wBot: number, d: number, h: number) {
  const k = Math.SQRT1_2;
  return new THREE.CylinderGeometry(wTop * k, wBot * k, h, 4, 1).rotateY(Math.PI / 4).scale(1, 1, d / Math.max(wTop, wBot));
}

const HEAD_Y = 1.66;

export function buildTorso(look: Look) {
  const b = new PartsBuilder();
  const female = look.top === 'blouse' || look.top === 'kameez';
  const shoulders = female ? 0.4 : 0.45;
  const waist = female ? 0.32 : 0.37;
  const vest = look.top === 'vest';

  // Chest/torso, tapering from shoulders to waist, and the hips below it.
  b.add(prism(shoulders, waist, 0.25, 0.42), 0, 1.27, 0, look.topColor);
  b.add(prism(waist, female ? 0.38 : 0.36, 0.24, 0.2), 0, 0.96, 0, look.topColor);
  // Shoulder caps (bare for a sleeveless vest).
  for (const s of [-1, 1]) b.box(0.13, 0.1, 0.22, s * (shoulders / 2 - 0.035), 1.45, 0, vest || look.sleeves === 'none' ? look.skin : look.topColor);
  if (vest) for (const s of [-1, 1]) b.box(0.06, 0.06, 0.24, s * 0.1, 1.47, 0, look.topColor);
  b.box(0.1, 0.1, 0.1, 0, 1.53, 0, look.skin);

  // Long kameez hem, flaring out over the thighs.
  if (look.top === 'kameez') b.add(prism(0.38, 0.46, 0.28, 0.4), 0, 0.68, 0, look.topColor);

  topDetails(b, look);
  if (look.belt !== undefined) {
    b.box(waist + 0.01, 0.045, 0.255, 0, 0.92, 0, look.belt);
    b.box(0.06, 0.04, 0.012, 0, 0.92, 0.13, 0xc9a227);
  }
  skirt(b, look);
  head(b, look);
  return b.build(CHARACTER_MATERIAL);
}

function topDetails(b: PartsBuilder, look: Look) {
  const z = 0.127;
  switch (look.top) {
    case 'shirt':
      // Collar points, button placket, breast pocket.
      for (const s of [-1, 1]) b.box(0.08, 0.025, 0.06, s * 0.05, 1.49, 0.085, shade(look.topColor, 1.15), 0.4, 0, s * -0.45);
      b.box(0.03, 0.5, 0.008, 0, 1.2, z, shade(look.topColor, 0.88));
      b.box(0.08, 0.08, 0.008, 0.09, 1.32, z, shade(look.topColor, 0.9));
      break;
    case 'polo':
      // Flat knit collar (contrast tipped), short three-button placket.
      for (const s of [-1, 1]) b.box(0.09, 0.03, 0.07, s * 0.055, 1.5, 0.08, look.topColor, 0.25, 0, s * -0.3);
      b.box(0.2, 0.012, 0.012, 0, 1.485, 0.11, look.accent);
      b.box(0.035, 0.14, 0.008, 0, 1.4, z, shade(look.topColor, 0.85));
      for (let k = 0; k < 2; k++) b.box(0.012, 0.012, 0.006, 0, 1.43 - k * 0.05, z + 0.006, 0xf5f5f5);
      // Small chest logo.
      b.box(0.03, 0.025, 0.006, 0.09, 1.36, z, look.accent);
      break;
    case 'tshirt':
      b.box(0.14, 0.03, 0.01, 0, 1.48, z - 0.01, shade(look.topColor, 0.8));
      b.box(0.15, 0.1, 0.008, 0, 1.28, z, look.accent);
      break;
    case 'kameez':
      b.box(0.1, 0.12, 0.008, 0, 1.42, z - 0.005, look.accent);
      break;
  }
  if (look.drape !== undefined) {
    if (look.top === 'blouse') {
      // Saree aanchal: across the chest from right hip to left shoulder, then down the back.
      b.box(0.12, 0.66, 0.02, 0.02, 1.2, z + 0.01, look.drape, 0, 0, 0.55);
      b.box(0.18, 0.62, 0.02, 0.12, 1.16, -0.135, look.drape);
      b.box(0.14, 0.06, 0.26, 0.15, 1.47, 0, look.drape);
    } else {
      // Dupatta: over both shoulders, ends hanging down the front.
      for (const s of [-1, 1]) {
        b.box(0.12, 0.05, 0.27, s * 0.14, 1.48, 0, look.drape);
        b.box(0.1, 0.44, 0.02, s * 0.13, 1.25, z + 0.012, look.drape);
      }
      b.box(0.32, 0.07, 0.02, 0, 1.44, -0.135, look.drape);
    }
  }
  if (look.gamchha && !look.gamchha.onHead) {
    b.box(0.17, 0.05, 0.16, 0, 1.51, 0.01, look.gamchha.color);
    b.box(0.07, 0.22, 0.02, 0.06, 1.37, z + 0.012, look.gamchha.color, 0, 0, 0.1);
    b.box(0.072, 0.025, 0.022, 0.067, 1.29, z + 0.012, 0xf5f5f5, 0, 0, 0.1);
  }
}

function skirt(b: PartsBuilder, look: Look) {
  if (look.bottom === 'lungi') {
    // Checked lungi: alternating bands down a slightly flared tube, knotted at the waist.
    const bands = look.lungiFolded ? 4 : 6, top = 0.97, bottom = look.lungiFolded ? 0.58 : 0.38;
    for (let k = 0; k < bands; k++) {
      const t0 = k / bands, t1 = (k + 1) / bands;
      const y1 = top - t0 * (top - bottom), y0 = top - t1 * (top - bottom);
      const w = (t: number) => 0.38 + t * 0.07;
      b.add(prism(w(t0), w(t1), 0.28, y1 - y0), 0, (y0 + y1) / 2, 0, k % 2 ? look.accent : look.bottomColor);
    }
    b.box(0.07, 0.05, 0.03, 0.03, 0.95, 0.145, shade(look.bottomColor, 0.85));
  } else if (look.bottom === 'saree') {
    b.add(prism(0.37, 0.48, 0.3, 0.92), 0, 0.52, 0, look.bottomColor);
    b.add(prism(0.475, 0.49, 0.305, 0.08), 0, 0.1, 0, look.accent);
    // Front pleats.
    for (let k = -1; k <= 1; k++) b.box(0.025, 0.55, 0.012, k * 0.05, 0.36, 0.16, shade(look.bottomColor, 0.85), -0.08);
  }
}

function head(b: PartsBuilder, look: Look) {
  const y = HEAD_Y;
  b.box(0.22, 0.25, 0.22, 0, y, 0, look.skin);
  // Face: eyes, brows, nose.
  for (const s of [-1, 1]) {
    b.box(0.035, 0.038, 0.012, s * 0.05, y + 0.01, 0.112, 0x1a1a1a);
    b.box(0.05, 0.014, 0.012, s * 0.05, y + 0.055, 0.112, look.hair);
    b.box(0.022, 0.05, 0.04, s * 0.115, y, 0, look.skin);
  }
  b.box(0.035, 0.05, 0.03, 0, y - 0.025, 0.12, shade(look.skin, 0.9));
  if (look.beard) {
    b.box(0.23, 0.08, 0.06, 0, y - 0.1, 0.09, look.hair);
    for (const s of [-1, 1]) b.box(0.03, 0.12, 0.16, s * 0.11, y - 0.06, 0.03, look.hair);
  }
  if (look.mustache || look.beard) b.box(0.08, 0.02, 0.02, 0, y - 0.06, 0.115, look.hair);

  if (look.helmet !== undefined) {
    b.box(0.27, 0.17, 0.28, 0, y + 0.07, -0.005, look.helmet);
    b.box(0.25, 0.1, 0.05, 0, y + 0.02, -0.12, look.helmet);
    b.box(0.22, 0.07, 0.03, 0, y + 0.035, 0.135, 0x111827, -0.25);
    return;
  }
  const hair = look.hair;
  switch (look.hairStyle) {
    case 'short':
    case 'quiff':
      b.box(0.24, 0.07, 0.24, 0, y + 0.135, -0.005, hair);
      b.box(0.24, 0.17, 0.05, 0, y + 0.05, -0.105, hair);
      for (const s of [-1, 1]) b.box(0.03, 0.12, 0.17, s * 0.115, y + 0.07, -0.03, hair);
      if (look.hairStyle === 'quiff') b.box(0.18, 0.06, 0.1, 0, y + 0.18, 0.06, hair, -0.35);
      break;
    case 'long':
      b.box(0.245, 0.07, 0.245, 0, y + 0.135, -0.005, hair);
      b.box(0.25, 0.42, 0.06, 0, y - 0.07, -0.12, hair);
      for (const s of [-1, 1]) b.box(0.035, 0.24, 0.18, s * 0.12, y, -0.035, hair);
      // Braid down the back.
      for (let k = 0; k < 3; k++) b.box(0.07, 0.08, 0.06, 0, y - 0.32 - k * 0.09, -0.14, hair);
      break;
  }
  if (look.gamchha?.onHead) {
    b.box(0.25, 0.05, 0.25, 0, y + 0.1, 0, look.gamchha.color);
    b.box(0.06, 0.06, 0.04, 0.07, y + 0.1, -0.14, look.gamchha.color);
  }
  if (look.shades) {
    b.box(0.2, 0.05, 0.015, 0, y + 0.012, 0.118, 0x0b0b0b);
    for (const s of [-1, 1]) b.box(0.012, 0.015, 0.12, s * 0.112, y + 0.02, 0.06, 0x0b0b0b);
  }
}

/** Hip to knee; the shin and foot hang from the knee. */
export const KNEE = 0.45;

/**
 * Leg hanging down from the hip pivot ('whole'), or in two parts with a knee joint (the player, and
 * shopkeepers so they can sit on a stool):
 * 'thigh' (from the hip) and 'shin' (built relative to the knee, foot included).
 */
export function buildLeg(look: Look, part: 'whole' | 'thigh' | 'shin' = 'whole') {
  const b = new PartsBuilder();
  const bareLeg = look.bottom === 'lungi' || look.bottom === 'saree';
  const loose = look.bottom === 'salwar';
  const color = bareLeg ? look.skin : look.bottomColor;
  const [top, knee, ankle] = bareLeg ? [0.13, 0.105, 0.09] : loose ? [0.17, 0.15, 0.13] : [0.155, 0.135, 0.115];
  const depth = bareLeg ? 0.12 : loose ? 0.16 : 0.14;
  // Shin parts are built relative to the knee.
  const oy = part === 'shin' ? KNEE : 0;
  if (part !== 'shin') {
    b.add(prism(top, knee, depth, KNEE), 0, -KNEE / 2, 0, color);
    if (look.bottom === 'jeans') b.box(0.005, KNEE - 0.04, 0.005, 0.07, -KNEE / 2, depth / 2, shade(color, 1.4));
  }
  if (part === 'thigh') return b.build(CHARACTER_MATERIAL);

  const shin = bareLeg ? 0.41 : 0.37;
  b.add(prism(knee, ankle, depth, shin), 0, -KNEE - shin / 2 + oy, 0, color);
  if (look.bottom === 'jeans') b.box(0.005, shin - 0.04, 0.005, 0.06, -KNEE - shin / 2 + oy, depth / 2 - 0.005, shade(color, 1.4));
  if (!bareLeg) b.box(0.08, 0.06, 0.08, 0, -0.85 + oy, 0, look.skin);
  // Feet.
  if (look.feet === 'sandals') {
    b.box(0.09, 0.05, 0.2, 0, -0.885 + oy, 0.035, look.skin);
    b.box(0.11, 0.02, 0.23, 0, -0.91 + oy, 0.035, 0x5a3a20);
    b.box(0.1, 0.02, 0.03, 0, -0.87 + oy, 0.07, 0x3a2a1a);
  } else {
    const c = look.feet === 'sneakers' ? 0xf2f2f2 : 0x1a1a1a;
    b.box(0.12, 0.08, 0.25, 0, -0.875 + oy, 0.04, c);
    b.box(0.125, 0.025, 0.255, 0, -0.91 + oy, 0.04, look.feet === 'sneakers' ? 0x9ca3af : 0x0f0f0f);
    if (look.feet === 'sneakers') b.box(0.126, 0.02, 0.06, 0, -0.865 + oy, -0.06, 0x1d3557);
  }
  return b.build(CHARACTER_MATERIAL);
}

/** What a customer walks away from a stall holding. */
export type Carry = 'bag' | 'bigBag' | 'cone';

/**
 * A bought thing held in the hand, built around the grip (origin) so it hangs straight down:
 * a thin polythene bag, a bigger shopping bag, or a newspaper cone of jhalmuri.
 */
export function buildCarry(kind: Carry, color: number) {
  const b = new PartsBuilder();
  if (kind === 'cone') {
    b.add(new THREE.CylinderGeometry(0.06, 0.006, 0.2, 7), 0, -0.04, 0.03, 0xe5e1d3);
    b.add(new THREE.IcosahedronGeometry(0.055, 0), 0, 0.07, 0.03, 0xe8d6a8);
  } else {
    const big = kind === 'bigBag';
    const w = big ? 0.32 : 0.2, h = big ? 0.36 : 0.24, d = big ? 0.11 : 0.09;
    const top = -0.07;
    b.box(w, h, d, 0, top - h / 2, 0, color);
    b.box(w * 0.8, 0.03, d * 0.9, 0, top - h + 0.015, 0, shade(color, 0.85));
    // Handles up to the hand, plus a knot of plastic for the polythene bags.
    for (const s of [-1, 1]) b.box(0.015, 0.09, 0.015, s * w * 0.22, top + 0.03, 0, shade(color, 0.92));
    if (!big) b.box(0.05, 0.03, 0.04, 0, top + 0.07, 0, shade(color, 0.9));
  }
  return b.build(CHARACTER_MATERIAL);
}

/** Arm hangs down from the shoulder pivot ('whole') or in two parts for IK ('upper', 'fore'). */
export function buildArm(look: Look, part: 'upper' | 'fore' | 'whole') {
  const b = new PartsBuilder();
  const sleeve = look.top === 'vest' ? look.skin : look.topColor;
  if (part !== 'fore') {
    b.add(prism(0.1, 0.09, 0.1, UPPER), 0, -UPPER / 2, 0, look.skin);
    if (look.sleeves !== 'none') {
      const len = look.sleeves === 'short' ? 0.16 : UPPER;
      b.add(prism(0.115, 0.105, 0.115, len), 0, -len / 2, 0, sleeve);
    }
  }
  if (part !== 'upper') {
    const off = part === 'whole' ? UPPER : 0;
    const longSleeve = look.sleeves === 'long';
    b.add(prism(longSleeve ? 0.1 : 0.088, longSleeve ? 0.092 : 0.076, longSleeve ? 0.1 : 0.085, FORE), 0, -off - FORE / 2, 0, longSleeve ? sleeve : look.skin);
    // Rolled-up cuff at the elbow, or a shirt cuff at the wrist.
    if (look.sleeves === 'rolled') b.box(0.105, 0.05, 0.105, 0, -off - 0.03, 0, sleeve);
    if (longSleeve) b.box(0.1, 0.035, 0.1, 0, -off - FORE + 0.03, 0, shade(sleeve, 0.88));
    if (look.watch) b.box(0.09, 0.03, 0.09, 0, -off - FORE + 0.045, 0, 0x1f2937);
    b.box(0.08, 0.1, 0.065, 0, -off - FORE - 0.04, 0, look.skin);
    b.box(0.025, 0.05, 0.03, 0.045, -off - FORE - 0.02, 0.02, look.skin);
  }
  return b.build(CHARACTER_MATERIAL);
}
