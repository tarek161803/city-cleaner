import * as THREE from 'three';
import { PartsBuilder } from './Parts';
import { Vehicle, type VehicleSpec } from './Vehicle';

/** Main colour of the striped hood top. */
const HOODS = [0x1d4ed8, 0xc1121f, 0x15803d, 0x7e22ce, 0x0e7490];
/** Rickshaw-art paint. */
const ART = [0xfacc15, 0xe63946, 0x22c55e, 0xf97316, 0xec4899, 0x3b82f6, 0xffffff, 0x14b8a6];
/** Painted accents on the fork, seat box and carriage frame. */
const ACCENTS = [0x14b8a6, 0x16a34a, 0xdc2626, 0xf59e0b];
const FRINGE = [0xe63946, 0xfacc15, 0x22c55e];
const FRAME = 0x1a1a1a;
const WHEEL_R = 0.36;
/** Hub positions (x, z): front wheel and the two rear wheels. */
const WHEELS: [number, number][] = [[0, 1.25], [-0.55, -0.5], [0.55, -0.5]];
const CHROME = 0xc8c8c8;

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const SPEC: VehicleSpec = {
  kind: 'rickshaw',
  halfLength: 1.3,
  halfWidth: 0.6,
  // Blows land on the seat and hood frame rather than the very top of the hood.
  height: 1.6,
  speed: [2.6, 3.8],
  weave: [0.15, 0.7],
  // Auto rickshaws are the main troublemakers: wrong side, sudden stops, no patience.
  wrongWayChance: 0.25,
  swerveRate: 0.014,
  stopRate: 0.08,
  patience: 1.8,
  seat: [0, 0.16, 0.42],
  hiddenDriver: false,
  exitDist: 0.9,
  maxHp: 60,
  wheelR: WHEEL_R,
  wheels: WHEELS,
};

/** Electric rickshaw: the only vehicle the hammer can smash. */
export class Rickshaw extends Vehicle {
  /** Battery pack under the seat (model-local): where it shorts out and sparks once damaged. */
  readonly battery = new THREE.Vector3(0, 0.5, -0.5);

  constructor() {
    super(SPEC, build(), buildWheel);
  }
}

/** Dhaka electric rickshaw: classic rickshaw body, battery + rear hub motor, no pedals. +Z is forward, ground at y=0. */
function build() {
  const b = new PartsBuilder();
  const hood = pick(HOODS), accent = pick(ACCENTS);
  const Q = Math.PI / 2;
  const W = WHEEL_R;

  // Front: painted fork, black frame, high saddle, chrome handlebar with headlight and horn, footrest.
  for (const x of [-0.05, 0.05]) b.box(0.03, 0.8, 0.03, x, 0.74, 1.19, accent, -0.18);
  b.box(0.1, 0.02, 0.42, 0, 0.76, 1.25, pick(ART));
  b.box(0.04, 0.04, 0.68, 0, 1.0, 0.78, FRAME);
  b.box(0.045, 0.66, 0.045, 0, 0.64, 0.92, FRAME, 0.66);
  b.box(0.045, 0.68, 0.045, 0, 0.69, 0.585, FRAME, -0.41);
  b.box(0.04, 0.04, 1.24, 0, 0.37, 0.11, FRAME);
  b.box(0.04, 0.04, 0.6, 0, 0.78, 0.15, accent);
  b.box(0.46, 0.03, 0.2, 0, 0.33, 0.9, 0x333333); // footrest where the driver's feet rest
  b.box(0.17, 0.07, 0.27, 0, 1.06, 0.42, 0x2a1a10);
  b.cyl(0.018, 0.018, 0.28, 6, 0, 1.12, 1.1, CHROME);
  b.box(0.58, 0.03, 0.03, 0, 1.25, 1.08, CHROME);
  for (const side of [-1, 1]) {
    b.box(0.04, 0.04, 0.1, side * 0.28, 1.25, 1.06, 0x111111);
    b.box(0.02, 0.16, 0.02, side * 0.22, 1.16, 1.09, pick(ART)); // tassels
  }
  b.cyl(0.07, 0.06, 0.1, 10, 0, 1.17, 1.16, 0x2a2a2a, Q); // headlight housing
  b.cyl(0.055, 0.055, 0.01, 10, 0, 1.17, 1.215, 0xfff4c2, Q); // headlight lens
  b.cyl(0.03, 0.05, 0.08, 8, 0.18, 1.28, 1.1, CHROME, Q); // horn

  // Carriage: axle, chassis, sloped painted footboard, seat box, red cushion.
  b.box(1.15, 0.04, 0.04, 0, W, -0.5, 0x333333);
  b.box(1.0, 0.06, 0.82, 0, 0.62, -0.45, accent);
  b.box(0.95, 0.04, 0.55, 0, 0.56, 0.02, 0xbfc3c9, 0.35);
  for (const side of [-1, 1]) {
    b.box(0.03, 0.3, 0.5, side * 0.48, 0.58, 0.0, 0xfacc15, 0.35);
    b.cyl(0.07, 0.07, 0.01, 10, side * 0.5, 0.58, 0.0, pick(ART), 0, 0, Q);
    b.box(0.1, 0.02, 0.62, side * 0.55, 0.8, -0.5, CHROME); // rear mudguards
    b.box(0.03, 0.03, 0.6, side * 0.5, 1.2, -0.5, accent); // armrests
  }
  b.box(1.0, 0.3, 0.55, 0, 0.82, -0.5, 0xd4d4d8);
  for (let k = -1; k <= 1; k++) b.cyl(0.08, 0.08, 0.01, 12, k * 0.3, 0.82, -0.22, pick(ART), Q);
  b.box(1.0, 0.12, 0.55, 0, 1.03, -0.5, 0xc1121f);
  b.box(1.0, 0.42, 0.1, 0, 1.3, -0.8, 0xc1121f);
  // Electric drive: battery pack under the seat, cables, and a hub motor on the rear axle.
  b.box(0.7, 0.24, 0.42, 0, 0.5, -0.5, 0x1f2937);
  b.box(0.3, 0.02, 0.18, -0.12, 0.625, -0.5, 0xfacc15);
  b.box(0.08, 0.03, 0.08, 0.22, 0.63, -0.42, 0xdc2626); // terminal
  b.box(0.02, 0.02, 0.9, 0.05, 0.45, 0.05, 0xdc2626); // cable to the throttle
  b.cyl(0.13, 0.13, 0.16, 12, 0.3, W, -0.5, 0x4b5563, 0, 0, Q); // hub motor
  b.cyl(0.14, 0.14, 0.03, 12, 0.39, W, -0.5, CHROME, 0, 0, Q);

  // Folding hood: striped dome over the seat, painted sides and back, fringe along the front edge.
  const HC = { y: 1.55, z: -0.45 };
  const R = 0.56;
  // Cylinder rotated onto the X axis: angle 0 = front, π/2 = top, π = back.
  const arc = (r: number, len: number, x: number, from: number, to: number, color: number) =>
    b.add(new THREE.CylinderGeometry(r, r, len, 12, 1, true, from, to - from), x, HC.y, HC.z, color, 0, 0, Q);
  arc(R, 1.04, 0, Math.PI * 0.25, Math.PI * 0.68, hood);
  arc(R, 1.04, 0, Math.PI * 0.68, Math.PI, pick(ART));
  for (const x of [-0.35, -0.12, 0.12, 0.35]) arc(R + 0.01, 0.04, x, Math.PI * 0.25, Math.PI * 0.68, 0xfacc15);
  for (const side of [-1, 1]) {
    b.add(new THREE.CircleGeometry(R, 12, 0, Math.PI * 0.75), side * 0.52, HC.y, HC.z, pick(ART), 0, Q);
    for (const [dy, dz] of [[0.25, -0.15], [0.12, -0.38], [0.3, -0.42]]) {
      b.cyl(0.07, 0.07, 0.012, 10, side * 0.53, HC.y + dy, HC.z + dz, pick(ART), 0, 0, Q);
    }
    // Hood struts: from the armrest up to the hood's front edge.
    b.box(0.025, 0.77, 0.025, side * 0.5, 1.57, -0.155, 0x111111, 0.25);
    // Side panel closing the gap between the hood and the seat.
    b.box(0.03, 0.36, 0.46, side * 0.52, 1.37, -0.78, pick(ART));
  }
  b.box(1.0, 0.45, 0.04, 0, 1.33, -1.0, pick(ART));
  for (let k = -1; k <= 1; k++) b.cyl(0.09, 0.09, 0.015, 12, k * 0.3, 1.33, -1.025, pick(ART), Q);
  for (let k = -4; k <= 4; k++) b.box(0.05, 0.16, 0.02, k * 0.11, 1.86, -0.06, FRINGE[(k + 4) % FRINGE.length]);
  return b;
}

/** One big thin spoked wheel, centred on its hub, rolling about the X axis. */
function buildWheel() {
  const b = new PartsBuilder();
  const Q = Math.PI / 2;
  b.add(new THREE.TorusGeometry(WHEEL_R, 0.03, 6, 18), 0, 0, 0, 0x1a1a1a, 0, Q);
  b.add(new THREE.TorusGeometry(WHEEL_R - 0.035, 0.012, 4, 18), 0, 0, 0, CHROME, 0, Q);
  for (let k = 0; k < 6; k++) b.box(0.012, (WHEEL_R - 0.04) * 2, 0.012, 0, 0, 0, 0xd8d8d8, (k * Math.PI) / 6);
  b.cyl(0.045, 0.045, 0.1, 8, 0, 0, 0, CHROME, 0, 0, Q);
  return b;
}
