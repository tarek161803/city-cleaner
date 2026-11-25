import * as THREE from 'three';
import { Actor } from '../core/Actor';
import type { HumanRig } from '../core/HumanRig';
import type { Carry } from '../core/Outfit';
import { damp, rand, turnToward } from '../core/math';
import { QUALITY } from '../core/Quality';
import { ROAD, WORLD_HALF, type Block, type City } from '../world/City';

/** A rickshaw saddle or stall counter a person is attached to (and will defend). */
export interface Post {
  readonly seated: boolean;
  /** Seated on a low stool (knees up) rather than a saddle or driver's seat. */
  readonly stool?: boolean;
  /** Driver sits inside a cabin (car, bus) and is not drawn. */
  readonly hidden: boolean;
  /** How far to the side they step off/out. */
  readonly exitDist: number;
  readonly moveSpeed: number;
  readonly pos: THREE.Vector3;
  readonly broken: boolean;
  /** Writes the person's position, returns their facing. */
  seat(out: THREE.Vector3): number;
  leave(): void;
  /** Take the post back after stepping away; false if it is gone or taken. */
  reclaim(owner: Person): boolean;
  /** Hawkers: a shout to pull in customers. */
  callLine?(): string;
}

/** A stall a passer-by can stop at and buy from. */
export interface Shop {
  readonly pos: THREE.Vector3;
  readonly alive: boolean;
  /** The seller, while they are at their post. */
  readonly owner: unknown;
  /** What a customer says here, and what the seller says back. */
  chat(): [string, string];
  /** What the customer walks away holding (nothing for food eaten at the stall). */
  takeaway(): Carry | null;
  /** The seller has just shouted their wares. */
  readonly calling: boolean;
  /** Take one of the customer spots (index), or -1 if full. */
  claim(who: object): number;
  release(who: object): void;
  customerSpot(out: THREE.Vector3, i: number): THREE.Vector3;
}

type Mode = 'post' | 'walk' | 'idle' | 'flee' | 'quarrel' | 'defend' | 'cross' | 'shop';

export interface PersonContext {
  playerPos: THREE.Vector3;
  city: City;
  actors: readonly Actor[];
  /** Show a speech bubble over this person. */
  say: (who: Person, text: string) => void;
  /** This person shoves the player away. */
  shove: (by: Person) => void;
  /** Stalls cluttering the footpaths: walkers step into the road to get round them, or stop to buy. */
  stalls: readonly Shop[];
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** What rickshaw drivers yell at each other after a crash. */
const QUARREL_LINES = [
  'ওই মিয়া!',
  'চোখে দেখো না?',
  'রাস্তা কি তোর বাপের?',
  'সাইড দে!',
  'উল্টা দিকে কেন?!',
  'আস্তে চালা!',
  'তুই ধাক্কা দিলি!',
  'লাইসেন্স আছে?',
];
/** Owners standing up for their rickshaw or stall. */
const DEFEND_LINES = ['খবরদার!', 'হাত দিবি না!', 'দূরে থাক!', 'এইটা আমার রুটি-রুজি!', 'বড় ভাইরে ডাকবো!', 'সর এখান থেকে!'];
const SHOVE_LINES = ['যা!', 'সর!', 'পিছে যা!'];
const GIVE_UP_LINES = ['থাক বাবা!', 'আমি গেলাম!', 'মাফ চাই!', 'যা খুশি কর!'];
/** Polythene and shopping bag colours. */
const BAG_COLORS = [0xf1f5f9, 0xf9a8d4, 0x60a5fa, 0x1f2937, 0xef4444, 0xfde68a];
/** How long (s) a customer carries what they bought before it's put away. */
const CARRY_TIME = [60, 120] as const;

const FLEE_SPEED = 5;
/** Defenders are slower than the player's run, so you can outmanoeuvre them. */
const DEFEND_SPEED = 3.6;
const SHOVE_RANGE = 1.25;
const SHOVE_COOLDOWN = 1.6;
/** Defenders go back to work once the player has been this far from their property for a while. */
const STAND_DOWN_DIST = 16;
/** Hidden and not animated beyond this distance. */
export const CULL_DIST = QUALITY.personCull;
/** How often (s) a walker checks for a stall blocking the footpath ahead. */
const DETOUR_CHECK = 0.2;
/** Ring inset used to walk round a footpath stall: negative = out in the road beside the kerb. */
const DETOUR_D = -1.0;
/** Chance, when a walk segment ends, to cross the road instead of pausing. */
const CROSS_CHANCE = 0.3;
/** Walkers look for a stall to stop at about this often (s), and stop at one this often. */
const SHOP_CHECK = [1.5, 3] as const;
const SHOP_CHANCE = 0.3;
/** Only stalls this close (m) catch a walker's eye, or this close while the seller is shouting. */
const SHOP_NOTICE = 4;
const SHOP_NOTICE_CALLING = 7;
/** A hawker's shout doubles the chance a passer-by stops. */
const CALLED_CHANCE = 0.6;
/** Hawkers shout every so often (s), when the player is near enough to hear it. */
const CALL_EVERY = [10, 22] as const;
const CALL_RANGE = 30;
const HAIL_TIME = 1.4;
/** Customers don't stop, and leave, when the player with the hammer is this close. */
const SHOP_WARY = 6;

const _t = new THREE.Vector3();
const _f = new THREE.Vector3();

/**
 * Pedestrian, rickshaw puller or shopkeeper. The hammer never hurts people.
 * Only the owner of the rickshaw/stall being attacked reacts: they stand in the way and shove the
 * player until their grit runs out, then run. Everyone else carries on.
 * Walkers stroll around the footpath ring of a block.
 */
export class Person extends Actor {
  mode: Mode;
  /** How many more hits on the property they will put up with. */
  grit = 0;
  gritMax = 0;
  /** The rickshaw or stall this person is standing up for. */
  defending: Post | null = null;
  private block!: Block;
  private ringP = 0;
  private ringD = 1.8;
  private dir = 1;
  private walkSpeed = rand(1.1, 1.5);
  private stateT = 0;
  private stateFor = rand(6, 20);
  private panicT = 0;
  private threat = new THREE.Vector3();
  /** Per-person bias so a crowd scatters instead of running in a single line (also spreads defenders). */
  private fleeBias = rand(-0.7, 0.7);
  /** Own post to climb back onto after a quarrel or a stand-off. */
  private resume: Post | null = null;
  private opponent: Person | null = null;
  private quarrelT = 0;
  private shoutT = 0;
  private shoveT = 0;
  private calmT = 0;
  /** Normal footpath inset to return to after a detour. */
  private homeD = 1.8;
  private detourT = 0;
  private detourCheckT = Math.random() * DETOUR_CHECK;
  private crossTo = new THREE.Vector3();
  /** Shopping: the stall, which customer spot, approaching or buying, and when the seller answers. */
  private shop: Shop | null = null;
  private shopSlot = 0;
  private buying = false;
  private replyT = 0;
  /** What the seller will say back. */
  private reply = '';
  private shopCheckT = rand(...SHOP_CHECK);
  /** Seller only: holding something out to a customer; time to the next shout and how long the wave lasts. */
  private serveT = 0;
  private callT = rand(...CALL_EVERY);
  private hailT = 0;
  /** Seconds left carrying a purchase. */
  private carryT = 0;

  constructor(
    rig: HumanRig,
    private city: City,
    private post: Post | null,
  ) {
    super(rig);
    if (post) {
      this.mode = 'post';
      this.facing = post.seat(this.pos);
      rig.seated = post.seated;
      rig.stool = !!post.stool;
    } else {
      this.mode = 'walk';
      const f = city.randomFootpath();
      this.block = f.block;
      this.ringD = this.homeD = f.d;
      this.ringP = f.p;
      city.ringPoint(this.block, this.ringP, this.ringD, this.pos);
      this.dir = Math.random() < 0.5 ? -1 : 1;
    }
  }

  /** Start walking afresh from a footpath spot (moved there out of the player's way). */
  relocate(f: { block: Block; d: number; p: number }) {
    this.leaveShop();
    this.rig.holdItem(null);
    this.carryT = 0;
    this.block = f.block;
    this.ringD = this.homeD = f.d;
    this.ringP = f.p;
    this.detourT = 0;
    this.city.ringPoint(this.block, this.ringP, this.ringD, this.pos);
    this.pos.y = this.city.heightAt(this.pos.x, this.pos.z);
    this.vel.set(0, 0, 0);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.setMode('walk');
  }

  get calm() {
    return this.mode === 'walk' || this.mode === 'idle';
  }

  /** Pullers and shopkeepers (on or near their rickshaw/stall). */
  get isOwner() {
    return !!(this.post || this.resume);
  }

  /** Their own rickshaw or stall, whether they are on it or stepped off. */
  get ownPost() {
    return this.post ?? this.resume;
  }

  update(dt: number, ctx: PersonContext) {
    const dist = this.distTo(ctx.playerPos);
    if (this.post) {
      this.facing = this.post.seat(this.pos);
      this.serveT -= dt;
      this.rig.reach = this.serveT > 0;
      // Hawkers call out their wares now and then, waving a hand (not while handing something over).
      const call = this.post.callLine;
      if (call && (this.callT -= dt) <= 0) {
        this.callT = rand(...CALL_EVERY);
        if (dist < CALL_RANGE && this.serveT <= 0) {
          ctx.say(this, call.call(this.post));
          this.hailT = HAIL_TIME;
        }
      }
      this.hailT -= dt;
      this.rig.hail = this.hailT > 0 && !this.rig.reach;
      this.show(dt, dist, this.post.moveSpeed);
      return;
    }

    this.stateT += dt;
    if (this.carryT > 0 && (this.carryT -= dt) <= 0) this.rig.holdItem(null);
    let speed = 0;
    let moveAngle = this.facing;
    switch (this.mode) {
      case 'idle':
        if (this.stateT > this.stateFor) this.setMode('walk');
        break;
      case 'walk':
        if ((this.shopCheckT -= dt) <= 0) {
          this.shopCheckT = rand(...SHOP_CHECK);
          if (dist > SHOP_WARY && this.startShopping(ctx)) break;
        }
        this.updateDetour(dt, ctx);
        this.city.ringPoint(this.block, this.ringP + this.dir * 2.5, this.ringD, _t);
        moveAngle = this.angleTo(_t);
        speed = this.walkSpeed;
        if (this.stateT > this.stateFor) {
          if (Math.random() < CROSS_CHANCE && this.startCrossing()) break;
          if (Math.random() < 0.3) this.dir *= -1;
          this.setMode('idle');
        }
        break;
      case 'shop': {
        const shop = this.shop!;
        if (!shop.alive || !shop.owner || dist < SHOP_WARY) {
          this.startWalking();
          break;
        }
        shop.customerSpot(_t, this.shopSlot);
        const away = this.distTo(_t);
        if (!this.buying) {
          // Walk up to the stall; give up if something keeps them from getting there.
          moveAngle = this.angleTo(_t);
          speed = this.walkSpeed * 0.9;
          if (away < 0.4) {
            this.buying = true;
            this.stateT = 0;
            this.stateFor = rand(4, 8);
            this.replyT = rand(1, 1.8);
            const [ask, answer] = shop.chat();
            ctx.say(this, ask);
            this.reply = answer;
          } else if (this.stateT > 12) {
            this.startWalking();
          }
          break;
        }
        // At the stall: face it, the seller answers and hands it over, then pay and walk on.
        this.facing = turnToward(this.facing, this.angleTo(shop.pos), 6 * dt);
        moveAngle = this.facing;
        if (away > 0.5) speed = 0.6;
        if (this.replyT > 0 && (this.replyT -= dt) <= 0 && shop.owner instanceof Person) {
          ctx.say(shop.owner, this.reply);
          shop.owner.serveT = 1.6;
        }
        this.rig.reach = this.stateT > this.stateFor - 1.6;
        if (this.stateT > this.stateFor) {
          // Paid: walk off with it.
          const item = shop.takeaway();
          if (item) {
            this.rig.holdItem(item, item === 'bigBag' ? pick([0xc8a06a, ...BAG_COLORS]) : pick(BAG_COLORS));
            this.carryT = rand(...CARRY_TIME);
          }
          this.startWalking();
        }
        break;
      }
      case 'cross':
        // Jaywalking straight across; traffic has to brake for them.
        moveAngle = this.angleTo(this.crossTo);
        speed = this.walkSpeed * 1.15;
        if (this.distTo(this.crossTo) < 0.8 || this.stateT > 20) this.startWalking();
        break;
      case 'quarrel': {
        // Square up to the other driver, wave arms, shout; then climb back on.
        const op = this.opponent!;
        this.quarrelT -= dt;
        if (op.mode !== 'quarrel') this.quarrelT = Math.min(this.quarrelT, 1.2);
        this.facing = turnToward(this.facing, this.angleTo(op.pos), 6 * dt);
        moveAngle = this.facing;
        if (this.distTo(op.pos) > 1.5) speed = 1.3;
        this.shout(dt, ctx, QUARREL_LINES, 2, 3.5);
        if (this.quarrelT <= 0) this.goBack();
        break;
      }
      case 'defend': {
        const target = this.defending!;
        if (target.broken) {
          this.giveUp(ctx);
          break;
        }
        // Stand between the player and the property; body-block when the player closes in.
        const tp = target.pos;
        const px = ctx.playerPos.x - tp.x, pz = ctx.playerPos.z - tp.z;
        const pd = Math.hypot(px, pz) || 1;
        if (pd < 5) {
          _t.copy(ctx.playerPos);
        } else {
          const side = this.fleeBias * 1.6;
          _t.set(tp.x + (px / pd) * 1.9 - (pz / pd) * side, 0, tp.z + (pz / pd) * 1.9 + (px / pd) * side);
        }
        if (this.distTo(_t) > 0.6) {
          moveAngle = this.angleTo(_t);
          speed = DEFEND_SPEED;
        }
        this.facing = turnToward(this.facing, this.angleTo(ctx.playerPos), 8 * dt);
        if (speed === 0) moveAngle = this.facing;

        this.shoveT -= dt;
        if (dist < SHOVE_RANGE && this.shoveT <= 0) {
          ctx.shove(this);
          ctx.say(this, pick(SHOVE_LINES));
          this.shoveT = SHOVE_COOLDOWN;
          this.shoutT = rand(1.5, 2.5);
        }
        this.shout(dt, ctx, DEFEND_LINES, 2.5, 4);

        this.calmT = pd > STAND_DOWN_DIST ? this.calmT + dt : 0;
        if (this.calmT > 3) this.goBack();
        break;
      }
      case 'flee': {
        this.panicT -= dt;
        const from = dist < 40 ? ctx.playerPos : this.threat;
        moveAngle = this.angleTo(from) + Math.PI + this.fleeBias;
        if (Math.max(Math.abs(this.pos.x), Math.abs(this.pos.z)) > WORLD_HALF - 8) {
          moveAngle = Math.atan2(-this.pos.x, -this.pos.z);
        }
        speed = FLEE_SPEED;
        if (this.panicT <= 0 && dist > 35) this.startWalking();
        break;
      }
    }

    // While defending (or at a stall), they keep facing their target rather than turning to walk.
    if (speed > 0 && this.mode !== 'defend' && !(this.mode === 'shop' && this.buying)) {
      this.facing = turnToward(this.facing, moveAngle, (this.mode === 'flee' ? 10 : 5) * dt);
      moveAngle = this.facing;
    }
    this.vel.x = damp(this.vel.x, Math.sin(moveAngle) * speed, 8, dt);
    this.vel.z = damp(this.vel.z, Math.cos(moveAngle) * speed, 8, dt);
    this.integrate(dt, this.city, ctx.actors);
    if (this.mode === 'walk') this.ringP = this.city.ringProject(this.block, this.pos.x, this.pos.z, this.ringD);
    this.rig.panic = this.mode === 'flee';
    this.rig.argue = this.mode === 'quarrel' || this.mode === 'defend';
    this.show(dt, dist);
  }

  /** Run away (pedestrians, or owners who have given up). */
  scare(from: THREE.Vector3) {
    this.leaveShop();
    this.dismount();
    this.resume = null;
    this.opponent = null;
    this.defending = null;
    this.threat.copy(from);
    this.panicT = rand(6, 10);
    if (this.mode !== 'flee') this.setMode('flee');
  }

  /** Step off and stand up for their own rickshaw or stall. */
  defend(target: Post, ctx: PersonContext) {
    if (this.mode === 'flee' || this.mode === 'defend') return;
    const own = this.ownPost;
    this.dismount();
    this.resume = own;
    this.opponent = null;
    this.defending = target;
    this.gritMax = this.grit = Math.random() < 0.5 ? 2 : 3;
    this.shoveT = 0.5;
    this.calmT = 0;
    this.setMode('defend');
    ctx.say(this, pick(DEFEND_LINES));
    this.shoutT = rand(2.5, 4);
  }

  /** The property they are defending took a hammer blow: lose some nerve, maybe give up. */
  rattle(ctx: PersonContext) {
    if (this.mode !== 'defend') return;
    this.grit--;
    if (this.grit <= 0) this.giveUp(ctx);
  }

  /** Jump off the rickshaw after a crash and have it out with the other driver. */
  quarrel(opponent: Person, speaksFirst: boolean) {
    if (!this.post) return;
    this.resume = this.post;
    this.dismount();
    this.opponent = opponent;
    this.quarrelT = rand(6, 10);
    // Take turns so the two bubbles don't pile up on each other.
    this.shoutT = speaksFirst ? 0.3 : 1.6;
    this.setMode('quarrel');
  }

  private giveUp(ctx: PersonContext) {
    ctx.say(this, pick(GIVE_UP_LINES));
    this.scare(ctx.playerPos);
  }

  private shout(dt: number, ctx: PersonContext, lines: string[], min: number, max: number) {
    this.shoutT -= dt;
    if (this.shoutT > 0) return;
    ctx.say(this, pick(lines));
    this.shoutT = rand(min, max);
  }

  /** Back to their own rickshaw/stall after a quarrel or stand-off, if it is still there. */
  private goBack() {
    this.opponent = null;
    this.defending = null;
    const post = this.resume;
    this.resume = null;
    if (post && post.reclaim(this)) {
      this.post = post;
      this.mode = 'post';
      this.rig.seated = post.seated;
      this.rig.stool = !!post.stool;
      this.rig.argue = false;
    } else {
      this.startWalking();
    }
  }

  private dismount() {
    if (!this.post) return;
    const seated = this.post.seated;
    if (seated) {
      // Jump off the saddle / step out of the cab, to the side.
      const d = this.post.exitDist;
      this.forward(_f);
      this.pos.x += _f.z * d;
      this.pos.z -= _f.x * d;
      this.pos.y = this.city.heightAt(this.pos.x, this.pos.z);
    }
    this.post.leave();
    this.post = null;
    this.rig.seated = false;
    this.rig.stool = false;
  }

  /** Footpath blocked by a stall just ahead: step down into the road, and back up once past it. */
  private updateDetour(dt: number, ctx: PersonContext) {
    // Scanning every stall is the costly part, so only look a few times a second.
    if ((this.detourCheckT -= dt) > 0) return;
    dt = DETOUR_CHECK - this.detourCheckT;
    this.detourCheckT = DETOUR_CHECK;
    const blockedAt = (d: number) => {
      this.city.ringPoint(this.block, this.ringP + this.dir * 2.5, d, _t);
      return ctx.stalls.some((s) => s.alive && Math.abs(s.pos.x - _t.x) < 1.6 && Math.abs(s.pos.z - _t.z) < 1.6);
    };
    if (this.ringD === this.homeD) {
      if (blockedAt(this.homeD)) this.switchRing(DETOUR_D, 2);
    } else if ((this.detourT -= dt) <= 0) {
      if (blockedAt(this.homeD)) this.detourT = 0.8;
      else this.switchRing(this.homeD, 0);
    }
  }

  private switchRing(d: number, detour: number) {
    this.ringD = d;
    this.ringP = this.city.ringProject(this.block, this.pos.x, this.pos.z, d);
    this.detourT = detour;
  }

  /** Walk straight across the road to the facing block. */
  private startCrossing() {
    const b = this.block;
    const dx = this.pos.x - (b.x0 + b.x1) / 2, dz = this.pos.z - (b.z0 + b.z1) / 2;
    const span = ROAD + this.homeD * 2;
    this.crossTo.set(
      this.pos.x + (Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) * span : 0),
      0,
      this.pos.z + (Math.abs(dx) > Math.abs(dz) ? 0 : Math.sign(dz) * span),
    );
    if (Math.max(Math.abs(this.crossTo.x), Math.abs(this.crossTo.z)) > WORLD_HALF - 4) return false;
    this.setMode('cross');
    return true;
  }

  /**
   * Maybe stop at a nearby open stall with a free spot and the seller at it (more likely, and from
   * further off, when its seller has just shouted), and head over.
   */
  private startShopping(ctx: PersonContext) {
    let best: Shop | null = null, bestD = Infinity;
    for (const s of ctx.stalls) {
      if (!s.alive || !s.owner) continue;
      const d = this.distTo(s.pos);
      if (d < (s.calling ? SHOP_NOTICE_CALLING : SHOP_NOTICE) && d < bestD) (best = s), (bestD = d);
    }
    if (!best || Math.random() >= (best.calling ? CALLED_CHANCE : SHOP_CHANCE)) return false;
    const slot = best.claim(this);
    if (slot < 0) return false;
    this.shop = best;
    this.shopSlot = slot;
    this.buying = false;
    this.setMode('shop');
    return true;
  }

  private leaveShop() {
    this.shop?.release(this);
    this.shop = null;
    this.buying = false;
    this.rig.reach = false;
  }

  private startWalking() {
    this.leaveShop();
    this.block = this.city.nearestBlock(this.pos.x, this.pos.z);
    this.ringD = this.homeD = rand(1.3, 2.2);
    this.detourT = 0;
    this.ringP = this.city.ringProject(this.block, this.pos.x, this.pos.z, this.ringD);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.setMode('walk');
  }

  private setMode(m: Mode) {
    this.mode = m;
    this.stateT = 0;
    this.stateFor = m === 'idle' ? rand(2, 6) : rand(8, 25);
  }

  private show(dt: number, dist: number, speed?: number) {
    const visible = dist < CULL_DIST && !this.post?.hidden;
    this.rig.root.visible = visible;
    if (visible) this.syncRig(dt, speed);
    else this.rig.root.position.copy(this.pos);
  }
}
