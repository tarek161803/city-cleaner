import * as THREE from 'three';
import { PartsBuilder } from './Parts';
import type { Carry } from '../core/Outfit';

/**
 * Dhaka footpath shops, modelled on what hawkers actually run: the cha'er tong (tea stall with kettles,
 * biscuit jars, hanging bananas, cigarettes and paan), fruit and pickle sellers on flat cycle vans, the
 * fuchka–chotpoti cart, clothes and sandals spread on plastic sheets, vegetable baskets, book tables and
 * phone-accessory boards — plus the portable kind: the sugarcane-juice press and the green-coconut
 * seller on four-wheeled push carts, the guava-makha seller's two-wheeled cart resting on its two legs,
 * the jhalmuri tin on its folding stand, and the winter pitha seller's clay stoves on the ground. Local frame: +Z faces the road, the keeper stands behind at z ≈ -1.
 */

export type ShopKind =
  | 'tea' | 'fruitVan' | 'fuchka' | 'clothes' | 'shoes' | 'vegetables' | 'pickleVan' | 'books' | 'accessories'
  | 'sugarcane' | 'jhalmuri' | 'guava' | 'coconut' | 'pitha';

/** Painted Bangla signboards: text, background, ink. Index = atlas row. */
const SIGNS: [string, string, string][] = [
  ['চা', '#b91c1c', '#fff7d6'],
  ['ফুচকা চটপটি', '#facc15', '#b91c1c'],
  ['তাজা ফল', '#15803d', '#ffffff'],
  ['আচার', '#7c2d12', '#fde68a'],
  ['মোবাইল এক্সেসরিজ', '#1d4ed8', '#ffffff'],
  ['বই', '#f8fafc', '#1e3a8a'],
  ['আখের রস', '#166534', '#fef08a'],
  ['ঝালমুড়ি', '#facc15', '#7f1d1d'],
  ['পেয়ারা মাখা', '#dc2626', '#ffffff'],
  ['ডাব', '#3f6212', '#ffffff'],
];
const SIGN_ROW: Partial<Record<ShopKind, number>> = {
  tea: 0, fuchka: 1, fruitVan: 2, pickleVan: 3, accessories: 4, books: 5, sugarcane: 6, jhalmuri: 7, guava: 8, coconut: 9,
};

/** How common each kind is on a Dhaka footpath (tea stalls are everywhere). */
const WEIGHTS: [ShopKind, number][] = [
  ['tea', 3],
  ['fruitVan', 2],
  ['fuchka', 1.5],
  ['clothes', 1.5],
  ['vegetables', 1.2],
  ['shoes', 1],
  ['accessories', 1],
  ['pickleVan', 0.7],
  ['books', 0.6],
  ['jhalmuri', 1.3],
  ['sugarcane', 1],
  ['guava', 1],
  ['coconut', 1],
  ['pitha', 0.8],
];

const Q = Math.PI / 2;
const WOOD = 0x8b5a2b;
const DARK_WOOD = 0x5c3b1e;
const BAMBOO = 0xc2a36b;
const TIN = 0x9ca3af;
const ALU = 0xc4c8cd;
const TARPS = [0x1e5aa8, 0xe36414, 0x2d6a4f, 0xb5179e, 0xd62828, 0x0e7490];
const PAINT = [0x0f766e, 0x1d4ed8, 0x15803d, 0xb91c1c, 0x7c3aed, 0xca8a04];
const BRIGHT = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0x6a4c93, 0x1982c4, 0xff595e, 0x8ac926, 0xffffff, 0x111827];
const UMBRELLA = [[0xdc2626, 0xffffff], [0x1d4ed8, 0xfacc15], [0x15803d, 0xffffff], [0x7c3aed, 0xf472b6], [0xea580c, 0x1f2937]];

/** Every cart, van and barrow rolls on wheels of this one size (m). */
const CART_WHEEL_R = 0.31;

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export interface ShopModel {
  kind: ShopKind;
  parts: PartsBuilder;
  /** Top of the goods/structure the hammer actually lands on (m). */
  height: number;
  /** Signboard: atlas row, size, position (local, facing +Z). */
  sign?: { row: number; w: number; h: number; x: number; y: number; z: number };
  /** Goods laid out on the ground: the seller sits on a low stool here (local x, z and seat height). */
  stool?: { x: number; z: number; h: number };
}

/**
 * Customer–seller exchanges at each kind of shop, as [customer, seller] pairs: ordinary buying, and
 * the odd bit of haggling.
 */
export const SHOP_TALK: Record<ShopKind, { buy: [string, string][]; haggle: [string, string][] }> = {
  tea: {
    buy: [['মামা, এক কাপ চা', 'দুধ চা না রং চা?'], ['দুধ চা দেন', 'বসেন, দিতাছি'], ['একটা বিস্কুট দেন', 'নেন, পাঁচ টাকা'], ['একটা কলা দেন', 'সাগর কলা, দশ টাকা'], ['চিনি কম দিয়েন', 'আচ্ছা মামা, কম দিলাম']],
    haggle: [['চা পনেরো টাকা কেন?', 'দুধের দাম বাড়ছে মামা']],
  },
  fruitVan: {
    buy: [['কমলা কত করে?', 'কেজি ২২০ টাকা'], ['এক কেজি আপেল দেন', 'মাপ দিতাছি, একদম ফ্রেশ'], ['কলা এক ডজন কত?', 'ডজন ১২০'], ['ডালিম মিষ্টি তো?', 'মিষ্টি না হইলে ফেরত দিয়েন']],
    haggle: [['২০০ দেই কমলা?', 'আচ্ছা নেন, আপনার জন্য'], ['পচা দিয়েন না কিন্তু', 'বাইছা বাইছা দিতাছি']],
  },
  fuchka: {
    buy: [['এক প্লেট ফুচকা', 'টক বেশি না কম?'], ['চটপটি দেন মামা', 'ডিম দিমু উপরে?'], ['ঝাল বেশি দিয়েন', 'ঝাল খাইতে পারবেন তো?']],
    haggle: [['প্লেট এত দাম কেন?', 'আটটা ফুচকা দিছি মামা']],
  },
  clothes: {
    buy: [['এইটার দাম কত?', 'চারশো, একদম লাস্ট'], ['লুঙ্গি কত?', 'ভালো সুতা, তিনশো'], ['বড় সাইজ আছে?', 'XL আছে, দেখেন']],
    haggle: [['দুইশো দিমু', 'কেনা দামও হয় না মামা'], ['আড়াইশো দেই?', 'আচ্ছা, বউনি করেন']],
  },
  shoes: {
    buy: [['সাইজ ৪২ আছে?', 'আছে, পইরা দেখেন'], ['স্যান্ডেল কত?', 'আড়াইশো টাকা'], ['এক জোড়া দেন', 'কোন কালার নিবেন?']],
    haggle: [['দেড়শো দিমু', 'দুইশো দেন, নিয়া যান']],
  },
  vegetables: {
    buy: [['আলু কেজি কত?', 'কেজি পঞ্চাশ'], ['আধা কেজি টমেটো', 'নেন, লাল টকটকা'], ['কাঁচা মরিচ দেন', 'একপোয়া দশ টাকা'], ['লাউ কত?', 'বড়টা ষাট টাকা']],
    haggle: [['কালকে তো চল্লিশ ছিল', 'আজকে আমদানি কম মামা']],
  },
  pickleVan: {
    buy: [['আমের আচার দেন', 'টক না মিষ্টি?'], ['বরই আচার কত?', 'বয়াম দেড়শো'], ['একটু চেখে দেখি', 'খান, ঘরে বানানো']],
    haggle: [['একশো দেই?', 'খাঁটি সরিষার তেল মামা']],
  },
  books: {
    buy: [['পুরান বই কত?', 'যেইটা নেন একশো'], ['এইটা কত দিবেন?', 'আশি টাকা দেন'], ['আজকের পেপার দেন', 'প্রথম আলো না যুগান্তর?'], ['গাইড বই আছে?', 'সব ক্লাসের আছে']],
    haggle: [['পঞ্চাশ দিমু', 'নেন, বউনি করেন']],
  },
  accessories: {
    buy: [['চার্জার আছে?', 'কোন মোবাইল?'], ['কভার কত?', 'দেড়শো, গ্লাস ফ্রি'], ['হেডফোন দেখান', 'এইটা নেন, বেজ ভালো'], ['ডাটা ক্যাবল দেন', 'টাইপ-সি তো?']],
    haggle: [['একশো দেই?', 'ওয়ারেন্টি আছে মামা']],
  },
  sugarcane: {
    buy: [['এক গ্লাস আখের রস', 'বিশ টাকা, এখনই দিতাছি'], ['লেবু দিয়ে দেন', 'আদা-লেবু দুইটাই দিলাম'], ['বরফ বেশি দিয়েন', 'ঠান্ডা ঠান্ডা নেন']],
    haggle: [['পনেরো দেই?', 'আখের দাম বাড়ছে মামা']],
  },
  jhalmuri: {
    buy: [['দশ টাকার ঝালমুড়ি', 'চানাচুর বেশি দিমু?'], ['ঝাল কম দিয়েন', 'কম দিলাম, সরিষার তেল দিমু?'], ['পেঁয়াজ বেশি', 'নেন, শসাও দিলাম']],
    haggle: [['আরেকটু বেশি দেন', 'আরেক মুঠ দিলাম']],
  },
  guava: {
    buy: [['পেয়ারা মাখা দেন', 'বিট লবণ দিমু?'], ['লবণ-মরিচ বেশি', 'ঝাল ঝাল কইরা দিলাম'], ['আমড়া আছে?', 'আছে, মাখায় দেই?']],
    haggle: [['আরো দুই টুকরা দেন', 'নেন, ফাউ দিলাম']],
  },
  coconut: {
    buy: [['একটা ডাব কাটেন', 'পানি বেশি, এইটা নেন'], ['ডাব কত?', 'একশো টাকা'], ['কচি দেখে দেন', 'এইটা একদম কচি']],
    haggle: [['আশি দেই?', 'ডাবের দাম বাড়ছে মামা']],
  },
  pitha: {
    buy: [['দুইটা ভাপা পিঠা', 'গরম গরম নেন'], ['চিতই পিঠা দেন', 'শুটকি ভর্তা না সরিষা?'], ['গুড় বেশি দিয়েন', 'খেজুরের গুড় দিলাম']],
    haggle: [['দশ টাকা কেন?', 'নারকেল-গুড় দিছি মামা']],
  },
};

/** What each kind of hawker shouts to pull in passers-by. */
export const HAWKER_CALLS: Record<ShopKind, string[]> = {
  tea: ['গরম চা! গরম চা!', 'আসেন, চা খাইয়া যান', 'দুধ চা, রং চা!'],
  fruitVan: ['টাটকা ফল! টাটকা ফল!', 'কমলা-আপেল সস্তা!', 'মিষ্টি ডালিম, আসেন!'],
  fuchka: ['ফুচকা-চটপটি! ঝাল ঝাল!', 'টক-ঝাল ফুচকা!', 'আসেন আপা, ফুচকা খান!'],
  clothes: ['বাছাই একশো! বাছাই একশো!', 'নিয়া যান, সস্তা!', 'লুঙ্গি-গেঞ্জি সব আছে!'],
  shoes: ['যেইটা নিবেন দুইশো!', 'স্যান্ডেল-জুতা সস্তা!', 'সব সাইজ আছে!'],
  vegetables: ['টাটকা সবজি! টাটকা!', 'আলু-পেঁয়াজ সস্তা!', 'কাঁচা মরিচ, টমেটো!'],
  pickleVan: ['আচার! মজার আচার!', 'আমের আচার, বরই আচার!', 'খাইয়া দেখেন!'],
  books: ['যেইটা নেন একশো!', 'পুরান বই, নতুন বই!', 'আজকের পেপার!'],
  accessories: ['চার্জার-কভার সস্তা!', 'হেডফোন একশো!', 'সব মোবাইলের কভার!'],
  sugarcane: ['ঠান্ডা আখের রস!', 'আখের রস! বিশ টাকা!', 'গরমে আখের রস খান!'],
  jhalmuri: ['ঝালমুড়ি! ঝাআআলমুড়ি!', 'দশ টাকার ঝালমুড়ি!', 'মজার ঝালমুড়ি!'],
  guava: ['পেয়ারা মাখা! আমড়া মাখা!', 'ঝাল ঝাল পেয়ারা!', 'মাখা খান, মজা পাবেন!'],
  coconut: ['কচি ডাব! কচি ডাব!', 'ঠান্ডা ডাবের পানি!', 'গরমে ডাব খান!'],
  pitha: ['গরম ভাপা পিঠা!', 'চিতই পিঠা! ভর্তা দিয়া!', 'শীতের পিঠা, আসেন!'],
};

/** What a customer carries away: food eaten at the stall (tea, fuchka, juice, coconut, pitha) leaves nothing. */
export const TAKEAWAY: Partial<Record<ShopKind, Carry>> = {
  fruitVan: 'bag', vegetables: 'bag', pickleVan: 'bag', books: 'bag', accessories: 'bag',
  clothes: 'bigBag', shoes: 'bigBag',
  jhalmuri: 'cone', guava: 'cone',
};

/** Shops on wheels: these get pushed out into the road; everything else stays on the footpath. */
const WHEELED: ReadonlySet<ShopKind> = new Set(['fruitVan', 'pickleVan', 'fuchka', 'sugarcane', 'guava', 'coconut']);

/** A shop for a slot: something on wheels out in the road, otherwise a footpath stall. */
export function buildShop(onRoad: boolean, kind: ShopKind = pickKind(onRoad)): ShopModel {
  const b = new PartsBuilder();
  BUILDERS[kind](b);
  const row = SIGN_ROW[kind];
  const sign = row === undefined ? undefined : { row, ...SIGN_SPOT[kind]! };
  const spot = STOOL_SPOT[kind];
  const stool = spot && { ...spot, h: mora(b, spot.x, spot.z) };
  return { kind, parts: b, sign, height: HEIGHT[kind], stool };
}

/** Where the seller of a ground-level shop sits, behind the goods. */
const STOOL_SPOT: Partial<Record<ShopKind, { x: number; z: number }>> = {
  clothes: { x: 0.3, z: -1.0 },
  shoes: { x: 0.2, z: -0.95 },
  vegetables: { x: 0.35, z: -1.0 },
  pitha: { x: -0.1, z: -0.6 },
};

/** Where a downward blow meets each kind of shop: low for goods on the ground, high for box stalls. */
const HEIGHT: Record<ShopKind, number> = {
  tea: 1.6,
  fruitVan: 1.15,
  fuchka: 1.5,
  clothes: 0.45,
  shoes: 0.25,
  vegetables: 0.35,
  accessories: 1.0,
  pickleVan: 1.3,
  books: 1.05,
  sugarcane: 1.2,
  jhalmuri: 1.0,
  guava: 1.15,
  coconut: 1.0,
  pitha: 0.45,
};

function pickKind(wheeled: boolean): ShopKind {
  const kinds = WEIGHTS.filter(([k]) => WHEELED.has(k) === wheeled);
  const total = kinds.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of kinds) if ((r -= w) <= 0) return k;
  return kinds[0][0];
}

/** Sign boards keep the atlas row's 16:5 shape (h = w × 5/16) so the lettering isn't stretched. */
const SIGN_SPOT: Partial<Record<ShopKind, { w: number; h: number; x: number; y: number; z: number }>> = {
  tea: { w: 0.8, h: 0.25, x: 0, y: 2.38, z: 0.36 },
  fuchka: { w: 1.4, h: 0.44, x: 0, y: 2.13, z: 0.47 },
  fruitVan: { w: 0.8, h: 0.25, x: 0, y: 0.52, z: 0.5 },
  pickleVan: { w: 0.9, h: 0.28, x: 0, y: 1.62, z: 0.48 },
  accessories: { w: 1.4, h: 0.44, x: 0, y: 2.33, z: -0.38 },
  books: { w: 0.7, h: 0.22, x: 0, y: 2.2, z: 0.62 },
  sugarcane: { w: 0.7, h: 0.22, x: 0, y: 0.52, z: 0.43 },
  jhalmuri: { w: 0.6, h: 0.19, x: 0, y: 0.93, z: 0.2 },
  guava: { w: 0.8, h: 0.25, x: 0, y: 0.72, z: 0.4 },
  coconut: { w: 0.6, h: 0.19, x: 0, y: 0.52, z: 0.43 },
};

// ---- shared bits -------------------------------------------------------------

/** Beach umbrella: pole and an eight-panel canopy in two alternating colours. */
function umbrella(b: PartsBuilder, x: number, z: number, h: number, r: number) {
  const [c1, c2] = pick(UMBRELLA);
  b.cyl(0.025, 0.025, h, 6, x, h / 2, z, 0xd1d5db);
  for (let k = 0; k < 8; k++) {
    b.add(new THREE.CylinderGeometry(0.02, r, 0.35, 1, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4), x, h + 0.05, z, k % 2 ? c1 : c2);
  }
}

/** Sloping tarp roof on four bamboo poles. */
function tarpRoof(b: PartsBuilder, w: number, d: number, front: number, back: number, color = pick(TARPS)) {
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
    b.cyl(0.03, 0.03, front, 6, x, front / 2, d / 2 - 0.05, BAMBOO);
    b.cyl(0.03, 0.03, back, 6, x, back / 2, -d / 2 + 0.05, BAMBOO);
  }
  const slope = Math.atan2(front - back, d);
  b.box(w + 0.3, 0.03, d + 0.4, 0, (front + back) / 2 + 0.04, 0, color, -slope);
  b.box(w + 0.3, 0.22, 0.02, 0, front - 0.07, d / 2 + 0.2, color);
}

/** Table with four legs; returns the top surface height. */
function table(b: PartsBuilder, w: number, d: number, h: number, z = 0, color = WOOD) {
  b.box(w, 0.06, d, 0, h, z, color);
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const dz of [-d / 2 + 0.06, d / 2 - 0.06]) b.box(0.06, h, 0.06, x, h / 2, z + dz, DARK_WOOD);
  return h + 0.03;
}

/**
 * Flat cycle van ("bhan gari"), lengthwise along the street like the push carts: a wooden platform
 * over two spoked rear wheels under its long sides, a frame running forward (+X) to the saddle, the
 * pedal crank, and the steering fork with the front wheel and handlebar. Returns the platform top.
 */
function van(b: PartsBuilder) {
  const top = 0.78, r = CART_WHEEL_R, zc = -0.1, d = 1.0, frame = 0x1f2937;
  b.box(1.8, 0.08, d, 0, top - 0.04, zc, WOOD);
  for (const z of [zc - d / 2 + 0.03, zc + d / 2 - 0.03]) b.box(1.8, 0.1, 0.06, 0, top + 0.02, z, DARK_WOOD);
  b.box(0.06, 0.1, d, -0.87, top + 0.02, zc, DARK_WOOD);
  // Rear wheels under the long sides, on one axle across, with hangers up to the platform.
  b.box(0.05, 0.05, d + 0.14, 0, r, zc, frame);
  for (const z of [zc - d / 2 - 0.05, zc + d / 2 + 0.05]) {
    spokedWheel(b, 0, r, z, r, 'z');
    b.box(0.05, top - r - 0.08, 0.05, 0, (top + r) / 2 - 0.04, z + (z < zc ? 0.1 : -0.1), frame);
  }
  // Frame forward to the front: beam under the platform, down tube, saddle, crank and pedals.
  b.box(2.3, 0.07, 0.07, 0.4, top - 0.12, zc, frame);
  b.box(0.05, 0.5, 0.05, 1.15, top + 0.05, zc, frame, 0, 0, 0.15);
  b.box(0.22, 0.07, 0.14, 1.12, top + 0.32, zc, 0x111111);
  b.cyl(0.09, 0.09, 0.03, 10, 1.15, 0.38, zc, ALU, Q);
  for (const s of [-1, 1]) b.box(0.03, 0.18, 0.03, 1.15 + s * 0.06, 0.38 - s * 0.05, zc + s * 0.1, frame, 0, 0, 0.6);
  // Steering fork, front wheel and handlebar.
  const fx = 1.6;
  spokedWheel(b, fx, r, zc, r, 'z');
  b.box(0.05, top + 0.25 - r, 0.05, fx - 0.04, (top + 0.25 + r) / 2, zc, frame, 0, 0, 0.12);
  b.box(0.04, 0.04, 0.55, fx - 0.1, top + 0.27, zc, 0x111111);
  for (const s of [-1, 1]) b.box(0.05, 0.05, 0.12, fx - 0.1, top + 0.27, zc + s * 0.33, 0x111111);
  return top;
}

/**
 * Four-wheeled push cart ("thela"), built like a little car: a long plank bed (`w` along the street)
 * with low side rails, four spoked bicycle-style wheels under its long sides near each end rolling
 * lengthwise, on axles across the bed, and the push handle sticking out of the left end. Returns the
 * bed's top surface height.
 */
function pushCart(b: PartsBuilder, w: number, d: number, paint: number) {
  const top = 0.72;
  b.box(w, 0.07, d, 0, top - 0.035, 0, WOOD);
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) b.box(0.05, 0.12, d, x, top + 0.04, 0, paint);
  b.box(w, 0.12, 0.05, 0, top + 0.04, d / 2 - 0.03, paint);
  b.box(w, 0.25, 0.04, 0, top - 0.2, d / 2 - 0.03, paint);
  b.box(w, 0.25, 0.04, 0, top - 0.2, -d / 2 + 0.03, paint);
  // Wheels front and back of each long side, like a car's; axles run across under the bed.
  const r = CART_WHEEL_R, wx = w / 2 - r - 0.08, wz = d / 2 + 0.05;
  for (const x of [-wx, wx]) {
    b.box(0.05, 0.05, d + 0.14, x, r, 0, 0x1f2937);
    for (const z of [-wz, wz]) spokedWheel(b, x, r, z, r, 'z');
    // Hangers from the bed down to the axle.
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) b.box(0.05, top - r - 0.06, 0.05, x, (top + r) / 2 - 0.03, z, 0x1f2937);
  }
  // Push handle: two shafts out of the left end and a cross grip.
  for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) b.box(0.5, 0.04, 0.04, -w / 2 - 0.22, top + 0.08, z, 0x1f2937, 0, 0, -0.25);
  b.cyl(0.025, 0.025, d - 0.1, 6, -w / 2 - 0.45, top + 0.15, 0, 0x1f2937, Q);
  return top;
}

/** Big thin bicycle wheel with spokes, axle along X (rolls along Z) or along Z (rolls along X). */
function spokedWheel(b: PartsBuilder, x: number, y: number, z: number, r: number, axle: 'x' | 'z' = 'x') {
  const alongX = axle === 'x';
  b.add(new THREE.TorusGeometry(r, 0.025, 5, 16), x, y, z, 0x161616, 0, alongX ? Q : 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    b.box(0.01, r * 2 - 0.04, 0.01, x, y, z, 0xd1d5db, alongX ? a : 0, 0, alongX ? 0 : a);
  }
  b.cyl(0.04, 0.04, 0.08, 6, x, y, z, ALU, alongX ? 0 : Q, 0, alongX ? Q : 0);
}

/**
 * Two-wheeled hand cart: bed balanced over a pair of bicycle wheels, two legs at the back that it
 * rests on when parked, and the long handles the keeper lifts to wheel it away. Returns the bed top.
 */
function handCart(b: PartsBuilder, w: number, d: number, paint: number) {
  const top = 0.82;
  b.box(w, 0.06, d, 0, top - 0.03, 0, WOOD);
  b.box(w + 0.04, 0.16, d + 0.04, 0, top - 0.13, 0, paint);
  b.box(0.06, 0.06, w + 0.2, 0, CART_WHEEL_R, 0.1, 0x1f2937, 0, Q);
  for (const x of [-w / 2 - 0.08, w / 2 + 0.08]) {
    spokedWheel(b, x, CART_WHEEL_R, 0.1, CART_WHEEL_R);
    // Rest leg under the back corner, and a handle running back past it.
    b.box(0.05, top - 0.12, 0.05, x * 0.85, (top - 0.12) / 2, -d / 2 + 0.05, DARK_WOOD);
    b.box(0.045, 0.045, 0.7, x * 0.85, top - 0.12, -d / 2 - 0.25, DARK_WOOD, 0.12);
  }
  return top;
}

/** Glass jar with a coloured lid. */
function jar(b: PartsBuilder, x: number, y: number, z: number, fill: number, lid: number, s = 1) {
  b.cyl(0.07 * s, 0.07 * s, 0.18 * s, 8, x, y + 0.09 * s, z, fill);
  b.cyl(0.075 * s, 0.075 * s, 0.04 * s, 8, x, y + 0.2 * s, z, lid);
}

/** A bunch of bananas hanging from a string. */
function bananas(b: PartsBuilder, x: number, y: number, z: number) {
  b.box(0.01, 0.2, 0.01, x, y + 0.1, z, 0x3f3f3f);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.box(0.045, 0.2, 0.045, x + Math.cos(a) * 0.06, y - 0.08, z + Math.sin(a) * 0.06, 0xfacc15, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
  }
}

/** Mora: low round cane stool, waisted in the middle. Returns the seat height. */
function mora(b: PartsBuilder, x: number, z: number) {
  b.cyl(0.17, 0.13, 0.17, 8, x, 0.085, z, 0xb08850);
  b.cyl(0.13, 0.17, 0.17, 8, x, 0.255, z, 0xc2a36b);
  b.cyl(0.18, 0.18, 0.03, 8, x, 0.355, z, 0x8b5a2b);
  return 0.37;
}

/** Low plastic stool. */
function stool(b: PartsBuilder, x: number, z: number) {
  const c = pick([0xdc2626, 0x1d4ed8, 0x16a34a]);
  b.box(0.3, 0.04, 0.3, x, 0.42, z, c);
  for (const dx of [-0.12, 0.12]) for (const dz of [-0.12, 0.12]) b.box(0.04, 0.4, 0.04, x + dx, 0.2, z + dz, c);
}

// ---- the shops ----------------------------------------------------------------

const BUILDERS: Record<ShopKind, (b: PartsBuilder) => void> = {
  /** Cha'er tong: painted wooden box shop on legs, propped-up tin flap, kettles, jars, bananas, bench. */
  tea(b) {
    const paint = pick(PAINT);
    for (const x of [-0.62, 0.62]) for (const z of [-0.45, 0.25]) b.box(0.08, 0.45, 0.08, x, 0.22, z, DARK_WOOD);
    b.box(1.4, 1.05, 0.85, 0, 0.97, -0.1, paint);
    b.box(1.42, 0.12, 0.87, 0, 0.5, -0.1, 0x1f2937);
    b.box(1.5, 0.06, 0.95, 0, 1.52, -0.05, WOOD);
    b.box(1.5, 0.05, 1.0, 0, 2.2, -0.1, TIN);
    for (const x of [-0.7, 0.7]) b.box(0.05, 0.7, 0.05, x, 1.87, -0.55, DARK_WOOD);
    // Front flap propped open as an awning.
    b.box(1.5, 0.04, 0.75, 0, 2.17, 0.62, TIN, 0.32);
    for (const x of [-0.68, 0.68]) b.box(0.03, 0.62, 0.03, x, 1.86, 0.36, DARK_WOOD, 0.35);
    // Stove and kettles.
    b.box(0.35, 0.1, 0.3, -0.42, 1.6, 0.05, 0x1e3a8a);
    b.cyl(0.11, 0.13, 0.2, 8, -0.48, 1.75, 0.05, ALU);
    b.box(0.12, 0.03, 0.03, -0.32, 1.78, 0.05, ALU, 0, 0, -0.5);
    b.cyl(0.09, 0.11, 0.16, 8, -0.32, 1.73, -0.15, ALU);
    // Biscuit and cake jars, cups on a tray.
    for (let k = 0; k < 4; k++) jar(b, 0.05 + k * 0.17, 1.55, 0.2, pick([0xe9c46a, 0xd4a373, 0xf4e1c1, 0xc8553d]), pick([0xdc2626, 0x1d4ed8, 0x15803d]));
    b.box(0.3, 0.02, 0.2, 0.4, 1.56, -0.15, 0xd1d5db);
    for (let k = 0; k < 4; k++) b.cyl(0.035, 0.028, 0.07, 6, 0.3 + (k % 2) * 0.1, 1.61, -0.2 + Math.floor(k / 2) * 0.1, 0xf8fafc);
    // Cigarette packs and paan box on the shelf.
    for (let k = 0; k < 5; k++) b.box(0.08, 0.12, 0.03, 0.55 - k * 0.1, 1.95, -0.48, pick(BRIGHT));
    b.box(0.25, 0.08, 0.18, -0.55, 1.6, 0.22, 0x166534);
    // Bananas hanging from the flap, and a bench out front.
    bananas(b, -0.45, 1.95, 0.52);
    bananas(b, 0.45, 1.95, 0.52);
    b.box(1.5, 0.06, 0.32, 0, 0.45, 1.05, WOOD);
    for (const x of [-0.65, 0.65]) b.box(0.06, 0.42, 0.28, x, 0.21, 1.05, DARK_WOOD);
  },

  /**
   * Fruit on a four-wheeled push cart: a stepped wooden display of oranges, apples, guava and
   * pomegranates, bananas at the front, green coconuts at the corners, a hanging scale on a pole,
   * apples in a basket underneath and a striped umbrella.
   */
  fruitVan(b) {
    const top = pushCart(b, 2.2, 1.0, pick([0x1d4ed8, 0x15803d, 0xb91c1c, 0xca8a04]));
    // Stepped display: two raised shelves at the back so the fruit faces the road in tiers.
    b.box(2.0, 0.14, 0.32, 0, top + 0.07, -0.3, WOOD);
    b.box(2.0, 0.28, 0.16, 0, top + 0.14, -0.4, DARK_WOOD);
    const fruits = [0xf77f00, 0xc1121f, 0x8ab33c, 0xfcbf49, 0x7f1d1d, 0xb91c1c];
    const rows: [number, number][] = [[0.18, 0.09], [0.0, 0.09], [-0.2, 0.23], [-0.38, 0.37]];
    for (const [z, y] of rows) {
      const c = pick(fruits);
      for (let x = -0.92; x <= 0.93; x += 0.16) {
        b.add(new THREE.IcosahedronGeometry(0.075, 0), x + rand(-0.02, 0.02), top + y + 0.05, z, Math.random() < 0.8 ? c : pick(fruits));
      }
    }
    for (const x of [-0.9, 0.9]) b.add(new THREE.IcosahedronGeometry(0.15, 0), x, top + 0.15, 0.36, 0x4d7c0f);
    for (let k = 0; k < 4; k++) b.box(0.28, 0.06, 0.1, -0.3 + k * 0.2, top + 0.04, 0.36, 0xfacc15, 0, k * 0.4, 0);
    // Hanging scale from a pole at the back corner.
    b.cyl(0.02, 0.02, 1.2, 6, 1.02, top + 0.6, -0.45, 0x374151);
    b.box(0.25, 0.02, 0.02, 0.92, top + 1.15, -0.45, 0x374151);
    b.box(0.01, 0.35, 0.01, 0.82, top + 0.96, -0.45, 0x3f3f3f);
    b.cyl(0.12, 0.1, 0.03, 8, 0.82, top + 0.78, -0.45, ALU);
    // Spare stock in a basket on the shelf under the bed.
    b.cyl(0.22, 0.18, 0.18, 10, -0.4, 0.42, 0, 0xb08850);
    for (let k = 0; k < 5; k++) b.add(new THREE.IcosahedronGeometry(0.07, 0), -0.4 + rand(-0.1, 0.1), 0.53, rand(-0.1, 0.1), 0xc1121f);
    umbrella(b, -0.2, -0.45, 2.4, 1.35);
  },

  /** Fuchka–chotpoti cart: painted cart on two spoked wheels, glass display box, big pot, plates, stools. */
  fuchka(b) {
    const paint = pick([0xdc2626, 0xca8a04, 0x15803d, 0x1d4ed8]);
    b.box(1.4, 0.7, 0.8, 0, 0.8, 0, paint);
    for (let k = -1; k <= 1; k++) b.box(0.32, 0.4, 0.01, k * 0.45, 0.8, 0.41, pick([0xfde68a, 0xffffff, 0x86efac, 0xfca5a5]));
    // Spoked wheels under the front and back sides, rolling along the street like the other carts;
    // a rest leg under the left end and the push handle sticking out of it.
    const wx = 0.15;
    b.box(0.05, 0.05, 0.94, wx, CART_WHEEL_R, 0, 0x1f2937);
    for (const z of [-0.45, 0.45]) spokedWheel(b, wx, CART_WHEEL_R, z, CART_WHEEL_R, 'z');
    b.box(0.06, 0.45, 0.06, -0.6, 0.22, 0, DARK_WOOD);
    for (const z of [-0.3, 0.3]) b.box(0.5, 0.04, 0.04, -0.92, 0.95, z, 0x1f2937, 0, 0, -0.2);
    b.cyl(0.025, 0.025, 0.65, 6, -1.15, 1.0, 0, 0x1f2937, Q);
    // Glass display box: thin frame with a heap of fuchka shells inside.
    const gy = 1.15, gw = 0.7, gd = 0.5, gh = 0.4;
    for (const x of [-gw / 2, gw / 2]) for (const z of [-gd / 2, gd / 2]) b.box(0.02, gh, 0.02, 0.2 + x, gy + gh / 2, z, ALU);
    b.box(gw, 0.02, gd, 0.2, gy + gh, 0, ALU);
    b.box(gw, 0.02, gd, 0.2, gy, 0, 0xe5e7eb);
    for (let k = 0; k < 14; k++) b.add(new THREE.IcosahedronGeometry(0.05, 0), 0.2 + rand(-0.25, 0.25), gy + 0.06 + rand(0, 0.12), rand(-0.17, 0.17), 0xd4a373);
    // Chotpoti pot, plates, tamarind water jug.
    b.cyl(0.2, 0.18, 0.3, 10, -0.42, 1.3, 0.05, ALU);
    b.cyl(0.21, 0.21, 0.03, 10, -0.42, 1.46, 0.05, 0x8b929a);
    for (let k = 0; k < 5; k++) b.cyl(0.11, 0.09, 0.015, 10, 0.55, 1.17 + k * 0.016, 0.25, 0xf8fafc);
    b.cyl(0.07, 0.08, 0.2, 8, -0.15, 1.25, 0.25, 0x7c2d12);
    // Tin roof on thin poles.
    for (const x of [-0.65, 0.65]) for (const z of [-0.35, 0.35]) b.box(0.03, 0.75, 0.03, x, 1.52, z, 0x374151);
    b.box(1.6, 0.04, 1.0, 0, 1.9, 0, paint);
    stool(b, -0.4, 0.95);
    stool(b, 0.4, 0.95);
  },

  /** Clothes hawker: blue plastic sheet with folded piles, shirts hanging on a rope, tarp overhead. */
  clothes(b) {
    b.box(2.0, 0.02, 1.5, 0, 0.01, 0.1, 0x2563eb);
    for (let x = -0.75; x <= 0.76; x += 0.5) {
      for (let z = -0.3; z <= 0.51; z += 0.4) {
        const n = 2 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) b.box(0.38, 0.07, 0.3, x, 0.05 + k * 0.07, z, pick(BRIGHT));
      }
    }
    // Shirts and lungis hanging on a rope between the back poles.
    b.box(2.0, 0.015, 0.015, 0, 1.85, -0.6, 0x3f3f3f);
    for (let x = -0.8; x <= 0.81; x += 0.4) {
      const c = pick(BRIGHT);
      b.box(0.3, 0.42, 0.02, x, 1.6, -0.6, c);
      b.box(0.44, 0.12, 0.02, x, 1.74, -0.6, c);
    }
    tarpRoof(b, 2.0, 1.4, 2.25, 2.05);
  },

  /** Sandals and shoes in rows on a sheet, under a small umbrella. */
  shoes(b) {
    b.box(1.8, 0.02, 1.3, 0, 0.01, 0.05, pick([0x991b1b, 0x1f2937, 0x1e3a8a]));
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const c = pick([0x3f2a1a, 0x111111, 0x1d4ed8, 0xdb2777, 0x92400e, 0xf8fafc]);
        const x = -0.72 + col * 0.36, z = -0.45 + row * 0.3;
        for (const dx of [-0.05, 0.05]) {
          b.box(0.08, 0.03, 0.22, x + dx, 0.035, z, c);
          b.box(0.08, 0.02, 0.03, x + dx, 0.06, z + 0.04, shadeHex(c));
        }
      }
    }
    umbrella(b, -0.75, -0.55, 1.8, 1.1);
  },

  /** Vegetables in round wicker baskets on a jute sheet: potatoes, onions, tomatoes, brinjal, chillies, gourds. */
  vegetables(b) {
    b.box(2.0, 0.02, 1.4, 0, 0.01, 0.05, 0xa16207);
    const veg: [number, number][] = [[0x8b5a2b, 0.07], [0x9f1239, 0.06], [0xdc2626, 0.06], [0x581c87, 0.08], [0x16a34a, 0.035], [0x4d7c0f, 0.09]];
    let i = 0;
    for (const [x, z] of [[-0.62, -0.3], [0, -0.3], [0.62, -0.3], [-0.62, 0.35], [0, 0.35], [0.62, 0.35]]) {
      b.cyl(0.28, 0.24, 0.16, 10, x, 0.09, z, 0xb08850);
      const [c, r] = veg[i++ % veg.length];
      for (let k = 0; k < 7; k++) b.add(new THREE.IcosahedronGeometry(r, 0), x + rand(-0.15, 0.15), 0.2 + rand(0, 0.06), z + rand(-0.15, 0.15), c);
    }
    umbrella(b, 0, -0.65, 2.1, 1.3);
  },

  /** Phone accessories: table of packets in front of a pegboard of hanging covers and cables. */
  accessories(b) {
    const top = table(b, 1.8, 0.8, 0.85, 0.05);
    for (let x = -0.78; x <= 0.79; x += 0.14) b.box(0.1, 0.16, 0.03, x, top + 0.08, rand(-0.25, 0.3), pick(BRIGHT));
    b.box(1.8, 1.0, 0.04, 0, 1.6, -0.4, 0xf1f5f9);
    for (const x of [-0.85, 0.85]) b.box(0.05, 2.2, 0.05, x, 1.1, -0.4, DARK_WOOD);
    for (let row = 0; row < 3; row++) for (let x = -0.72; x <= 0.73; x += 0.18) b.box(0.12, 0.22, 0.02, x, 1.9 - row * 0.3, -0.37, pick(BRIGHT));
  },

  /** Pickles on a cycle van: rows of jars of mango, olive and plum achar, a little canopy. */
  pickleVan(b) {
    const top = van(b);
    for (let tier = 0; tier < 2; tier++) {
      if (tier) b.box(1.5, 0.04, 0.5, 0, top + 0.3, -0.25, WOOD);
      for (let x = -0.7; x <= 0.71; x += 0.17) {
        for (const z of tier ? [-0.35, -0.18] : [-0.4, -0.18, 0.04, 0.26]) {
          jar(b, x, top + (tier ? 0.32 : 0.02), z, pick([0xb45309, 0x7c2d12, 0x65a30d, 0xdc2626, 0xca8a04]), 0xf8fafc, 1.05);
        }
      }
    }
    for (const x of [-0.85, 0.85]) b.box(0.03, 0.9, 0.03, x, top + 0.45, -0.55, 0x374151);
    b.box(1.9, 0.03, 0.6, 0, top + 0.92, -0.3, pick(TARPS));
  },

  /** Second-hand books and newspapers stacked on a table under a tarp. */
  books(b) {
    const top = table(b, 1.8, 0.9, 0.8, 0.05);
    for (let x = -0.72; x <= 0.73; x += 0.24) {
      for (const z of [-0.2, 0.25]) {
        const n = 2 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) b.box(0.2, 0.04, 0.26, x + rand(-0.02, 0.02), top + 0.02 + k * 0.04, z, pick([...BRIGHT, 0xf8fafc, 0xe5e7eb]), 0, rand(-0.15, 0.15), 0);
      }
    }
    for (let k = 0; k < 3; k++) b.box(0.4, 0.015, 0.3, -0.5 + k * 0.5, 0.02, 0.85, 0xf3f4f6);
    tarpRoof(b, 1.9, 1.2, 2.1, 1.9);
  },

  /**
   * Aakher rosh: iron sugarcane press on a push cart — two rollers in a green cast frame, a big
   * flywheel with a crank, a bundle of cane, a block of ice, glasses and lemons.
   */
  sugarcane(b) {
    const top = pushCart(b, 2.0, 0.85, pick([0x1d4ed8, 0x15803d, 0xb91c1c]));
    const px = 0.25;
    b.box(0.42, 0.42, 0.36, px, top + 0.21, -0.05, 0x166534);
    for (const dz of [-0.06, 0.06]) b.cyl(0.07, 0.07, 0.46, 10, px, top + 0.3, -0.05 + dz, 0xb8bec6, 0, 0, Q);
    b.box(0.3, 0.03, 0.16, px, top + 0.12, 0.2, ALU, -0.3); // juice spout
    // Flywheel and crank on the right side of the press.
    b.add(new THREE.TorusGeometry(0.33, 0.03, 5, 16), px + 0.3, top + 0.38, -0.05, 0x1f2937, 0, Q);
    for (let k = 0; k < 3; k++) b.box(0.02, 0.64, 0.03, px + 0.3, top + 0.38, -0.05, 0x1f2937, (k * Math.PI) / 3);
    b.box(0.03, 0.03, 0.22, px + 0.36, top + 0.66, -0.05, 0x1f2937);
    b.cyl(0.02, 0.02, 0.14, 6, px + 0.43, top + 0.66, 0.05, 0xd4a373, 0, 0, Q);
    // Sugarcane: a bundle lying along the back of the cart and a few long sticks propped up against
    // the umbrella pole.
    for (let k = 0; k < 7; k++) b.cyl(0.025, 0.025, 0.9, 6, -0.32 + rand(-0.05, 0.05), top + 0.04 + (k % 3) * 0.04, rand(-0.36, -0.26), k % 2 ? 0x6b2d3f : 0x8a7a3a, 0, rand(-0.08, 0.08), Q);
    for (let k = 0; k < 5; k++) b.cyl(0.024, 0.024, 1.9, 6, -0.62 + k * 0.035, top + 0.9, -0.24, k % 2 ? 0x6b2d3f : 0x7a6a30, -0.1, 0, -0.12 + k * 0.05);
    // Ice block, lemons, glasses and a jug.
    b.box(0.22, 0.16, 0.18, -0.15, top + 0.08, 0.25, 0xe0f2fe);
    for (let k = 0; k < 5; k++) b.add(new THREE.IcosahedronGeometry(0.035, 0), -0.45 + k * 0.06, top + 0.04, 0.3, 0x84cc16);
    for (let k = 0; k < 4; k++) b.cyl(0.035, 0.03, 0.11, 6, 0.05 + k * 0.09, top + 0.06, 0.32, 0xe0f2fe);
    b.cyl(0.07, 0.08, 0.18, 8, px, top + 0.09, 0.3, 0xd9f99d);
    umbrella(b, -0.55, -0.3, 2.2, 1.2);
  },

  /**
   * Jhalmuri: a painted tin box on a folding X-stand — lid propped open over rows of spice tins,
   * a big mixing mug, mustard oil, onions, chillies and a stack of paper cones.
   */
  jhalmuri(b) {
    const top = 0.82;
    // Folding stand: two crossed pairs of legs and a cross bar.
    for (const x of [-0.24, 0.24]) {
      for (const s of [-1, 1]) b.box(0.035, 0.98, 0.035, x, top / 2, 0, DARK_WOOD, s * 0.48);
    }
    b.box(0.52, 0.03, 0.03, 0, top * 0.5, 0, DARK_WOOD);
    // Tin box, painted panel on the front, lid propped open at the back.
    b.box(0.68, 0.22, 0.36, 0, top + 0.11, 0, 0xc4c8cd);
    b.box(0.6, 0.15, 0.01, 0, top + 0.11, 0.185, pick([0xdc2626, 0x15803d, 0x7c3aed]));
    b.box(0.68, 0.02, 0.32, 0, top + 0.36, -0.28, 0xc4c8cd, -1.2);
    // Spice and chanachur tins in rows, with a mug and oil bottle on top.
    for (let k = 0; k < 8; k++) {
      b.cyl(0.04, 0.04, 0.08, 8, -0.27 + (k % 4) * 0.12, top + 0.26, k < 4 ? -0.08 : 0.06, pick([0xd4a373, 0xca8a04, 0xb45309, 0xe9c46a, 0x65a30d]));
    }
    b.cyl(0.08, 0.07, 0.16, 8, 0.24, top + 0.3, 0.1, ALU);
    b.cyl(0.03, 0.035, 0.16, 6, -0.3, top + 0.3, 0.12, 0xfacc15);
    for (let k = 0; k < 3; k++) b.add(new THREE.IcosahedronGeometry(0.035, 0), 0.06 + k * 0.06, top + 0.25, 0.14, 0x9f1239);
    for (let k = 0; k < 4; k++) b.box(0.015, 0.015, 0.07, -0.1 + k * 0.03, top + 0.24, 0.15, 0x16a34a, 0, k * 0.5, 0);
    for (let k = 0; k < 4; k++) b.cyl(0.04, 0.005, 0.12, 6, 0.36 + k * 0.012, top + 0.26 + k * 0.01, -0.1, 0xf5f0e1);
  },

  /**
   * Peyara makha on a two-wheeled cart parked on its legs: a glass box of cut guava and amra, whole
   * fruit heaped beside it, chilli-salt jars, a chopping board and knife, and a small umbrella.
   */
  guava(b) {
    const top = handCart(b, 1.1, 0.75, pick([0xdc2626, 0x0f766e, 0xca8a04]));
    const gw = 0.6, gd = 0.45, gh = 0.32, gx = 0.15;
    for (const x of [-gw / 2, gw / 2]) for (const z of [-gd / 2, gd / 2]) b.box(0.02, gh, 0.02, gx + x, top + gh / 2, z, ALU);
    b.box(gw, 0.02, gd, gx, top + gh, 0, ALU);
    for (let k = 0; k < 16; k++) {
      b.box(0.06, 0.04, 0.05, gx + rand(-0.24, 0.24), top + 0.03 + rand(0, 0.08), rand(-0.17, 0.17), k % 3 ? 0xbef264 : 0xf5f5dc, 0, rand(0, 3), 0);
    }
    for (let k = 0; k < 7; k++) b.add(new THREE.IcosahedronGeometry(0.06, 0), -0.32 + rand(-0.1, 0.1), top + 0.06 + (k > 3 ? 0.08 : 0), rand(-0.2, 0.2), 0x65a30d);
    for (let k = 0; k < 3; k++) jar(b, -0.4 + k * 0.1, top, 0.3, pick([0xdc2626, 0xf5f5f4, 0x92400e]), 0xf8fafc, 0.7);
    b.box(0.26, 0.02, 0.16, 0.15, top + 0.01, 0.3, 0xd4a373);
    b.box(0.16, 0.01, 0.025, 0.18, top + 0.03, 0.3, 0xd1d5db);
    umbrella(b, 0.45, -0.25, 1.9, 0.9);
  },

  /** Green coconuts heaped on a push cart, a few cut open with straws, the dao for topping them. */
  coconut(b) {
    const top = pushCart(b, 1.9, 0.85, pick([0x1d4ed8, 0xca8a04, 0x15803d]));
    for (let tier = 0; tier < 3; tier++) {
      for (let x = -0.68 + tier * 0.14; x <= 0.69 - tier * 0.14; x += 0.27) {
        for (let z = -0.25 + tier * 0.1; z <= 0.26 - tier * 0.1; z += 0.26) {
          b.add(new THREE.IcosahedronGeometry(0.14, 0), x + rand(-0.03, 0.03), top + 0.13 + tier * 0.19, z, pick([0x4d7c0f, 0x65a30d, 0x3f6212]));
        }
      }
    }
    for (const x of [-0.78, 0.78]) {
      b.add(new THREE.IcosahedronGeometry(0.13, 0), x, top + 0.13, 0.32, 0x4d7c0f);
      b.cyl(0.07, 0.07, 0.02, 8, x, top + 0.25, 0.32, 0xf5f5f0);
      b.cyl(0.006, 0.006, 0.22, 4, x + 0.02, top + 0.33, 0.32, pick([0xec4899, 0x22c55e]), 0, 0, 0.2);
    }
    // The dao: a heavy curved blade with a wooden handle, lying on the cart's edge.
    b.box(0.05, 0.02, 0.22, 0.82, top + 0.12, -0.2, 0x9ca3af, 0, 0.3, 0);
    b.cyl(0.018, 0.018, 0.14, 6, 0.86, top + 0.12, -0.38, 0x5c3b1e, Q, 0.3, 0);
    // Husks and shells piled on the ground beside it.
    for (let k = 0; k < 5; k++) b.add(new THREE.IcosahedronGeometry(0.1, 0), 1.3 + rand(-0.12, 0.12), 0.08, rand(-0.3, 0.2), 0x84733c);
  },

  /**
   * Winter pitha seller on the ground: clay stoves with the fire glowing through the mouth, a pot
   * steaming bhapa pitha under a cloth, a clay pan of chitoi, a tray of pitha,
   * and bowls of molasses and grated coconut.
   */
  pitha(b) {
    b.box(1.6, 0.02, 1.1, 0, 0.01, 0.05, pick([0x7c2d12, 0x1e3a8a, 0x3f3f46]));
    for (const [x, pot] of [[-0.4, true], [0.25, false]] as const) {
      b.cyl(0.2, 0.25, 0.28, 10, x, 0.15, -0.1, 0x9a4a2b);
      b.box(0.14, 0.1, 0.02, x, 0.1, 0.13, 0xf97316); // fire in the stove's mouth
      if (pot) {
        b.cyl(0.18, 0.15, 0.22, 10, x, 0.4, -0.1, ALU);
        b.cyl(0.19, 0.19, 0.04, 10, x, 0.52, -0.1, 0xf5f5f0); // cloth over the steamer
      } else {
        b.cyl(0.24, 0.16, 0.08, 12, x, 0.33, -0.1, 0x8a3b22);
        for (let k = 0; k < 4; k++) b.cyl(0.05, 0.05, 0.02, 8, x + Math.cos(k * 1.6) * 0.12, 0.37, -0.1 + Math.sin(k * 1.6) * 0.12, 0xf5f0e1);
      }
    }
    // A tray of pitha and bowls of gur and coconut (the seller's mora is added with the shop).
    b.cyl(0.25, 0.23, 0.03, 12, -0.15, 0.04, 0.4, ALU);
    for (let k = 0; k < 6; k++) b.cyl(0.055, 0.055, 0.04, 8, -0.15 + Math.cos(k) * 0.13, 0.08, 0.4 + Math.sin(k) * 0.13, 0xf5f0e1);
    b.cyl(0.1, 0.07, 0.07, 8, 0.35, 0.05, 0.4, 0x8a3b22);
    b.cyl(0.085, 0.085, 0.02, 8, 0.35, 0.08, 0.4, 0x7c2d12);
    b.cyl(0.1, 0.07, 0.07, 8, 0.6, 0.05, 0.35, 0x8a3b22);
    b.cyl(0.085, 0.085, 0.02, 8, 0.6, 0.08, 0.35, 0xfafaf9);
    // Kerosene lamp for the evening trade.
    b.cyl(0.05, 0.06, 0.12, 8, 0.65, 0.07, -0.3, 0x4b5563);
    b.cyl(0.035, 0.035, 0.08, 8, 0.65, 0.17, -0.3, 0xfde68a);
  },
};

function shadeHex(c: number) {
  return new THREE.Color(c).multiplyScalar(0.75).getHex();
}

// ---- signboards ---------------------------------------------------------------

let signMaterial: THREE.MeshStandardMaterial | null = null;

/** A painted signboard mesh for a shop (shared atlas texture). */
export function signMesh(sign: NonNullable<ShopModel['sign']>) {
  signMaterial ??= new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.7 });
  const geo = new THREE.PlaneGeometry(sign.w, sign.h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const v0 = 1 - (sign.row + 1) / SIGNS.length, v1 = 1 - sign.row / SIGNS.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  const mesh = new THREE.Mesh(geo, signMaterial);
  mesh.position.set(sign.x, sign.y, sign.z);
  return mesh;
}

function signAtlas() {
  // Tall rows so marks that hang below the letters (like the ু in ফুচকা) have room and stay legible.
  const W = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H * SIGNS.length;
  const g = c.getContext('2d')!;
  SIGNS.forEach(([text, bg, fg], i) => {
    const y = i * H;
    g.fillStyle = bg;
    g.fillRect(0, y, W, H);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, y + 8, W - 16, H - 16);
    g.fillStyle = fg;
    g.font = 'bold 62px "Kohinoor Bangla", "Bangla Sangam MN", "Noto Sans Bengali", sans-serif';
    g.textAlign = 'center';
    // Alphabetic baseline a little above centre: the headline sits high, hanging marks fit below.
    g.textBaseline = 'alphabetic';
    g.fillText(text, W / 2, y + 92, W - 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
