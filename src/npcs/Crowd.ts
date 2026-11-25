import * as THREE from 'three';
import { HumanRig, type Look } from '../core/HumanRig';
import type { City } from '../world/City';
import { CULL_DIST, Person, type PersonContext, type Post } from './Person';
import { QUALITY } from '../core/Quality';
import type { Vehicle, VehicleKind } from '../city/Vehicle';

const PEDESTRIANS = QUALITY.pedestrians;
/**
 * Walkers (people with no rickshaw or stall of their own) are capped at this: owners who fled add to
 * the crowd, and the calm, distant extras are removed. Drivers and shopkeepers don't count.
 */
const MAX_WALKERS = QUALITY.maxWalkers;
const PRUNE_DIST = 90;
/**
 * Walkers further than this from the player are moved to a footpath RECYCLE_TO metres away: just past
 * the distance people are drawn at, so they walk into view rather than pop in.
 */
const RECYCLE_DIST = CULL_DIST + 35;
const RECYCLE_TO = [CULL_DIST + 2, CULL_DIST + 25] as const;
/** At most this many walkers are moved per frame. */
const RECYCLE_PER_FRAME = 4;

const _v = new THREE.Vector3();

const SKINS = [0x8d5524, 0xa0673a, 0xb87a4b, 0x6f4228, 0xc68e5a, 0x7a4a2a, 0x9a6440];
const HAIR = [0x0d0d0d, 0x161210, 0x1f1a17];
/** Office/everyday shirts: whites, blues, checks-ish tones. */
const SHIRTS = [0xf2f2f2, 0xdbe7f3, 0x3b6ea5, 0x7fb3d5, 0xb5452f, 0x2f6b4f, 0x6a4c93, 0xd9c8a0, 0x8a9a5b];
const TSHIRTS = [0x2b2b2b, 0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6d4c41, 0x37474f, 0xf5f5f5];
const PRINTS = [0xfacc15, 0xffffff, 0xe11d48, 0x22d3ee, 0x111827];
const TROUSERS = [0x2b2b2b, 0x3a4a63, 0x5a4a3a, 0x6b6b6b, 0xa89f8a, 0x1f2a44];
const JEANS = [0x2b3a55, 0x3b4f73, 0x1f2937, 0x4b5d80];
const SAREES = [0xc2185b, 0x8e24aa, 0x00897b, 0xf57c00, 0x3949ab, 0xd81b60, 0xfbc02d, 0x2e7d32, 0xb71c1c];
const BLOUSES = [0xfacc15, 0x7c3aed, 0x16a34a, 0xdc2626, 0x1d4ed8, 0xf472b6];
const KAMEEZ = [0xf472b6, 0x60a5fa, 0xa78bfa, 0x34d399, 0xfbbf24, 0xfb7185, 0x2dd4bf, 0xf5f5f5];
const SALWAR = [0xf5f5f5, 0x1f2937, 0xfde68a, 0xc4b5fd, 0x99f6e4];
const GOLD = [0xd4a017, 0xe8c547, 0xc0392b];
const LUNGIS = [0x2e5e3e, 0x5a2e2e, 0x2e3e6e, 0x4a4a2a, 0x3d3d6b, 0x1e3a5f];
const LUNGI_CHECKS = [0x8fa3b8, 0xc8b88a, 0x9bb59b, 0xb08888];
const VESTS = [0xe8e8e8, 0xd4d0c4, 0xa8b3bd, 0xe8d8b0];
const WORN_TEES = [0x8a8a8a, 0x5b7c99, 0xa0522d, 0x6b705c, 0x9c6644];
const GAMCHHA = [0xc62828, 0xd84315, 0x2e7d32, 0x1565c0];
/** Polo shirts: solid colours, tipped collars. */
const POLOS = [0x1d3557, 0xf5f5f5, 0x991b1b, 0x166534, 0x0e7490, 0x4b5563, 0xca8a04, 0x111827];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;

/** A sharp young man: fitted navy shirt with rolled sleeves, belt, dark jeans, white sneakers, shades. */
export const PLAYER_LOOK: Look = {
  skin: 0xb07a50,
  hair: 0x0d0d0d,
  hairStyle: 'quiff',
  top: 'shirt',
  topColor: 0x1d3557,
  accent: 0xf5f5f5,
  sleeves: 'rolled',
  bottom: 'jeans',
  bottomColor: 0x22304a,
  feet: 'sneakers',
  belt: 0x5a3a20,
  shades: true,
  watch: true,
};

/** Shirt (55%), polo (20%) or t-shirt, with matching accent and sleeves. */
function manTop(): Pick<Look, 'top' | 'topColor' | 'accent' | 'sleeves'> {
  const r = Math.random();
  if (r < 0.55) return { top: 'shirt', topColor: pick(SHIRTS), accent: 0xf5f5f5, sleeves: pick(['long', 'rolled', 'short'] as const) };
  if (r < 0.75) return { top: 'polo', topColor: pick(POLOS), accent: pick([0xf5f5f5, 0xfacc15, 0xdc2626, 0x111827]), sleeves: 'short' };
  return { top: 'tshirt', topColor: pick(TSHIRTS), accent: pick(PRINTS), sleeves: 'short' };
}

function manLook(): Look {
  const top = manTop();
  const jeans = chance(0.4);
  return {
    skin: pick(SKINS),
    hair: pick(HAIR),
    hairStyle: chance(0.08) ? 'bald' : 'short',
    ...top,
    bottom: jeans ? 'jeans' : 'trousers',
    bottomColor: jeans ? pick(JEANS) : pick(TROUSERS),
    feet: chance(0.6) ? 'sandals' : chance(0.5) ? 'shoes' : 'sneakers',
    belt: top.top !== 'tshirt' ? pick([0x2b1d14, 0x111111, 0x5a3a20]) : undefined,
    beard: chance(0.2),
    mustache: chance(0.25),
  };
}

function womanLook(): Look {
  const base = { skin: pick(SKINS), hair: pick(HAIR), hairStyle: 'long' as const, feet: 'sandals' as const };
  if (chance(0.5)) {
    // Saree: blouse, draped skirt with a gold border, aanchal over the shoulder.
    const saree = pick(SAREES);
    return { ...base, top: 'blouse', topColor: pick(BLOUSES), accent: pick(GOLD), sleeves: 'short', bottom: 'saree', bottomColor: saree, drape: saree };
  }
  // Salwar kameez with a dupatta.
  const kameez = pick(KAMEEZ);
  return {
    ...base,
    top: 'kameez',
    topColor: kameez,
    accent: pick(GOLD),
    sleeves: chance(0.5) ? 'long' : 'short',
    bottom: 'salwar',
    bottomColor: pick(SALWAR),
    drape: pick([...KAMEEZ, ...SALWAR].filter((c) => c !== kameez)),
  };
}

function pedestrianLook(): Look {
  return chance(0.42) ? womanLook() : manLook();
}

function driverLook(kind: VehicleKind): Look {
  const look = manLook();
  // Bikers wear a helmet.
  if (kind === 'bike') look.helmet = pick([0x111827, 0xdc2626, 0xf5f5f5, 0x1d4ed8, 0xfacc15]);
  return look;
}

/** Rickshaw puller: vest or worn tee, checked lungi, gamchha round the neck or on the head. */
function pullerLook(): Look {
  const vest = chance(0.5);
  return {
    skin: pick(SKINS.slice(0, 4)),
    hair: pick(HAIR),
    hairStyle: 'short',
    top: vest ? 'vest' : 'tshirt',
    topColor: vest ? pick(VESTS) : pick(WORN_TEES),
    // Accent doubles as the lungi's check bands.
    accent: pick(LUNGI_CHECKS),
    sleeves: vest ? 'none' : 'short',
    bottom: 'lungi',
    bottomColor: pick(LUNGIS),
    feet: 'sandals',
    gamchha: chance(0.75) ? { color: pick(GAMCHHA), onHead: chance(0.4) } : undefined,
    beard: chance(0.35),
    mustache: chance(0.4),
  };
}

/**
 * Shopkeeper: shirt, polo or t-shirt over trousers or a checked lungi folded up to the knees,
 * sandals, often a moustache or beard.
 */
function shopkeeperLook(): Look {
  const lungi = chance(0.45);
  const top = manTop();
  return {
    skin: pick(SKINS),
    hair: pick(HAIR),
    hairStyle: chance(0.1) ? 'bald' : 'short',
    ...top,
    // A lungi's check bands use the accent colour.
    accent: lungi ? pick(LUNGI_CHECKS) : top.accent,
    bottom: lungi ? 'lungi' : 'trousers',
    bottomColor: lungi ? pick(LUNGIS) : pick(TROUSERS),
    lungiFolded: lungi,
    feet: 'sandals',
    gamchha: lungi && chance(0.3) ? { color: pick(GAMCHHA), onHead: false } : undefined,
    beard: chance(0.3),
    mustache: chance(0.4),
  };
}

export class Crowd {
  readonly people: Person[] = [];
  /** Round-robin position for recycling distant walkers. */
  private scan = 0;

  constructor(
    private scene: THREE.Scene,
    private city: City,
  ) {}

  populate() {
    for (let i = 0; i < PEDESTRIANS; i++) this.add(new Person(new HumanRig(pedestrianLook()), this.city, null));
  }

  /** Puller for a rickshaw, or a driver/rider for any other vehicle. */
  spawnDriver(v: Vehicle) {
    const look = v.kind === 'rickshaw' ? pullerLook() : driverLook(v.kind);
    return this.add(new Person(new HumanRig(look), this.city, v));
  }

  spawnKeeper(post: Post) {
    // Shopkeepers get knee joints so they can sit properly on a stool.
    return this.add(new Person(new HumanRig(shopkeeperLook(), { knees: true }), this.city, post));
  }

  isDefended(target: Post) {
    return this.people.some((p) => p.mode === 'defend' && p.defending === target);
  }

  /** A rickshaw or stall took a hammer blow: only its owner reacts — stands up for it and loses some grit. */
  propertyHit(target: Post, ctx: PersonContext) {
    for (const p of this.people) {
      if (p.mode === 'defend' && p.defending === target) p.rattle(ctx);
      else if (p.ownPost === target && p.mode !== 'flee') {
        p.defend(target, ctx);
        p.rattle(ctx);
      }
    }
  }

  update(dt: number, ctx: PersonContext) {
    for (const p of this.people) p.update(dt, ctx);
    let excess = this.people.filter((p) => !p.ownPost).length - MAX_WALKERS;
    for (let i = this.people.length - 1; i >= 0 && excess > 0; i--) {
      const p = this.people[i];
      if (!p.calm || p.ownPost || p.distTo(ctx.playerPos) < PRUNE_DIST) continue;
      this.scene.remove(p.rig.root);
      this.people.splice(i, 1);
      excess--;
    }
    this.recycle(ctx.playerPos);
  }

  /**
   * Keep the streets around the player busy: calm walkers who have drifted far away are moved to a
   * footpath out at the edge of view, a few per frame.
   */
  private recycle(playerPos: THREE.Vector3) {
    const n = this.people.length;
    let moved = 0;
    for (let k = 0; k < n && moved < RECYCLE_PER_FRAME; k++) {
      this.scan = (this.scan + 1) % n;
      const p = this.people[this.scan];
      if (!p.calm || p.ownPost || p.distTo(playerPos) < RECYCLE_DIST) continue;
      for (let tries = 0; tries < 10; tries++) {
        const f = this.city.randomFootpath();
        this.city.ringPoint(f.block, f.p, f.d, _v);
        const d = Math.hypot(_v.x - playerPos.x, _v.z - playerPos.z);
        if (d < RECYCLE_TO[0] || d > RECYCLE_TO[1]) continue;
        p.relocate(f);
        moved++;
        break;
      }
    }
  }

  private add(p: Person) {
    this.people.push(p);
    this.scene.add(p.rig.root);
    return p;
  }
}
