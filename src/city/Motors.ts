import { PartsBuilder } from './Parts';
import { Vehicle, type VehicleSpec } from './Vehicle';

const Q = Math.PI / 2;
const GLASS = 0x1e293b;
const RUBBER = 0x161616;
const HEADLIGHT = 0xfff4c2;
const TAILLIGHT = 0xdc2626;

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Tyre plus hub, centred on the axle, rolling about the X axis. */
const wheel = (r: number, width: number) => () => {
  const b = new PartsBuilder();
  b.cyl(r, r, width, 14, 0, 0, 0, RUBBER, 0, 0, Q);
  b.cyl(r * 0.55, r * 0.55, width + 0.02, 10, 0, 0, 0, 0x9ca3af, 0, 0, Q);
  return b;
};

/** Head- and tail-lights, bumpers and number plates at both ends of a body of half-length `h`. */
function ends(b: PartsBuilder, h: number, w: number, y: number) {
  for (const side of [-1, 1]) {
    b.box(0.32, 0.12, 0.04, side * (w / 2 - 0.25), y + 0.12, h + 0.01, HEADLIGHT);
    b.box(0.28, 0.12, 0.04, side * (w / 2 - 0.22), y + 0.12, -h - 0.01, TAILLIGHT);
  }
  b.box(w + 0.02, 0.14, 0.1, 0, y - 0.15, h + 0.03, 0x2b2b2b);
  b.box(w + 0.02, 0.14, 0.1, 0, y - 0.15, -h - 0.03, 0x2b2b2b);
  b.box(0.42, 0.12, 0.02, 0, y - 0.12, h + 0.09, 0xf5f5f5);
  b.box(0.42, 0.12, 0.02, 0, y - 0.12, -h - 0.09, 0xf5f5f5);
}

// ---- private car ------------------------------------------------------------

const CAR: VehicleSpec = {
  kind: 'car',
  halfLength: 2.1,
  halfWidth: 0.88,
  height: 1.5,
  speed: [5, 8],
  weave: [0.05, 0.2],
  wrongWayChance: 0.01,
  swerveRate: 0.001,
  stopRate: 0.01,
  patience: 7,
  // Right-hand drive: the driver sits on the car's right (-X).
  seat: [-0.38, 0.05, 0.1],
  hiddenDriver: true,
  exitDist: 1.3,
  maxHp: Infinity,
  wheelR: 0.32,
  wheels: [[-0.78, 1.35], [0.78, 1.35], [-0.78, -1.35], [0.78, -1.35]],
};

function buildCar() {
  const b = new PartsBuilder();
  const c = pick([0xf5f5f5, 0xc0c4c8, 0x1f2937, 0xb91c1c, 0x1d4ed8, 0x065f46]);
  b.box(1.72, 0.55, 4.2, 0, 0.6, 0, c);
  b.box(1.6, 0.5, 2.2, 0, 1.12, -0.25, c);
  b.box(1.56, 0.42, 0.05, 0, 1.12, 0.9, GLASS, -0.55);
  b.box(1.56, 0.4, 0.05, 0, 1.12, -1.4, GLASS, 0.55);
  for (const side of [-1, 1]) b.box(0.02, 0.32, 1.9, side * 0.81, 1.15, -0.25, GLASS);
  b.box(0.7, 0.14, 0.03, 0, 0.62, 2.11, 0x222222);
  ends(b, 2.1, 1.72, 0.55);
  return b;
}

export class Car extends Vehicle {
  constructor() {
    super(CAR, buildCar(), wheel(0.32, 0.22));
  }
}

// ---- pickup -----------------------------------------------------------------

const PICKUP: VehicleSpec = {
  ...CAR,
  kind: 'pickup',
  halfLength: 2.4,
  halfWidth: 0.92,
  height: 1.9,
  speed: [4.5, 7],
  weave: [0.05, 0.25],
  wrongWayChance: 0.02,
  swerveRate: 0.0015,
  stopRate: 0.02,
  patience: 6,
  seat: [-0.4, 0.3, 1.0],
  exitDist: 1.4,
  wheelR: 0.38,
  wheels: [[-0.82, 1.5], [0.82, 1.5], [-0.82, -1.5], [0.82, -1.5]],
};

function buildPickup() {
  const b = new PartsBuilder();
  const c = pick([0xf5f5f5, 0x1d4ed8, 0xb91c1c, 0x4b5563, 0x15803d]);
  b.box(1.8, 0.6, 4.8, 0, 0.75, 0, c);
  b.box(1.75, 0.75, 1.7, 0, 1.42, 1.0, c);
  b.box(1.6, 0.45, 0.05, 0, 1.46, 1.86, GLASS, -0.35);
  for (const side of [-1, 1]) {
    b.box(0.02, 0.38, 1.0, side * 0.88, 1.5, 1.05, GLASS);
    b.box(0.08, 0.45, 2.6, side * 0.86, 1.28, -1.0, c);
  }
  b.box(1.8, 0.45, 0.08, 0, 1.28, -2.36, c);
  // Cargo in the bed: sacks and crates.
  const loads = 2 + Math.floor(Math.random() * 3);
  for (let k = 0; k < loads; k++) {
    b.box(0.6, 0.45, 0.55, (k % 2 ? 0.4 : -0.4), 1.28 + Math.floor(k / 2) * 0.45, -0.6 - (k % 2) * 0.9, pick([0xc2a36b, 0x8b5a2b, 0xd6cfc4]));
  }
  ends(b, 2.4, 1.8, 0.7);
  return b;
}

export class Pickup extends Vehicle {
  constructor() {
    super(PICKUP, buildPickup(), wheel(0.38, 0.26));
  }
}

// ---- city bus ---------------------------------------------------------------

const BUS: VehicleSpec = {
  ...CAR,
  kind: 'bus',
  halfLength: 5,
  halfWidth: 1.25,
  height: 3.1,
  speed: [3.5, 6],
  weave: [0.05, 0.15],
  wrongWayChance: 0,
  swerveRate: 0,
  // Dhaka buses stop anywhere to pick people up.
  stopRate: 0.08,
  patience: 12,
  seat: [-0.8, 0.5, 4.2],
  exitDist: 1.8,
  wheelR: 0.5,
  wheels: [[-1.08, 3.3], [1.08, 3.3], [-1.08, -3.0], [1.08, -3.0]],
};

function buildBus() {
  const b = new PartsBuilder();
  const c = pick([0x16a34a, 0xdc2626, 0x2563eb, 0xea580c, 0x0f766e]);
  const stripe = pick([0xffffff, 0xfacc15, 0x111827]);
  b.box(2.5, 2.6, 10, 0, 1.75, 0, c);
  b.box(2.52, 0.25, 10.02, 0, 1.15, 0, stripe);
  b.box(2.4, 0.08, 9.8, 0, 3.08, 0, 0xd4d4d4);
  for (const side of [-1, 1]) {
    b.box(0.02, 0.8, 8.4, side * 1.26, 2.35, -0.4, GLASS);
    for (let k = 0; k <= 8; k++) b.box(0.03, 0.82, 0.12, side * 1.265, 2.35, -4.6 + k * 1.05, c);
    // Battered paint patches.
    for (let k = 0; k < 3; k++) b.box(0.025, 0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.8, side * 1.262, 0.8 + Math.random() * 0.5, -4 + Math.random() * 8, 0x6b7280);
  }
  // Door on the kerb side (left, +X) near the front.
  b.box(0.03, 1.9, 1.0, 1.265, 1.45, 3.8, 0x333333);
  b.box(2.3, 1.1, 0.04, 0, 2.2, 5.01, GLASS);
  b.box(1.6, 0.3, 0.04, 0, 2.85, 5.03, 0xf97316);
  b.box(2.3, 0.9, 0.04, 0, 2.3, -5.01, GLASS);
  ends(b, 5, 2.5, 0.75);
  return b;
}

export class Bus extends Vehicle {
  constructor() {
    super(BUS, buildBus(), wheel(0.5, 0.35));
  }
}

// ---- motorcycle -------------------------------------------------------------

const BIKE: VehicleSpec = {
  kind: 'bike',
  halfLength: 1.0,
  halfWidth: 0.4,
  height: 1.3,
  speed: [5, 8.5],
  weave: [0.3, 0.9],
  wrongWayChance: 0.06,
  swerveRate: 0.004,
  stopRate: 0.01,
  patience: 3,
  seat: [0, -0.05, -0.2],
  hiddenDriver: false,
  exitDist: 0.8,
  maxHp: Infinity,
  wheelR: 0.32,
  wheels: [[0, 0.68], [0, -0.68]],
};

function buildBike() {
  const b = new PartsBuilder();
  const c = pick([0xdc2626, 0x1d4ed8, 0x111827, 0xf5f5f5, 0x16a34a]);
  b.box(0.1, 0.1, 1.0, 0, 0.5, 0, 0x222222, -0.2);
  b.box(0.3, 0.3, 0.4, 0, 0.42, -0.05, 0x555555);
  b.box(0.3, 0.22, 0.45, 0, 0.82, 0.25, c);
  b.box(0.28, 0.1, 0.6, 0, 0.82, -0.3, 0x111111);
  b.box(0.26, 0.15, 0.35, 0, 0.78, -0.7, c);
  for (const side of [-1, 1]) b.box(0.05, 0.6, 0.05, side * 0.08, 0.62, 0.62, 0x9ca3af, 0.3);
  b.cyl(0.08, 0.08, 0.06, 10, 0, 0.95, 0.75, HEADLIGHT, Q);
  b.box(0.6, 0.03, 0.03, 0, 1.05, 0.55, 0x222222);
  b.cyl(0.04, 0.05, 0.6, 8, -0.16, 0.35, -0.35, 0xbfbfbf, Q);
  b.box(0.12, 0.06, 0.04, 0, 0.8, -0.89, TAILLIGHT);
  return b;
}

export class Bike extends Vehicle {
  constructor() {
    super(BIKE, buildBike(), wheel(0.32, 0.12));
  }
}

// ---- CNG auto-rickshaw ------------------------------------------------------

const CNG: VehicleSpec = {
  kind: 'cng',
  halfLength: 1.35,
  halfWidth: 0.68,
  height: 1.75,
  speed: [4, 6.5],
  weave: [0.15, 0.5],
  wrongWayChance: 0.08,
  swerveRate: 0.006,
  stopRate: 0.04,
  patience: 2.5,
  // Driver up front in the middle, behind the handlebar; the open side shows him.
  seat: [0, -0.02, 0.15],
  hiddenDriver: false,
  exitDist: 0.95,
  maxHp: Infinity,
  wheelR: 0.24,
  wheels: [[0, 1.0], [-0.55, -0.6], [0.55, -0.6]],
};

/** Green CNG three-wheeler: rounded tub, canvas roof, and the mesh doors that lock the passengers in. */
function buildCng() {
  const b = new PartsBuilder();
  const green = pick([0x15803d, 0x16a34a, 0x166534]);
  const roof = pick([0x14532d, 0x1f2937, 0x166534]);
  // Floor tub, nose and front fairing.
  b.box(1.3, 0.35, 2.2, 0, 0.45, -0.15, green);
  b.box(0.9, 0.55, 0.5, 0, 0.62, 1.05, green);
  b.box(1.1, 0.3, 0.12, 0, 1.0, 0.98, green, -0.25);
  b.box(1.1, 0.5, 0.04, 0, 1.42, 0.9, GLASS, -0.2);
  // Rear passenger bench and back panel.
  b.box(1.2, 0.18, 0.6, 0, 0.82, -0.75, 0x3f3f46);
  b.box(1.28, 0.95, 0.08, 0, 1.08, -1.24, green);
  b.box(0.9, 0.3, 0.03, 0, 1.25, -1.29, GLASS);
  // Canvas roof on four posts.
  b.box(1.34, 0.12, 2.25, 0, 1.72, -0.15, roof);
  for (const x of [-0.62, 0.62]) for (const z of [0.85, -1.2]) b.box(0.05, 1.05, 0.05, x, 1.2, z, 0x1f2937);
  // Steel-mesh side doors over the back half.
  for (const side of [-1, 1]) {
    b.box(0.03, 0.9, 1.15, side * 0.64, 1.1, -0.65, 0x52525b);
    for (let k = 0; k < 5; k++) b.box(0.04, 0.03, 1.15, side * 0.645, 0.72 + k * 0.2, -0.65, 0x27272a);
  }
  b.box(0.7, 0.04, 0.04, 0, 1.12, 0.62, 0x222222);
  b.cyl(0.07, 0.07, 0.05, 10, 0, 0.85, 1.3, HEADLIGHT, Q);
  for (const side of [-1, 1]) b.box(0.12, 0.08, 0.03, side * 0.5, 0.5, -1.26, TAILLIGHT);
  b.box(0.36, 0.1, 0.02, 0, 0.42, -1.27, 0xf5f5f5);
  return b;
}

export class Cng extends Vehicle {
  constructor() {
    super(CNG, buildCng(), wheel(0.24, 0.14));
  }
}

// ---- microbus ---------------------------------------------------------------

const MICROBUS: VehicleSpec = {
  ...CAR,
  kind: 'microbus',
  halfLength: 2.35,
  halfWidth: 0.9,
  height: 2.0,
  speed: [4.5, 7.5],
  wrongWayChance: 0.01,
  stopRate: 0.03,
  patience: 5,
  seat: [-0.4, 0.15, 1.4],
  exitDist: 1.35,
  wheelR: 0.34,
  wheels: [[-0.8, 1.55], [0.8, 1.55], [-0.8, -1.5], [0.8, -1.5]],
};

/** Hiace-style microbus: tall box with a short sloping nose and a long row of windows. */
function buildMicrobus() {
  const b = new PartsBuilder();
  const c = pick([0xf5f5f5, 0xe5e7eb, 0xc0c4c8, 0x9ca3af, 0x1f2937]);
  b.box(1.8, 0.75, 4.7, 0, 0.75, 0, c);
  b.box(1.78, 0.8, 4.2, 0, 1.52, -0.22, c);
  b.box(1.66, 0.62, 0.05, 0, 1.5, 1.95, GLASS, -0.35);
  b.box(1.6, 0.5, 0.04, 0, 1.55, -2.33, GLASS);
  for (const side of [-1, 1]) {
    b.box(0.02, 0.48, 3.7, side * 0.9, 1.6, -0.3, GLASS);
    for (let k = 0; k < 4; k++) b.box(0.03, 0.5, 0.08, side * 0.905, 1.6, 1.2 - k * 1.0, c);
  }
  b.box(1.7, 0.06, 4.0, 0, 1.94, -0.25, shadeRoof(c));
  ends(b, 2.35, 1.8, 0.6);
  return b;
}

const shadeRoof = (c: number) => (c === 0x1f2937 ? 0x111827 : 0xd1d5db);

export class Microbus extends Vehicle {
  constructor() {
    super(MICROBUS, buildMicrobus(), wheel(0.34, 0.22));
  }
}

// ---- painted truck ----------------------------------------------------------

const TRUCK: VehicleSpec = {
  ...CAR,
  kind: 'truck',
  halfLength: 3.8,
  halfWidth: 1.2,
  height: 3.1,
  speed: [3, 5],
  weave: [0.05, 0.12],
  wrongWayChance: 0,
  swerveRate: 0,
  stopRate: 0.02,
  patience: 10,
  seat: [-0.6, 0.65, 2.9],
  exitDist: 1.7,
  wheelR: 0.5,
  wheels: [[-1.02, 2.6], [1.02, 2.6], [-1.02, -1.7], [1.02, -1.7], [-1.02, -2.75], [1.02, -2.75]],
};

/** Tata cargo truck in Bangladeshi truck art: painted cab, flowers and stripes, tall wooden body. */
function buildTruck() {
  const b = new PartsBuilder();
  const cab = pick([0xf59e0b, 0xea580c, 0xdc2626, 0x0891b2, 0x16a34a]);
  const art = [0xfacc15, 0xef4444, 0x22c55e, 0x3b82f6, 0xf5f5f5, 0xec4899];
  // Chassis.
  b.box(2.2, 0.35, 7.4, 0, 0.75, 0, 0x262626);
  // Cab with a painted crown over the windscreen.
  b.box(2.35, 1.5, 1.6, 0, 1.65, 2.9, cab);
  b.box(2.2, 0.7, 0.04, 0, 1.95, 3.71, GLASS);
  b.box(2.4, 0.45, 0.2, 0, 2.62, 3.6, pick(art));
  for (let k = 0; k < 5; k++) b.box(0.3, 0.3, 0.05, -0.9 + k * 0.45, 2.62, 3.72, art[(k * 2) % art.length]);
  for (const side of [-1, 1]) {
    b.box(0.03, 0.55, 0.8, side * 1.18, 2.0, 3.05, GLASS);
    b.box(0.04, 0.4, 1.4, side * 1.18, 1.15, 2.9, pick(art));
  }
  b.box(2.36, 0.4, 0.2, 0, 0.95, 3.75, 0x9ca3af);
  for (const side of [-1, 1]) b.box(0.3, 0.2, 0.05, side * 0.85, 1.25, 3.72, HEADLIGHT);
  // Tall wooden cargo body with painted side panels and a tarp on top.
  const wood = pick([0x8b5a2b, 0x7c4a1e, 0x166534, 0x1d4ed8]);
  b.box(2.4, 1.9, 5.4, 0, 1.92, -0.85, wood);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) b.box(0.03, 0.08, 5.4, side * 1.205, 1.2 + k * 0.5, -0.85, k % 2 ? 0xfacc15 : 0xf5f5f5);
    for (let k = 0; k < 4; k++) b.box(0.03, 0.45, 0.6, side * 1.21, 1.95, -2.9 + k * 1.35, art[(k + (side > 0 ? 1 : 3)) % art.length]);
  }
  b.box(2.3, 0.35, 5.2, 0, 3.02, -0.85, 0x1e3a8a);
  b.box(2.4, 0.25, 0.08, 0, 1.0, -3.6, 0xfacc15);
  for (const side of [-1, 1]) b.box(0.25, 0.15, 0.04, side * 0.95, 1.0, -3.63, TAILLIGHT);
  return b;
}

export class Truck extends Vehicle {
  constructor() {
    super(TRUCK, buildTruck(), wheel(0.5, 0.32));
  }
}

// ---- leguna (human hauler) --------------------------------------------------

const LEGUNA: VehicleSpec = {
  ...CAR,
  kind: 'leguna',
  halfLength: 1.95,
  halfWidth: 0.82,
  height: 2.05,
  speed: [4, 6.5],
  weave: [0.1, 0.35],
  wrongWayChance: 0.04,
  swerveRate: 0.004,
  // Stops wherever a passenger waves.
  stopRate: 0.08,
  patience: 3,
  seat: [-0.35, 0.2, 1.15],
  exitDist: 1.25,
  wheelR: 0.3,
  wheels: [[-0.7, 1.25], [0.7, 1.25], [-0.7, -1.2], [0.7, -1.2]],
};

/** Leguna: small cab up front, a covered bench box behind with the back left open for hopping on. */
function buildLeguna() {
  const b = new PartsBuilder();
  const c = pick([0xf5f5f5, 0x0ea5e9, 0x16a34a, 0xeab308]);
  const hood = pick([0x1f2937, 0x166534, 0x7c2d12, 0x1e3a8a]);
  b.box(1.6, 0.4, 3.9, 0, 0.62, 0, 0x2b2b2b);
  // Cab.
  b.box(1.6, 1.05, 1.0, 0, 1.3, 1.45, c);
  b.box(1.5, 0.5, 0.04, 0, 1.5, 1.96, GLASS, -0.15);
  for (const side of [-1, 1]) b.box(0.02, 0.45, 0.6, side * 0.8, 1.5, 1.45, GLASS);
  // Passenger box: low sides, posts and a canvas hood; open at the back with a step.
  b.box(1.64, 0.55, 2.8, 0, 1.08, -0.5, c);
  for (const side of [-1, 1]) {
    for (const z of [0.85, -0.5, -1.85]) b.box(0.05, 0.8, 0.05, side * 0.8, 1.75, z, 0x3f3f46);
    b.box(0.03, 0.12, 2.8, side * 0.82, 1.0, -0.5, 0xdc2626);
  }
  b.box(1.7, 0.1, 2.9, 0, 2.18, -0.5, hood);
  b.box(1.66, 0.35, 0.05, 0, 1.98, -1.92, hood);
  for (const side of [-1, 1]) b.box(0.5, 0.1, 2.4, side * 0.5, 1.25, -0.55, 0x52525b);
  b.box(0.9, 0.06, 0.3, 0, 0.45, -2.05, 0x52525b);
  for (const side of [-1, 1]) {
    b.box(0.25, 0.12, 0.04, side * 0.55, 1.45, 1.96, HEADLIGHT);
    b.box(0.15, 0.12, 0.04, side * 0.7, 0.85, -1.92, TAILLIGHT);
  }
  b.box(0.42, 0.12, 0.02, 0, 1.0, 1.97, 0xf5f5f5);
  return b;
}

export class Leguna extends Vehicle {
  constructor() {
    super(LEGUNA, buildLeguna(), wheel(0.3, 0.2));
  }
}
