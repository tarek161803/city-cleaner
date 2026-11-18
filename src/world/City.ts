import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { PartsBuilder } from '../city/Parts';
import { clamp, mulberry32 } from '../core/math';
import {
  asphaltTexture,
  billboardTexture,
  claddingTexture,
  glassTexture,
  kerbTexture,
  paverTexture,
  plasterTexture,
  shutterTexture,
  signAtlasTexture,
  type SignStyle,
} from './Textures';

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

interface Lot {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
}

/** A city block: a raised footpath ring around an inner area packed with buildings. */
export interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  lots: Lot[];
  /** Tree trunks on the footpath (solid). */
  trees: CircleCollider[];
}

/** One direction of traffic along a road. */
/** Axis-aligned rectangle on the ground. */
interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Lane {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  /** Centre-line coordinate of the road this lane belongs to. */
  road: number;
  /** A raised divider runs down the middle: no cutting into the oncoming lane. */
  divided: boolean;
}

export interface StallSlot {
  x: number;
  z: number;
  facing: number;
  /** Hawker has pushed out off the footpath into the road, blocking the kerb lane. */
  onRoad: boolean;
}

const GRID = 5;
const BLOCK = 40;
/** Road width kerb to kerb: room for traffic to pass hawkers set up in the road. */
export const ROAD = 16;
const PITCH = BLOCK + ROAD;
/** Coordinate of the first road centre line. */
const FIRST_ROAD = -(GRID * PITCH) / 2;
export const FOOTPATH = 2.5;
export const CURB = 0.15;
export const WORLD_HALF = -FIRST_ROAD + ROAD / 2 - 1;
/** Bangladesh drives on the left. */
export const LANE_OFFSET = 3.0;
/** Half width of the road divider. */
export const MEDIAN_HALF = 0.7;
const MEDIAN_H = 0.25;
/** Roads with a divider: north–south roads at these x, east–west roads at these z. */
/** Centre line of the k-th road from the west/north edge. */
export const roadCentre = (k: number) => FIRST_ROAD + k * PITCH;
const DIVIDED_NS = [roadCentre(3)];
const DIVIDED_EW = [roadCentre(3)];
/** The metro viaduct runs above this north–south road. */
const METRO_X = roadCentre(3);
const DECK_Y = 8.3;
const DECK_TOP = DECK_Y + 0.5;
const PILLAR_EVERY = 12;
const TRAIN_SPEED = 14;
const TRAIN_CARS = 4;
const CAR_LEN = 19;
const POSTERS: [string[], string, string][] = [
  [['পরিচ্ছন্ন শহর', 'সবুজ শহর'], '#1f7a4a', '#ffffff'],
  [['টু-লেট', '২ রুম'], '#f5c518', '#b3121f'],
  [['পাত্রী চাই', '০১৭XX-XXXXXX'], '#fdf6e3', '#c1121f'],
  [['আমার শহর', 'আমার দায়িত্ব'], '#ffffff', '#1d4ed8'],
];
const FLOOR = 3.2;
/** Electric poles stand along each footpath edge every POLE_EVERY metres from POLE_START. */
const POLE_START = 3;
const POLE_EVERY = 12;
/** Chance of a hawker in each footpath spot (two between every pair of poles). */
const FOOTPATH_STALL_CHANCE = 0.35;
/** Chance of a cart pushed out into the road at each of three spots per side. */
const ROAD_STALL_CHANCE = 0.15;
const PAVER_TILE = 1.6;
const KERB_H = 0.2;
/** Length of one yellow+black kerb stripe pair (m). */
const KERB_TILE = 1.6;
/** Trees stand this far in from the kerb. */
const TREE_INSET = 0.6;
const LAUNDRY = [0xdc2626, 0x2563eb, 0xfacc15, 0x16a34a, 0xf472b6, 0xffffff, 0x7c3aed];
const LEAVES = [0x3f7d34, 0x4c8c3a, 0x5a9a40, 0x2f6b2e, 0x6aa84f];

const pick = <T>(rng: () => number, a: T[]) => a[Math.floor(rng() * a.length)];

interface StreetGeometry {
  props: PartsBuilder;
  /** One per facade style (see FACADES). */
  facades: BuildingGeometry[];
  shopfronts: BuildingGeometry;
  signs: BuildingGeometry;
  billboards: BuildingGeometry;
  paving: BuildingGeometry;
  kerbs: BuildingGeometry;
}

/** Plaster tints: creams and beiges, plus Dhaka's pastel pinks, mints, sky blues and lemons. */
const WALL_COLORS = [
  0xe8dcc0, 0xd9c7a3, 0xf0e6d2, 0xc9b8a0, 0xe0b8a8, 0xb8c8d0, 0xd8d0b8, 0xa8a49c, 0xe6c9a0, 0xc2a88a, 0xd6e0c4,
  0xf2c4ce, 0xbfe3d0, 0xbcd7f0, 0xf3e7a1, 0xe9d5f5, 0xf5d0a9, 0x9fb7a8, 0xd9e8e2,
];
const GLASS_TINTS = [0xffffff, 0xd8f0ff, 0xd4f5e9];
/** Facade geometry slots: three painted-plaster styles, tile cladding, weathered cement, glass. */
const FACADES = 6;
const CLAD0 = 3;
/** Tile cladding tints: white, off-white, cream, pale grey, a light terracotta. */
const TILE_TINTS = [0xffffff, 0xf4f1ea, 0xece3cf, 0xdedfe0, 0xe8cfc0, 0xd5dde2];
/** Bare cement: greys from fresh to rain-darkened. */
const CEMENT_TINTS = [0xe2e2de, 0xcfd0cc, 0xbcbdb8, 0xd8d3c8];
const GLASS = 5;
/** Generic shop names (main line, optional second line). */
const SHOP_NAMES: [string, string?][] = [
  ['রহিম স্টোর', 'জেনারেল স্টোর'],
  ['ঢাকা ফার্মেসী', '২৪ ঘণ্টা খোলা'],
  ['বিসমিল্লাহ হোটেল', 'এন্ড রেস্টুরেন্ট'],
  ['মায়ের দোয়া টেলিকম', 'ফ্লেক্সিলোড • বিকাশ'],
  ['নিউ মডেল টেইলার্স'],
  ['ভাই ভাই ইলেকট্রনিক্স', 'মোবাইল: ০১৭XX-XXXXXX'],
  ['মদিনা মিষ্টান্ন ভান্ডার'],
  ['আল-আমিন বস্ত্রালয়', 'শাড়ি • লুঙ্গি • থান কাপড়'],
  ['জননী ফার্নিচার'],
  ['সততা জেনারেল স্টোর'],
  ['রূপসী বিউটি পার্লার', 'শুধুমাত্র মহিলাদের জন্য'],
  ['আধুনিক ডায়াগনস্টিক সেন্টার'],
  ['স্বপ্ন কম্পিউটার', 'প্রিন্ট • ফটোকপি • কম্পোজ'],
  ['লাকি হার্ডওয়্যার'],
  ['নিউ স্টার কনফেকশনারী'],
  ['চাঁদ বিরিয়ানি হাউস', 'কাচ্চি • তেহারি'],
  ['প্রাইম কোচিং সেন্টার', 'ভর্তি চলিতেছে'],
  ['আরাফাত অপটিক্স'],
  ['ফ্রেন্ডস সেলুন', 'AC'],
  ['সোনার বাংলা জুয়েলার্স'],
  ['মা-বাবার দোয়া ট্রেডার্স'],
  ['গ্রামীণ ক্রোকারিজ'],
  ['সবুজ বাংলা নার্সারি'],
  ['দিশা ট্রাভেলস', 'টিকিট • ভিসা প্রসেসিং'],
];
const SIGN_COLORS: [string, string, string][] = [
  ['#0b6e4f', '#ffd60a', '#ffffff'],
  ['#ffffff', '#c1121f', '#c1121f'],
  ['#c1121f', '#ffe066', '#ffe066'],
  ['#1d4ed8', '#ffffff', '#ffffff'],
  ['#ffd60a', '#1b1b1b', '#1b1b1b'],
  ['#6a1b9a', '#f9a8d4', '#ffffff'],
  ['#e85d04', '#ffffff', '#ffffff'],
  ['#14532d', '#ffe066', '#ffe066'],
  ['#111827', '#f59e0b', '#f59e0b'],
  ['#0e7490', '#fde68a', '#ffffff'],
  ['#f8fafc', '#15803d', '#15803d'],
  ['#7f1d1d', '#fca5a5', '#fff7ed'],
];
const SIGN_LOOKS: SignStyle['look'][] = ['plain', 'band', 'stripes', 'badge'];
/** Each name gets its own colours and layout (deterministic so the city looks the same each run). */
const SIGNS: SignStyle[] = (() => {
  const r = mulberry32(77);
  return SHOP_NAMES.map(([main, sub]) => {
    const [bg, bg2, fg] = SIGN_COLORS[Math.floor(r() * SIGN_COLORS.length)];
    return { main, sub, bg, bg2, fg, look: SIGN_LOOKS[Math.floor(r() * SIGN_LOOKS.length)] };
  });
})();
const BILLBOARDS: [string, string, string, string][] = [
  ['ফ্ল্যাট বিক্রয় চলিতেছে', 'রেডি ফ্ল্যাট • সহজ কিস্তি', '#0f766e', '#f59e0b'],
  ['ভর্তি চলিতেছে', 'এসএসসি • এইচএসসি • অ্যাডমিশন', '#1d4ed8', '#facc15'],
  ['টাটকা চা পাতা', 'এক কাপেই সতেজ সকাল', '#166534', '#dc2626'],
  ['সুপার ক্লিন সাবান', 'জীবাণু দূর, ত্বক কোমল', '#be185d', '#38bdf8'],
];

const _v = new THREE.Vector3();

export class City {
  /** Playable blocks only (the outer ring of buildings is scenery). */
  readonly blocks: Block[] = [];
  readonly lanes: Lane[] = [];
  readonly stallSlots: StallSlot[] = [];
  /** Raised road dividers (walkable, but vehicles keep out). */
  private medians: Rect[] = [];
  /** Metro pillars: solid for anyone on foot. */
  private pillars: CircleCollider[] = [];
  private trains: { group: THREE.Group; dir: number }[] = [];
  /** Moving or destructible obstacles, refreshed every frame. */
  dynamic: CircleCollider[] = [];
  readonly sunDir = new THREE.Vector3();
  readonly sun = new THREE.DirectionalLight(0xfff0d6, 2.9);
  private rng = mulberry32(11);

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x0 = FIRST_ROAD + ROAD / 2 + i * PITCH;
        const z0 = FIRST_ROAD + ROAD / 2 + j * PITCH;
        this.blocks.push({ x0, x1: x0 + BLOCK, z0, z1: z0 + BLOCK, lots: [], trees: [] });
      }
    }
  }

  build() {
    this.buildSky();
    this.buildLights();
    // Stall spots first, so street trees can keep clear of them.
    this.buildStallSlots();
    this.buildStreets();
    this.buildLanes();
  }

  // ---- queries ------------------------------------------------------------

  nearestBlock(x: number, z: number) {
    const i = clamp(Math.round((x - FIRST_ROAD - PITCH / 2) / PITCH), 0, GRID - 1);
    const j = clamp(Math.round((z - FIRST_ROAD - PITCH / 2) / PITCH), 0, GRID - 1);
    return this.blocks[i * GRID + j];
  }

  heightAt(x: number, z: number) {
    const b = this.nearestBlock(x, z);
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return CURB;
    for (const m of this.medians) if (x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1) return MEDIAN_H;
    return 0;
  }

  /** Metro trains shuttle along the viaduct. */
  update(dt: number) {
    for (const t of this.trains) {
      t.group.position.z += t.dir * TRAIN_SPEED * dt;
      const end = WORLD_HALF + 80;
      if (t.dir > 0 && t.group.position.z > end) t.group.position.z = -end;
      if (t.dir < 0 && t.group.position.z < -end) t.group.position.z = end;
    }
  }

  /** True if the point is inside a building. */
  solidAt(x: number, y: number, z: number) {
    const b = this.nearestBlock(x, z);
    for (const l of b.lots) {
      if (x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1) return y < CURB + l.h;
    }
    return false;
  }

  /** Pushes a circle of radius r out of buildings and dynamic obstacles. */
  pushOut(pos: THREE.Vector3, r: number) {
    const b = this.nearestBlock(pos.x, pos.z);
    const x0 = b.x0 + FOOTPATH - r, x1 = b.x1 - FOOTPATH + r;
    const z0 = b.z0 + FOOTPATH - r, z1 = b.z1 - FOOTPATH + r;
    if (pos.x > x0 && pos.x < x1 && pos.z > z0 && pos.z < z1) {
      const dl = pos.x - x0, dr = x1 - pos.x, dn = pos.z - z0, df = z1 - pos.z;
      const m = Math.min(dl, dr, dn, df);
      if (m === dl) pos.x = x0;
      else if (m === dr) pos.x = x1;
      else if (m === dn) pos.z = z0;
      else pos.z = z1;
    }
    for (const c of b.trees) pushFromCircle(pos, r, c);
    for (const c of this.pillars) pushFromCircle(pos, r, c);
    for (const c of this.dynamic) pushFromCircle(pos, r, c);
  }

  // Footpath "rings": a rectangle inset d from the block edge, parameterised by perimeter distance p.

  ringPoint(b: Block, p: number, d: number, out: THREE.Vector3) {
    const L = BLOCK - 2 * d;
    p = ((p % (4 * L)) + 4 * L) % (4 * L);
    const side = Math.floor(p / L), t = p - side * L;
    const x0 = b.x0 + d, x1 = b.x1 - d, z0 = b.z0 + d, z1 = b.z1 - d;
    if (side === 0) return out.set(x0 + t, CURB, z0);
    if (side === 1) return out.set(x1, CURB, z0 + t);
    if (side === 2) return out.set(x1 - t, CURB, z1);
    return out.set(x0, CURB, z1 - t);
  }

  ringProject(b: Block, x: number, z: number, d: number) {
    const L = BLOCK - 2 * d;
    const x0 = b.x0 + d, x1 = b.x1 - d, z0 = b.z0 + d, z1 = b.z1 - d;
    const cx = clamp(x, x0, x1), cz = clamp(z, z0, z1);
    const dist = [Math.abs(cz - z0), Math.abs(cx - x1), Math.abs(cz - z1), Math.abs(cx - x0)];
    const side = dist.indexOf(Math.min(...dist));
    if (side === 0) return cx - x0;
    if (side === 1) return L + (cz - z0);
    if (side === 2) return 2 * L + (x1 - cx);
    return 3 * L + (z1 - cz);
  }

  randomFootpath() {
    const block = this.blocks[Math.floor(Math.random() * this.blocks.length)];
    const d = 1.3 + Math.random() * 0.9;
    return { block, d, p: Math.random() * 4 * (BLOCK - 2 * d) };
  }

  /** Keeps the shadow frustum centred on the player. */
  follow(p: THREE.Vector3) {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(p);
  }

  // ---- construction --------------------------------------------------------

  private buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.8;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(220));
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    // Light Dhaka haze.
    this.scene.fog = new THREE.Fog(0xdcd5c6, 45, 230);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xe2ebf7, 0x8a7f6a, 1.25));
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    const c = s.shadow.camera;
    c.left = c.bottom = -45;
    c.right = c.top = 45;
    c.near = 1;
    c.far = 220;
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.04;
    this.scene.add(s, s.target);
  }

  private buildStreets() {
    const asphalt = asphaltTexture();
    asphalt.repeat.set(420 / 8, 420 / 8);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }),
    );
    ground.receiveShadow = true;
    this.scene.add(ground);

    const props = new PartsBuilder();
    const facades = Array.from({ length: FACADES }, () => new BuildingGeometry());
    const shopfronts = new BuildingGeometry();
    const billboards = new BuildingGeometry();
    const signs = new BuildingGeometry();
    const paving = new BuildingGeometry();
    const kerbs = new BuildingGeometry();
    const wires: number[] = [];

    // Dashed centre lines.
    for (let k = 0; k <= GRID; k++) {
      const c = FIRST_ROAD + k * PITCH;
      for (let s = -WORLD_HALF; s < WORLD_HALF; s += 7) {
        props.box(0.14, 0.02, 3, c, 0.01, s, 0xcfc8b0);
        props.box(3, 0.02, 0.14, s, 0.01, c, 0xcfc8b0);
      }
    }

    // Playable blocks plus a ring of scenery blocks so the edge roads have buildings on both sides.
    for (let i = -1; i <= GRID; i++) {
      for (let j = -1; j <= GRID; j++) {
        const inner = i >= 0 && i < GRID && j >= 0 && j < GRID;
        const b: Block = inner
          ? this.blocks[i * GRID + j]
          : (() => {
              const x0 = FIRST_ROAD + ROAD / 2 + i * PITCH, z0 = FIRST_ROAD + ROAD / 2 + j * PITCH;
              return { x0, x1: x0 + BLOCK, z0, z1: z0 + BLOCK, lots: [], trees: [] };
            })();
        this.buildBlock(b, { props, facades, shopfronts, signs, billboards, paving, kerbs }, inner ? wires : null);
      }
    }

    this.buildMedians(props, kerbs);
    const propMesh = props.build();
    this.scene.add(propMesh);

    const textured = (geo: BuildingGeometry, map: THREE.Texture, shadows = true) => {
      const mesh = new THREE.Mesh(geo.toGeometry(), new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9 }));
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    const facadeTextures = [plasterTexture(0), plasterTexture(1), plasterTexture(2), claddingTexture(0), claddingTexture(1), glassTexture()];
    facades.forEach((f, i) => textured(f, facadeTextures[i]));
    textured(shopfronts, shutterTexture(), false);
    textured(billboards, billboardTexture(BILLBOARDS), false);
    textured(paving, paverTexture(), false);
    textured(kerbs, kerbTexture(), false);
    this.buildMetro();

    const signTex = signAtlasTexture(SIGNS);
    const sMesh = new THREE.Mesh(
      signs.toGeometry(),
      new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6 }),
    );
    this.scene.add(sMesh);

    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x151515 })));
  }

  private buildBlock(b: Block, geo: StreetGeometry, wires: number[] | null) {
    const { props } = geo;
    const rng = this.rng;
    const white = new THREE.Color(1, 1, 1);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    // Brick-paver footpath with a raised yellow-and-black kerb, and a yellow edge line on the road.
    geo.paving.top(b.x0, b.x1, b.z0, b.z1, CURB, PAVER_TILE, white);
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = cx + nx * (BLOCK / 2), ez = cz + nz * (BLOCK / 2);
      geo.kerbs.face(ex, ez, nx, nz, BLOCK, 0, KERB_H, [[0, 0], [BLOCK / KERB_TILE, 0], [BLOCK / KERB_TILE, 1], [0, 1]], white);
      geo.kerbs.strip(ex - nx * 0.12, ez - nz * 0.12, nx, nz, BLOCK, 0.24, KERB_H, KERB_TILE, white);
      props.box(nz ? BLOCK : 0.12, 0.02, nx ? BLOCK : 0.12, ex + nx * 0.45, 0.012, ez + nz * 0.45, 0xd9a62a);
    }
    this.plantTrees(b, props);
    const ix0 = b.x0 + FOOTPATH, ix1 = b.x1 - FOOTPATH, iz0 = b.z0 + FOOTPATH, iz1 = b.z1 - FOOTPATH;
    const xs = this.splits(ix0, ix1), zs = this.splits(iz0, iz1);
    for (let a = 0; a < xs.length - 1; a++) {
      for (let c = 0; c < zs.length - 1; c++) {
        const lot: Lot = { x0: xs[a], x1: xs[a + 1], z0: zs[c], z1: zs[c + 1], h: (2 + Math.floor(rng() * 8)) * FLOOR };
        b.lots.push(lot);
        this.buildLot(lot, { ix0, ix1, iz0, iz1 }, geo);
      }
    }
    if (!wires) return;

    // Electric poles along the footpath edge, strung with sagging bundles of wire.
    const sides: { start: THREE.Vector3; along: THREE.Vector3; n: THREE.Vector3 }[] = [
      { start: new THREE.Vector3(b.x0, 0, b.z0 + 0.35), along: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, -1) },
      { start: new THREE.Vector3(b.x1 - 0.35, 0, b.z0), along: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(1, 0, 0) },
      { start: new THREE.Vector3(b.x1, 0, b.z1 - 0.35), along: new THREE.Vector3(-1, 0, 0), n: new THREE.Vector3(0, 0, 1) },
      { start: new THREE.Vector3(b.x0 + 0.35, 0, b.z1), along: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(-1, 0, 0) },
    ];
    for (const s of sides) {
      let prev: THREE.Vector3 | null = null;
      for (let t = POLE_START; t < BLOCK - 2; t += POLE_EVERY) {
        const p = s.start.clone().addScaledVector(s.along, t);
        props.cyl(0.09, 0.12, 7.2, 6, p.x, CURB + 3.6, p.z, 0x8c8c86);
        props.box(0.08, 0.08, 1.3, p.x, CURB + 6.7, p.z, 0x6e6e68, 0, Math.atan2(s.n.x, s.n.z), 0);
        if (rng() < 0.12) props.box(0.6, 0.8, 0.5, p.x + s.n.x * 0.3, CURB + 5.2, p.z + s.n.z * 0.3, 0x5c6b5a);
        if (prev) {
          const strands = 3 + Math.floor(rng() * 4);
          for (let k = 0; k < strands; k++) {
            const h0 = 5.4 + rng() * 1.4, h1 = 5.4 + rng() * 1.4;
            sagWire(wires, _v.set(prev.x, h0, prev.z), new THREE.Vector3(p.x, h1, p.z), 0.2 + rng() * 0.7);
          }
        }
        if (rng() < 0.3) {
          const across = p.clone().addScaledVector(s.n, ROAD + 0.7);
          sagWire(wires, new THREE.Vector3(p.x, 6.4, p.z), across.setY(6.2), 0.5 + rng() * 0.6);
        }
        prev = p;
      }
    }
  }

  /**
   * One building: facade style and colour, ground-floor shopfronts with signboards, an optional
   * stepped-back top, balconies with laundry, AC units, and a cluttered roof (parapet, water tank,
   * stair room, dish, antenna, plants, sometimes a billboard).
   */
  private buildLot(lot: Lot, inner: { ix0: number; ix1: number; iz0: number; iz1: number }, geo: StreetGeometry) {
    const rng = this.rng;
    const { props, signs } = geo;
    const floors = Math.round(lot.h / FLOOR);
    const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0;
    const style = floors >= 7 && rng() < 0.22 ? GLASS : rng() < 0.32 ? CLAD0 + Math.floor(rng() * 2) : Math.floor(rng() * 3);
    const glass = style === GLASS;
    const tint = glass
      ? new THREE.Color(pick(rng, GLASS_TINTS))
      : style === CLAD0
        ? new THREE.Color(pick(rng, TILE_TINTS))
        : style === CLAD0 + 1
          ? new THREE.Color(pick(rng, CEMENT_TINTS)).multiplyScalar(0.9 + rng() * 0.1)
          : new THREE.Color(pick(rng, WALL_COLORS)).multiplyScalar(0.86 + rng() * 0.14);
    const facade = geo.facades[style];

    // Street-facing sides: [centre x, centre z, normal x, normal z, length].
    const faces = (x0: number, x1: number, z0: number, z1: number) => {
      const out: [number, number, number, number, number][] = [];
      if (lot.x0 === inner.ix0) out.push([x0, (z0 + z1) / 2, -1, 0, z1 - z0]);
      if (lot.x1 === inner.ix1) out.push([x1, (z0 + z1) / 2, 1, 0, z1 - z0]);
      if (lot.z0 === inner.iz0) out.push([(x0 + x1) / 2, z0, 0, -1, x1 - x0]);
      if (lot.z1 === inner.iz1) out.push([(x0 + x1) / 2, z1, 0, 1, x1 - x0]);
      return out;
    };
    const street = faces(lot.x0, lot.x1, lot.z0, lot.z1);

    // Ground floor: rolling shutters and open shops, each bay with its own signboard.
    const shops = !glass && rng() < 0.78;
    let base = CURB;
    if (shops) {
      geo.shopfronts.box(lot.x0, lot.x1, lot.z0, lot.z1, CURB, CURB + FLOOR, new THREE.Color(1, 1, 1), { roof: false, uTile: 8 });
      base = CURB + FLOOR;
      for (const [fx, fz, nx, nz, len] of street) {
        const n = Math.max(1, Math.round(len / 5));
        const bay = len / n;
        for (let k = 0; k < n; k++) {
          if (rng() < 0.12) continue;
          const t = -len / 2 + bay * (k + 0.5);
          const sw = bay - 0.5, sh = Math.min(1.0, Math.max(0.7, sw * 0.17));
          signs.sign(fx + nz * t + nx * 0.07, CURB + FLOOR - sh / 2 - 0.08, fz - nx * t + nz * 0.07, nx, nz, sw, sh, Math.floor(rng() * SIGNS.length), SIGNS.length);
        }
      }
    }

    // Main block, and sometimes a narrower stepped-back top.
    const setback = !glass && floors >= 6 && w > 8 && d > 8 && rng() < 0.35;
    const lowTop = setback ? CURB + Math.ceil(floors * 0.6) * FLOOR : CURB + lot.h;
    facade.box(lot.x0, lot.x1, lot.z0, lot.z1, base, lowTop, tint, { vStart: base - CURB });
    let roof = { x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1, y: lowTop };
    if (setback) {
      const inset = 1.4;
      roof = { x0: lot.x0 + inset, x1: lot.x1 - inset, z0: lot.z0 + inset, z1: lot.z1 - inset, y: CURB + lot.h };
      facade.box(roof.x0, roof.x1, roof.z0, roof.z1, lowTop, roof.y, tint, { vStart: lowTop - CURB });
      this.parapet(props, { ...roof, y: lowTop, x0: lot.x0, x1: lot.x1, z0: lot.z0, z1: lot.z1 }, tint);
    }

    if (glass) {
      // Curtain wall: a light fin along every floor line.
      for (const [fx, fz, nx, nz, len] of street) {
        for (let f = 1; f < floors; f++) {
          props.box(nx ? 0.18 : len, 0.12, nx ? len : 0.18, fx + nx * 0.09, CURB + f * FLOOR, fz + nz * 0.09, 0xc7d2d9);
        }
      }
    } else {
      const lowFloors = Math.round((lowTop - CURB) / FLOOR);
      for (const face of street) this.facadeRelief(props, face, style, tint, shops, lowFloors);
      for (const [fx, fz, nx, nz, len] of street) {
        // Balconies with railings (and laundry) on the balcony-door facade.
        if (style === 1) {
          for (let f = shops ? 1 : 0; f < lowFloors; f++) {
            for (let t = -len / 2 + 1.6; t < len / 2 - 1; t += FLOOR) {
              if (rng() < 0.3) continue;
              const bx = fx + nz * t + nx * 0.35, bz = fz - nx * t + nz * 0.35, by = CURB + f * FLOOR + 0.05;
              const along = nz ? 2.4 : 0.7, across = nz ? 0.7 : 2.4;
              props.box(nx ? 0.7 : 2.4, 0.12, nx ? 2.4 : 0.7, bx, by, bz, 0xd6d3cc);
              props.box(nx ? 0.04 : along, 0.8, nx ? across : 0.04, bx + nx * 0.33, by + 0.45, bz + nz * 0.33, 0x6b7280);
              if (rng() < 0.5) {
                for (let k = 0; k < 3; k++) {
                  const o = (k - 1) * 0.6;
                  props.box(nx ? 0.02 : 0.45, 0.55, nx ? 0.45 : 0.02, bx + nx * 0.34 + nz * o, by + 0.5, bz + nz * 0.34 - nx * o, pick(rng, LAUNDRY));
                }
              }
            }
          }
        }
        // AC units bolted to the wall.
        const acs = Math.floor(rng() * 3);
        for (let k = 0; k < acs; k++) {
          const f = (shops ? 1 : 0) + Math.floor(rng() * Math.max(1, lowFloors - (shops ? 1 : 0)));
          const t = (rng() - 0.5) * (len - 2);
          props.box(nx ? 0.35 : 0.8, 0.5, nx ? 0.8 : 0.35, fx + nz * t + nx * 0.18, CURB + f * FLOOR + 0.6, fz - nx * t + nz * 0.18, 0xe5e7eb);
        }
        // A bigger sign across the first floor now and then.
        if (rng() < 0.3 && lowFloors > 1) {
          const sw = Math.min(len - 1.2, 6.5);
          signs.sign(fx + nx * 0.06, CURB + FLOOR + 1.7, fz + nz * 0.06, nx, nz, sw, 1.1, Math.floor(rng() * SIGNS.length), SIGNS.length);
        }
      }
    }

    // Roof clutter.
    const top = roof.y;
    const rw = roof.x1 - roof.x0, rd = roof.z1 - roof.z0;
    const at = () => [roof.x0 + 1.5 + rng() * Math.max(0.1, rw - 3), roof.z0 + 1.5 + rng() * Math.max(0.1, rd - 3)];
    if (!glass) this.parapet(props, roof, tint);
    if (rng() < 0.65) {
      const [x, z] = at();
      props.cyl(0.7, 0.7, 1.3, 10, x, top + 0.65, z, pick(rng, [0x1d1d1d, 0x1d4ed8, 0xe5e7eb]));
      props.box(0.08, 0.6, 0.08, x + 0.4, top + 0.3, z, 0x4b5563);
    }
    if (rng() < 0.5) props.box(2.4, 2.6, 2.4, roof.x1 - 2, top + 1.3, roof.z1 - 2, tint.getHex());
    if (rng() < 0.3) {
      const [x, z] = at();
      props.cyl(0.4, 0.05, 0.12, 8, x, top + 0.9, z, 0xd1d5db, 0.9, rng() * 6, 0);
      props.box(0.05, 0.9, 0.05, x, top + 0.45, z, 0x6b7280);
    }
    if (rng() < 0.35) {
      const [x, z] = at();
      props.box(0.04, 3, 0.04, x, top + 1.5, z, 0x9ca3af);
      for (let k = 0; k < 3; k++) props.box(0.8 - k * 0.2, 0.03, 0.03, x, top + 2.2 + k * 0.3, z, 0x9ca3af);
    }
    if (rng() < 0.3) {
      for (let k = 0; k < 3; k++) {
        const [x, z] = at();
        props.box(0.35, 0.3, 0.35, x, top + 0.15, z, 0xb45309);
        props.add(new THREE.IcosahedronGeometry(0.3, 0), x, top + 0.5, z, pick(rng, LEAVES));
      }
    }
    // Rooftop billboard facing one of the streets.
    if (floors >= 5 && street.length && rng() < 0.2) {
      const [fx, fz, nx, nz] = street[0];
      const bw = Math.min(7, (nx ? rd : rw) - 0.5), bh = bw * (192 / 512);
      const bx = nx ? (nx < 0 ? roof.x0 : roof.x1) - nx * 1.2 : fx, bz = nz ? (nz < 0 ? roof.z0 : roof.z1) - nz * 1.2 : fz;
      for (const s of [-1, 1]) props.box(0.12, 1.8, 0.12, bx + nz * s * bw * 0.35, top + 0.9, bz - nx * s * bw * 0.35, 0x4b5563);
      props.box(nx ? 0.15 : bw + 0.2, bh + 0.2, nx ? bw + 0.2 : 0.15, bx - nx * 0.1, top + 1.8 + bh / 2, bz - nz * 0.1, 0x374151);
      const ad = Math.floor(rng() * 4);
      const u0 = (ad % 2) / 2, v0 = 1 - (Math.floor(ad / 2) + 1) / 2;
      geo.billboards.face(bx, bz, nx, nz, bw, top + 1.8, top + 1.8 + bh, [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]], new THREE.Color(1, 1, 1));
    }
  }

  /**
   * Depth on a street-facing wall: slab ledges at each floor, corner pilasters, concrete sunshades
   * (chajja) over the windows, and here and there a cantilevered balcony with a solid parapet and a
   * grill cage up to the slab above — the Dhaka apartment look. Window bays line up with the
   * facade texture (one bay per FLOOR metres along the wall, starting from the face's left end).
   */
  private facadeRelief(
    props: PartsBuilder, [fx, fz, nx, nz, len]: [number, number, number, number, number], style: number,
    tint: THREE.Color, shops: boolean, floors: number,
  ) {
    const rng = this.rng;
    const shade = (k: number) => tint.clone().multiplyScalar(k).getHex();
    const ledge = shade(0.9), concrete = shade(0.95);
    /** Box `w` wide along the wall, `depth` out from it (its centre `out` from the wall), centred at `t` along. */
    const slab = (t: number, out: number, y: number, w: number, h: number, depth: number, color: number) =>
      props.box(nx ? depth : w, h, nx ? w : depth, fx + nz * t + nx * out, y, fz - nx * t + nz * out, color);
    const top = CURB + floors * FLOOR;

    // Ledge at every floor line (the first one doubles as the shop awning ledge), corner pilasters.
    for (let f = 1; f < floors; f++) slab(0, 0.07, CURB + f * FLOOR, len + 0.1, 0.16, 0.14, f === 1 && shops ? shade(0.8) : ledge);
    for (const s of [-1, 1]) slab(s * (len / 2 - 0.15), 0.05, (CURB + top) / 2, 0.3, top - CURB, 0.1, ledge);

    // Where the window's top edge sits within a floor for each facade texture (style 1 has its own balconies).
    const windowTop = [2.55, 0, 2.55, 2.62, 2.7][style];
    if (!windowTop) return;
    const caged = style === 0 || style === 3;
    const bays = Math.floor(len / FLOOR);
    for (let k = 0; k < bays; k++) {
      const t = -len / 2 + (k + 0.5) * FLOOR;
      for (let f = shops ? 1 : 0; f < floors; f++) {
        const y0 = CURB + f * FLOOR;
        if (caged && rng() < 0.22) {
          // Balcony: slab, solid parapet front and sides, grill cage, sunshade roof.
          const bw = 2.6, bd = 0.9;
          slab(t, bd / 2, y0 + 0.06, bw, 0.12, bd, concrete);
          slab(t, bd - 0.04, y0 + 0.6, bw, 0.95, 0.08, tint.getHex());
          for (const s of [-1, 1]) slab(t + s * (bw / 2 - 0.04), bd / 2, y0 + 0.6, 0.08, 0.95, bd, tint.getHex());
          for (let b = -bw / 2 + 0.15; b < bw / 2; b += 0.22) slab(t + b, bd - 0.04, y0 + 1.82, 0.025, 1.5, 0.025, 0x4b5563);
          for (const y of [1.1, 2.55]) slab(t, bd - 0.04, y0 + y, bw, 0.04, 0.04, 0x4b5563);
          slab(t, (bd + 0.1) / 2, y0 + windowTop + 0.1, bw + 0.2, 0.1, bd + 0.1, concrete);
          if (rng() < 0.35) {
            const pt = t + (rng() - 0.5) * 1.6;
            slab(pt, bd - 0.2, y0 + 1.2, 0.25, 0.22, 0.25, 0xb45309);
            props.add(new THREE.IcosahedronGeometry(0.22, 0), fx + nz * pt + nx * (bd - 0.2), y0 + 1.42, fz - nx * pt + nz * (bd - 0.2), pick(rng, LEAVES));
          } else if (rng() < 0.4) {
            for (let c = 0; c < 2; c++) slab(t - 0.5 + c * 0.8, bd + 0.02, y0 + 1.75, 0.45, 0.55, 0.02, pick(rng, LAUNDRY));
          }
        } else {
          // Sunshade over the window, and a sill under the plaster windows.
          slab(t, 0.22, y0 + windowTop, style === 3 ? 3.0 : 2.6, 0.08, 0.45, concrete);
          if (style === 0 || style === 4) slab(t, 0.06, y0 + 0.76, 2.2, 0.06, 0.12, concrete);
        }
      }
    }
  }

  /** Low wall round the roof edge. */
  private parapet(props: PartsBuilder, r: { x0: number; x1: number; z0: number; z1: number; y: number }, tint: THREE.Color) {
    const c = tint.clone().multiplyScalar(0.9).getHex();
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    props.box(w, 0.9, 0.15, (r.x0 + r.x1) / 2, r.y + 0.45, r.z0 + 0.075, c);
    props.box(w, 0.9, 0.15, (r.x0 + r.x1) / 2, r.y + 0.45, r.z1 - 0.075, c);
    props.box(0.15, 0.9, d, r.x0 + 0.075, r.y + 0.45, (r.z0 + r.z1) / 2, c);
    props.box(0.15, 0.9, d, r.x1 - 0.075, r.y + 0.45, (r.z0 + r.z1) / 2, c);
  }

  /** Low-poly street trees and palms near the kerb, between the electric poles and clear of stalls. */
  private plantTrees(b: Block, props: PartsBuilder) {
    const rng = this.rng;
    const sides = [
      { at: (t: number) => [b.x0 + t, b.z0 + TREE_INSET] },
      { at: (t: number) => [b.x1 - TREE_INSET, b.z0 + t] },
      { at: (t: number) => [b.x1 - t, b.z1 - TREE_INSET] },
      { at: (t: number) => [b.x0 + TREE_INSET, b.z1 - t] },
    ];
    for (const side of sides) {
      for (let t = 9; t < BLOCK - 4; t += 12) {
        if (rng() > 0.6) continue;
        const [x, z] = side.at(t + (rng() - 0.5) * 2);
        if (this.stallSlots.some((s) => Math.abs(s.x - x) < 3 && Math.abs(s.z - z) < 3)) continue;
        const s = 0.85 + rng() * 0.4;
        if (rng() < 0.25) {
          // Palm: tall thin trunk, drooping fronds.
          props.cyl(0.08 * s, 0.12 * s, 5 * s, 6, x, CURB + 2.5 * s, z, 0x7a5c3e);
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            props.box(0.35 * s, 0.04, 1.6 * s, x + Math.sin(a) * 0.65 * s, CURB + 5 * s - 0.2, z + Math.cos(a) * 0.65 * s, pick(rng, LEAVES), 0.45, a, 0);
          }
        } else {
          props.cyl(0.11 * s, 0.17 * s, 2.4 * s, 6, x, CURB + 1.2 * s, z, 0x6b4a2b);
          props.add(new THREE.IcosahedronGeometry(1.5 * s, 0), x, CURB + 3.1 * s, z, pick(rng, LEAVES));
          props.add(new THREE.IcosahedronGeometry(1.0 * s, 0), x + 0.6 * s, CURB + 3.7 * s, z - 0.3 * s, pick(rng, LEAVES));
        }
        b.trees.push({ x, z, r: 0.25 });
      }
    }
  }

  private splits(a: number, b: number) {
    const n = 2 + (this.rng() < 0.5 ? 1 : 0);
    const out = [a];
    for (let k = 1; k < n; k++) out.push(a + (b - a) * (k / n + (this.rng() - 0.5) * 0.16));
    out.push(b);
    return out;
  }

  /** Raised dividers down the divided roads, broken at every junction, with bushes on top. */
  private buildMedians(props: PartsBuilder, kerbs: BuildingGeometry) {
    const white = new THREE.Color(1, 1, 1);
    const spans: [number, number][] = [];
    for (let i = 0; i < GRID; i++) spans.push([FIRST_ROAD + ROAD / 2 + i * PITCH + 1, FIRST_ROAD + ROAD / 2 + i * PITCH + BLOCK - 1]);
    const add = (alongZ: boolean, c: number) => {
      for (const [a, b] of spans) {
        const len = b - a;
        const m: Rect = alongZ
          ? { x0: c - MEDIAN_HALF, x1: c + MEDIAN_HALF, z0: a, z1: b }
          : { x0: a, x1: b, z0: c - MEDIAN_HALF, z1: c + MEDIAN_HALF };
        this.medians.push(m);
        const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
        props.box(m.x1 - m.x0, MEDIAN_H, m.z1 - m.z0, cx, MEDIAN_H / 2, cz, 0xcfc6b2);
        // Striped kerb faces on both long sides and the two ends.
        for (const s of [-1, 1]) {
          const [nx, nz] = alongZ ? [s, 0] : [0, s];
          kerbs.face(cx + nx * MEDIAN_HALF, cz + nz * MEDIAN_HALF, nx, nz, len, 0, MEDIAN_H, [[0, 0], [len / KERB_TILE, 0], [len / KERB_TILE, 1], [0, 1]], white);
          const [ex, ez] = alongZ ? [0, s] : [s, 0];
          kerbs.face(cx + ex * (len / 2), cz + ez * (len / 2), ex, ez, MEDIAN_HALF * 2, 0, MEDIAN_H, [[0, 0], [1, 0], [1, 1], [0, 1]], white);
        }
        for (let t = a + 2; t < b - 1; t += 2.6 + this.rng()) {
          const x = alongZ ? c : t, z = alongZ ? t : c;
          props.add(new THREE.IcosahedronGeometry(0.32 + this.rng() * 0.18, 0), x, MEDIAN_H + 0.22, z, pick(this.rng, LEAVES));
        }
      }
    };
    for (const c of DIVIDED_NS) add(true, c);
    for (const c of DIVIDED_EW) add(false, c);
  }

  /** Elevated metro line: pillars in the divider, a concrete deck, posters on pillars, trains on top. */
  private buildMetro() {
    const concrete = new PartsBuilder();
    const posters = new BuildingGeometry();
    const end = WORLD_HALF + 90;
    const x = METRO_X;
    // Deck, its darker underside, and parapets.
    concrete.box(9, 1.0, end * 2, x, DECK_Y, 0, 0xbab4a8);
    concrete.box(8.6, 0.12, end * 2, x, DECK_Y - 0.56, 0, 0x8f8a80);
    for (const s of [-1, 1]) concrete.box(0.25, 1.0, end * 2, x + s * 4.38, DECK_TOP + 0.5, 0, 0xc8c2b6);
    // Rails.
    for (const tx of [-1.6, 1.6]) for (const s of [-0.7, 0.7]) concrete.box(0.08, 0.12, end * 2, x + tx + s, DECK_TOP + 0.06, 0, 0x6b6b6b);

    const white = new THREE.Color(1, 1, 1);
    let posterIdx = 0;
    for (let z = -end + 6; z < end; z += PILLAR_EVERY) {
      // Pillars only inside the divider (not across junctions), plus scenery ones beyond the edge.
      const onMedian = this.medians.some((m) => x >= m.x0 && x <= m.x1 && z > m.z0 + 1 && z < m.z1 - 1);
      const beyond = Math.abs(z) > WORLD_HALF + 6;
      if (!onMedian && !beyond) continue;
      concrete.box(1.2, DECK_Y - 0.9, 1.2, x, (DECK_Y - 0.9) / 2, z, 0xb0aa9e);
      concrete.box(6.5, 0.9, 1.8, x, DECK_Y - 0.95, z, 0xa8a296);
      if (onMedian) {
        this.pillars.push({ x, z, r: 0.75 });
        // A poster on each road-facing side.
        for (const s of [-1, 1]) {
          const row = posterIdx++ % POSTERS.length;
          const u0 = row / POSTERS.length, u1 = (row + 1) / POSTERS.length;
          posters.face(x + s * 0.61, z, s, 0, 0.95, 2.0, 3.3, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], white);
        }
      }
    }
    const mesh = concrete.build();
    this.scene.add(mesh);
    const posterTex = posterTexture();
    this.scene.add(new THREE.Mesh(posters.toGeometry(), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.8 })));

    // Two trains, one on each track, heading opposite ways.
    for (const [tx, dir, z0] of [[-1.6, 1, -60], [1.6, -1, 90]] as const) {
      const b = new PartsBuilder();
      for (let k = 0; k < TRAIN_CARS; k++) {
        const cz = (k - (TRAIN_CARS - 1) / 2) * (CAR_LEN + 0.6);
        b.box(2.9, 3.2, CAR_LEN, 0, 1.75, cz, 0xf3f4f6);
        b.box(2.92, 0.9, CAR_LEN - 0.4, 0, 2.3, cz, 0x1f2937);
        b.box(2.94, 0.25, CAR_LEN, 0, 1.25, cz, 0xdc2626);
        b.box(2.94, 0.12, CAR_LEN, 0, 0.95, cz, 0x1d4ed8);
      }
      const nose = ((TRAIN_CARS - 1) / 2) * (CAR_LEN + 0.6) + CAR_LEN / 2;
      for (const s of [-1, 1]) b.box(2.4, 1.0, 0.1, 0, 2.4, s * (nose + 0.02), 0x111827);
      const group = new THREE.Group();
      group.add(b.build());
      group.position.set(x + tx, DECK_TOP, z0);
      this.scene.add(group);
      this.trains.push({ group, dir });
    }
  }

  private buildLanes() {
    const L = WORLD_HALF * 2;
    for (let k = 0; k <= GRID; k++) {
      const c = FIRST_ROAD + k * PITCH;
      const lane = (ox: number, oz: number, dx: number, dz: number) =>
        this.lanes.push({
          origin: new THREE.Vector3(ox, 0, oz),
          dir: new THREE.Vector3(dx, 0, dz),
          length: L,
          road: c,
          divided: dx === 0 ? DIVIDED_NS.includes(c) : DIVIDED_EW.includes(c),
        });
      lane(c + LANE_OFFSET, -WORLD_HALF, 0, 1);
      lane(c - LANE_OFFSET, WORLD_HALF, 0, -1);
      lane(-WORLD_HALF, c - LANE_OFFSET, 1, 0);
      lane(WORLD_HALF, c + LANE_OFFSET, -1, 0);
    }
  }

  /**
   * Hawker spots: stalls crowd the footpath, two to every gap between the electric poles
   * (pedestrians have to step into the road to get past), and carts (anything on wheels) sit out in
   * the road itself, eating into the kerb lane.
   */
  private buildStallSlots() {
    for (const b of this.blocks) {
      const sides = [
        { e: (t: number) => [b.x0 + t, b.z0], n: [0, -1] },
        { e: (t: number) => [b.x1, b.z0 + t], n: [1, 0] },
        { e: (t: number) => [b.x0 + t, b.z1], n: [0, 1] },
        { e: (t: number) => [b.x0, b.z0 + t], n: [-1, 0] },
      ];
      for (const s of sides) {
        const [nx, nz] = s.n;
        const add = (t: number, onRoad: boolean) => {
          const [ex, ez] = s.e(t);
          // On the road: centre 1.8 m out from the kerb, overlapping the kerb lane.
          const off = onRoad ? -1.8 : 0.7;
          this.stallSlots.push({ x: ex - nx * off, z: ez - nz * off, facing: Math.atan2(nx, nz), onRoad });
        };
        // Footpath: two spots in each gap between poles, clear of the poles and the corners.
        for (let pole = POLE_START; pole < BLOCK - 4; pole += POLE_EVERY) {
          for (const t of [pole + 3.2 + this.rng() * 0.6, pole + 7.8 + this.rng() * 0.6]) {
            if (t < BLOCK - 3 && this.rng() < FOOTPATH_STALL_CHANCE) add(t, false);
          }
        }
        for (const t of [7 + this.rng() * 5, 17 + this.rng() * 5, 28 + this.rng() * 5]) {
          if (this.rng() < ROAD_STALL_CHANCE) add(t, true);
        }
      }
    }
  }
}

function pushFromCircle(pos: THREE.Vector3, r: number, c: CircleCollider) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const min = c.r + r;
  if (Math.abs(dx) > min || Math.abs(dz) > min) return;
  const d = Math.hypot(dx, dz);
  if (d < min && d > 1e-4) {
    pos.x = c.x + (dx / d) * min;
    pos.z = c.z + (dz / d) * min;
  }
}

function sagWire(out: number[], a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const N = 8;
  const p = (t: number) => [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t];
  for (let k = 0; k < N; k++) out.push(...p(k / N), ...p((k + 1) / N));
}

/** Accumulates textured, vertex-coloured quads for buildings and signboards. */
class BuildingGeometry {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  private quad(corners: number[][], n: number[], uvs: number[][], color: THREE.Color) {
    const base = this.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      this.pos.push(...corners[k]);
      this.nor.push(...n);
      this.uv.push(...uvs[k]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Vertical quad facing (nx, nz), centred at (cx, cz), spanning y0..y1. */
  face(cx: number, cz: number, nx: number, nz: number, w: number, y0: number, y1: number, uvs: number[][], color: THREE.Color) {
    const rx = nz * (w / 2), rz = -nx * (w / 2);
    this.quad(
      [
        [cx - rx, y0, cz - rz],
        [cx + rx, y0, cz + rz],
        [cx + rx, y1, cz + rz],
        [cx - rx, y1, cz - rz],
      ],
      [nx, 0, nz],
      uvs,
      color,
    );
  }

  /**
   * Four textured walls (and a roof). `uTile` metres per texture repeat across, one floor per repeat
   * up; `vStart` offsets the floors so stacked boxes line their windows up.
   */
  box(
    x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, color: THREE.Color,
    opts: { roof?: boolean; uTile?: number; vStart?: number } = {},
  ) {
    const uTile = opts.uTile ?? FLOOR, vs = (opts.vStart ?? 0) / FLOOR;
    const v = vs + (y1 - y0) / FLOOR;
    const faceUv = (w: number) => [[0, vs], [w / uTile, vs], [w / uTile, v], [0, v]];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.face(x0, cz, -1, 0, z1 - z0, y0, y1, faceUv(z1 - z0), color);
    this.face(x1, cz, 1, 0, z1 - z0, y0, y1, faceUv(z1 - z0), color);
    this.face(cx, z0, 0, -1, x1 - x0, y0, y1, faceUv(x1 - x0), color);
    this.face(cx, z1, 0, 1, x1 - x0, y0, y1, faceUv(x1 - x0), color);
    if (opts.roof === false) return;
    // Roof samples a plain corner of the window texture.
    const roof = color.clone().multiplyScalar(0.7);
    const ru = [[0.05, 0.05], [0.05, 0.05], [0.05, 0.05], [0.05, 0.05]];
    this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], ru, roof);
  }

  /** Horizontal quad with world-aligned tiling (one texture repeat per `tile` metres). */
  top(x0: number, x1: number, z0: number, z1: number, y: number, tile: number, color: THREE.Color) {
    const u = (x: number) => x / tile, v = (z: number) => -z / tile;
    this.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], [[u(x0), v(z1)], [u(x1), v(z1)], [u(x1), v(z0)], [u(x0), v(z0)]], color);
  }

  /** Horizontal strip of length `len` and width `w` running along a side facing (nx, nz); u tiles along it. */
  strip(cx: number, cz: number, nx: number, nz: number, len: number, w: number, y: number, tile: number, color: THREE.Color) {
    const ax = Math.abs(nz) * (len / 2), az = Math.abs(nx) * (len / 2);
    const wx = Math.abs(nx) * (w / 2), wz = Math.abs(nz) * (w / 2);
    const x0 = cx - ax - wx, x1 = cx + ax + wx, z0 = cz - az - wz, z1 = cz + az + wz;
    const n = len / tile;
    const uvs = nx ? [[0, 0], [1, 0], [1, n], [0, n]] : [[0, 0], [n, 0], [n, 1], [0, 1]];
    this.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], uvs, color);
  }

  sign(cx: number, cy: number, cz: number, nx: number, nz: number, w: number, h: number, row: number, rows: number) {
    const v0 = 1 - (row + 1) / rows, v1 = 1 - row / rows;
    this.face(cx, cz, nx, nz, w, cy - h / 2, cy + h / 2, [[0, v0], [1, v0], [1, v1], [0, v1]], new THREE.Color(1, 1, 1));
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}


/** Atlas of Bangla shop signboards, one per row. */
/** Portrait posters pasted on the metro pillars, side by side in one atlas. */
function posterTexture() {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W * POSTERS.length;
  c.height = H;
  const g = c.getContext('2d')!;
  POSTERS.forEach(([lines, bg, fg], i) => {
    const x = i * W;
    g.fillStyle = bg;
    g.fillRect(x + 8, 8, W - 16, H - 16);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(x + 18, 18, W - 36, H - 36);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((line, k) => {
      g.font = `bold ${k === 0 ? 46 : 36}px "Kohinoor Bangla", "Bangla Sangam MN", "Noto Sans Bengali", sans-serif`;
      g.fillText(line, x + W / 2, 170 + k * 90, W - 40);
    });
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

