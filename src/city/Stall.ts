import * as THREE from 'three';
import type { StallSlot } from '../world/City';
import { CURB } from '../world/City';
import type { Post, Shop } from '../npcs/Person';
import { Destructible, type Breakup, type Owner } from './Destructible';
import { buildShop, HAWKER_CALLS, SHOP_TALK, signMesh, TAKEAWAY, type ShopKind } from './Shops';
import { HIP_Y } from '../core/Outfit';

/** A footpath hawker's shop (tea stall, fruit van, fuchka cart, clothes, …) that can be smashed and set up again. */
export class Stall extends Destructible implements Post, Shop {
  readonly maxHp = 60;
  readonly radius = 1.2;
  /** Set per shop kind on (re)build: where a blow lands. */
  height = 2.3;
  readonly respawnDelay = 25;
  /** On a stool behind goods laid out on the ground; otherwise standing behind the counter. */
  seated = false;
  stool = false;
  readonly hidden = false;
  exitDist = 0;
  readonly moveSpeed = 0;
  kind: ShopKind = 'tea';
  /** Seconds since the seller last shouted their wares (passers-by are drawn in for a while). */
  sinceCall = Infinity;
  /** Who is standing at each of the two customer spots. */
  readonly customers: (object | null)[] = [null, null];
  /** Bamboo, wood and tarp: goods spill, poles buckle and the roof caves in toward the blows. */
  protected readonly breakup: Breakup = { looseShare: 0.24, keepAbove: 0.92, dentRadius: 1.1, tiltStep: 2.2, maxTilt: 0.32, slump: 0.16 };
  private sign: THREE.Mesh | null = null;
  private signY = 0;
  /** Which way the signboard swings once a nail gives. */
  private signLean = 1;
  /** Where the keeper is: on the stool (seat height) or standing behind the counter. */
  private keeperSpot = { x: 0, y: 0, z: -1.0 };

  constructor(readonly slot: StallSlot) {
    super();
    this.group.position.set(slot.x, slot.onRoad ? 0 : CURB, slot.z);
    this.group.rotation.y = slot.facing;
    this.group.updateMatrixWorld(true);
    this.rebuild();
  }

  /** A fresh shop (possibly a different kind) each time it is set up again. */
  rebuild() {
    const shop = buildShop(this.slot.onRoad);
    this.kind = shop.kind;
    this.height = shop.height;
    const s = shop.stool;
    // Sitting on the stool: the hips (HIP_Y above the feet) rest just above the seat.
    this.keeperSpot = s ? { x: s.x, y: s.h + 0.06 - HIP_Y, z: s.z } : { x: 0, y: 0, z: -1.0 };
    this.seated = this.stool = !!s;
    this.exitDist = s ? 0.45 : 0;
    this.setModel(shop.parts);
    this.sign = shop.sign ? signMesh(shop.sign) : null;
    if (this.sign) {
      this.signY = this.sign.position.y;
      this.model.add(this.sign);
    }
    this.restore();
  }

  restore() {
    super.restore();
    this.customers.fill(null);
    if (this.sign) {
      this.sign.rotation.z = 0;
      this.sign.position.y = this.signY;
      this.sign.visible = true;
      this.signLean = Math.random() < 0.5 ? -1 : 1;
    }
  }

  /** The signboard swings crooked on one nail, then falls off. */
  protected onCrumble(damage: number) {
    if (!this.sign) return;
    this.sign.rotation.z = this.signLean * 0.45 * damage;
    this.sign.position.y = this.signY - 0.15 * damage;
    if (damage > 0.6) this.sign.visible = false;
  }

  /** The seller's shout to pull in customers. */
  callLine() {
    this.sinceCall = 0;
    const calls = HAWKER_CALLS[this.kind];
    return calls[Math.floor(Math.random() * calls.length)];
  }

  /** Just shouted: passers-by are more likely to stop. */
  get calling() {
    return this.sinceCall < 4;
  }

  updateVisual(dt: number, playerPos: THREE.Vector3) {
    this.sinceCall += dt;
    super.updateVisual(dt, playerPos);
  }

  /** A customer's line at this kind of shop and the seller's answer (now and then, a haggle). */
  chat(): [string, string] {
    const talk = SHOP_TALK[this.kind];
    const lines = Math.random() < 0.25 ? talk.haggle : talk.buy;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /** What a customer leaves with, if anything. */
  takeaway() {
    return TAKEAWAY[this.kind] ?? null;
  }

  /** Take a free customer spot; -1 if both are taken. */
  claim(who: object) {
    const i = this.customers.indexOf(null);
    if (i >= 0) this.customers[i] = who;
    return i;
  }

  release(who: object) {
    const i = this.customers.indexOf(who);
    if (i >= 0) this.customers[i] = null;
  }

  /**
   * Where customer `i` (0 or 1) stands, on the footpath and just clear of the stall's footprint: at a
   * front corner of a footpath stall, or on the kerb either side of a road cart's seller.
   */
  customerSpot(out: THREE.Vector3, i: number) {
    const s = i ? 1 : -1;
    if (this.slot.onRoad) this.group.localToWorld(out.set(s * 0.9, 0, -1.15));
    else this.group.localToWorld(out.set(s * 1.4, 0, 0.5));
    return out;
  }

  /** Shopkeeper stands behind the table, facing the road. */
  seat(out: THREE.Vector3) {
    const k = this.keeperSpot;
    this.group.localToWorld(out.set(k.x, k.y, k.z));
    return this.group.rotation.y;
  }

  leave() {
    this.owner = null;
  }

  reclaim(owner: Owner) {
    if (this.broken || this.owner) return false;
    this.owner = owner;
    return true;
  }
}
