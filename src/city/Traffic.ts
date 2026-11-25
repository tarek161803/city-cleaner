import * as THREE from 'three';
import type { City, Lane } from '../world/City';
import { Rickshaw } from './Rickshaw';
import { Bike, Bus, Car, Cng, Leguna, Microbus, Pickup, Truck } from './Motors';
import { ENTRY_RUN, type Vehicle } from './Vehicle';
import { QUALITY } from '../core/Quality';

/** How many of each vehicle roam the city. */
const FLEET: [() => Vehicle, number][] = [
  [() => new Rickshaw(), 110],
  [() => new Cng(), 34],
  [() => new Car(), 36],
  [() => new Bike(), 40],
  [() => new Microbus(), 13],
  [() => new Leguna(), 11],
  [() => new Pickup(), 12],
  [() => new Bus(), 11],
  [() => new Truck(), 7],
];
/** A respawned vehicle appears at least this far from the player, out of sight. */
const RESPAWN_DIST = 45;
/** How far ahead drivers watch for things in their path. */
const LOOK_AHEAD = 14;
/** Roads closer than this to the centre count as the busy ones. */
const PITCH_HINT = 40;
/** A vehicle stuck this long where the player can't see it is quietly moved somewhere free. */
const GRIDLOCK_TIME = 15;
/** Beyond this distance a vehicle counts as out of sight even in front of the camera. */
const SIGHT_DIST = 110;
/** Never lift a vehicle away when the player is this close, even behind the camera. */
const NEAR_DIST = 12;
/** Vehicles all waiting on each other this long (e.g. two crossing nose to flank in a junction) is a deadlock. */
const DEADLOCK_TIME = 4;
/** How long the one that gives way spends backing up to let the others through. */
const YIELD_TIME = 4;
/** Room needed behind a vehicle for backing up to be worth it (m). */
const MIN_BACK_ROOM = 0.8;
/** Seconds a vehicle waits for a pedestrian before edging through. */
const PEDESTRIAN_PATIENCE = 3;

/** Something in the road that traffic has to stop for (player, pedestrian, stall in the road). */
export interface Blocker {
  pos: THREE.Vector3;
  /** Half its size along and across the lane. */
  half: number;
  /** A pedestrian: traffic waits a few seconds, then edges forward and nudges them aside. */
  soft?: boolean;
}

const _a1 = new THREE.Vector3();
const _a2 = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/** All the traffic: lane following, queueing into jams, crashes, and respawning smashed vehicles. */
export class Traffic {
  readonly vehicles: Vehicle[] = [];
  readonly rickshaws: Rickshaw[] = [];
  /** Roads around the starting block get the heaviest traffic. */
  private busy: Lane[];
  private blockers: readonly Blocker[] = [];
  /** The camera's view is known (not yet while first filling the streets). */
  private sightReady = false;

  constructor(
    private scene: THREE.Scene,
    private city: City,
    private makeDriver: (v: Vehicle) => void,
    private onCrash: (a: Vehicle, b: Vehicle, at: THREE.Vector3) => void,
    private camera: THREE.Camera,
  ) {
    // The two roads either side of the centre block.
    this.busy = city.lanes.filter((l) => Math.abs(l.road) < PITCH_HINT);
  }

  populate(playerPos: THREE.Vector3) {
    for (const [make, count] of FLEET) {
      for (let i = 0; i < Math.round(count * QUALITY.traffic); i++) {
        const v = make();
        this.vehicles.push(v);
        if (v instanceof Rickshaw) this.rickshaws.push(v);
        this.scene.add(v.group);
        if (!this.spawn(v, playerPos, 6)) {
          v.broken = true;
          v.group.visible = false;
        }
      }
    }
  }

  update(dt: number, playerPos: THREE.Vector3, blockers: readonly Blocker[]) {
    this.blockers = blockers;
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    this.sightReady = true;
    const live: Vehicle[] = [];
    for (const v of this.vehicles) {
      if (!v.broken) {
        live.push(v);
        continue;
      }
      v.respawnT -= dt;
      if (v.respawnT <= 0 && !this.spawn(v, playerPos, RESPAWN_DIST)) v.respawnT = 2;
    }
    for (const v of live) {
      const look = this.lookAround(v, live, blockers);
      v.leader = look.leader;
      v.drive(dt, look.gap, look.leaderHalf, look.latMin, look.latMax, look.headOn, look.oncoming, look.backRoom);
      v.pedestrianWaitT = look.soft && v.speed < 0.4 ? v.pedestrianWaitT + dt : 0;
      // Hopeless gridlock out of the player's sight: lift the driver and vehicle out to a free spot.
      if (v.owner && v.idleT > GRIDLOCK_TIME && !this.inSight(v.pos, v.spec.halfLength, playerPos)) {
        v.idleT = 0;
        this.spawn(v, playerPos, NEAR_DIST, false);
      }
      // Drove off the end of the road: it carries on past the edge of the map and only goes once the
      // player can't see it (or it reaches the end of the ground), so nothing vanishes in plain view.
      if (v.offEdge && (v.atRunEnd || !this.inSight(v.pos, v.spec.halfLength, playerPos))) this.reenter(v, playerPos);
      v.updateVisual(dt, playerPos);
    }
    this.breakDeadlocks(live, playerPos);
    this.detectCrashes();
  }

  /**
   * What is around this vehicle, whatever lane it is in: other vehicles (wrong-way, crossing,
   * crashed, abandoned) and blockers. Gives the distance to the nearest thing in its path (plus that
   * thing's half-length along its heading), and how far it may move sideways without hitting
   * anything alongside.
   */
  private lookAround(v: Vehicle, live: readonly Vehicle[], blockers: readonly Blocker[]) {
    const h = v.group.rotation.y;
    const fx = Math.sin(h), fz = Math.cos(h);
    // Same orientation as the lane's lateral axis, so offsets here map directly onto `lat`.
    const lx = fz, lz = -fx;
    const reach = LOOK_AHEAD + v.spec.halfLength;
    let gap = Infinity, leaderHalf = 0, latMin = -Infinity, latMax = Infinity, headOn = false, soft = false;
    // Free space behind, for backing out of a deadlock.
    let backRoom = Infinity;
    const behind = (ahead: number, side: number, along: number, across: number) => {
      if (ahead >= 0 || Math.abs(side) > v.spec.halfWidth + across + 0.2) return;
      backRoom = Math.min(backRoom, -ahead - (v.spec.halfLength + along + 0.3));
    };
    // Oncoming traffic close ahead on the other side of the road: no pulling out to overtake.
    let oncoming = false;
    const alongside = (ahead: number, side: number, along: number, across: number) => {
      if (Math.abs(ahead) > v.spec.halfLength + along + 0.3) return;
      const clearance = v.spec.halfWidth + across + 0.15;
      if (side > 0) latMax = Math.min(latMax, v.lat + side - clearance);
      else latMin = Math.max(latMin, v.lat + side + clearance);
    };
    let leader: Vehicle | null = null;
    for (const o of live) {
      if (o === v) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const ahead = dx * fx + dz * fz;
      const side = dx * lx + dz * lz;
      // The other vehicle's footprint measured along and across this one's heading.
      const rel = o.group.rotation.y - h;
      const c = Math.abs(Math.cos(rel)), sn = Math.abs(Math.sin(rel));
      const across = sn * o.spec.halfLength + c * o.spec.halfWidth;
      const along = c * o.spec.halfLength + sn * o.spec.halfWidth;
      // Anything level with this vehicle limits how far it can slide sideways (even if touching).
      alongside(ahead, side, along, across);
      behind(ahead, side, along, across);
      if (o.owner && Math.cos(rel) < -0.5 && ahead > 0 && ahead < 12 && side < -1 && side > -9) oncoming = true;
      if (Math.abs(side) > v.spec.halfWidth + across + 0.2) continue;
      if (ahead <= 0 || ahead >= gap) continue;
      const heading = Math.cos(rel);
      if (heading < 0.5 && o.owner) {
        // Oncoming or crossing traffic: careless drivers plough on and crash — but only into something
        // that can be crashed into right now, so nobody ever drives through another vehicle.
        if (v.reckless && v.speed > 1 && o.crashCooldown <= 0) continue;
        // Crossing at a junction: whoever is nearer the crossing point goes first (ties by id), unless
        // the other one's body is right in front.
        if (heading > -0.5 && o.speed < 0.3 && ahead > v.spec.halfLength + along + 0.5) {
          const oAhead = -(dx * Math.sin(o.group.rotation.y) + dz * Math.cos(o.group.rotation.y));
          if (ahead < oAhead || (ahead === oAhead && v.id < o.id)) continue;
        }
      }
      gap = ahead;
      leaderHalf = along;
      headOn = heading < -0.5;
      soft = false;
      leader = o;
    }
    for (const b of blockers) {
      const dx = b.pos.x - v.pos.x, dz = b.pos.z - v.pos.z;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const ahead = dx * fx + dz * fz;
      const side = dx * lx + dz * lz;
      // Pedestrians get nudged aside after a short wait (they are pushed out of the way physically).
      if (b.soft && v.pedestrianWaitT > PEDESTRIAN_PATIENCE) continue;
      alongside(ahead, side, b.half, b.half);
      behind(ahead, side, b.half, b.half);
      if (Math.abs(side) > v.spec.halfWidth + b.half) continue;
      if (ahead <= 0 || ahead >= gap) continue;
      gap = ahead;
      leaderHalf = b.half;
      headOn = false;
      soft = !!b.soft;
      leader = null;
    }
    return { gap, leaderHalf, latMin, latMax, headOn, soft, leader, oncoming, backRoom };
  }

  /**
   * Vehicles waiting on each other in a loop (A behind B, B behind A — crossing in a junction, or
   * nose to nose) never clear on their own. The one in the loop with the most room behind it backs up
   * out of the others' way. If none can, and the player can't see them, one is quietly moved elsewhere;
   * nobody ever drives through another vehicle.
   */
  private breakDeadlocks(live: readonly Vehicle[], playerPos: THREE.Vector3) {
    for (const v of live) {
      if (!v.owner || v.slowT < DEADLOCK_TIME || v.yieldT > 0) continue;
      let yielder = v;
      let o = v.leader;
      for (let k = 0; k < 64 && o && o !== v; k++) {
        if (o.slowT < DEADLOCK_TIME || o.yieldT > 0) {
          o = null;
          break;
        }
        // Prefer whoever can back up furthest; among equals, the smaller one.
        const room = Math.min(o.backRoom, 4), best = Math.min(yielder.backRoom, 4);
        if (room > best + 0.2 || (Math.abs(room - best) <= 0.2 && o.spec.halfLength < yielder.spec.halfLength)) yielder = o;
        o = o.leader;
      }
      if (o !== v) continue;
      if (yielder.backRoom >= MIN_BACK_ROOM) yielder.yieldT = YIELD_TIME;
      else if (!this.inSight(yielder.pos, yielder.spec.halfLength, playerPos)) this.spawn(yielder, playerPos, NEAR_DIST, false);
    }
  }

  /** Head-on with wrong-way drivers, or side-on at intersections. Both must have a driver aboard. */
  private detectCrashes() {
    const live = this.vehicles.filter((v) => !v.broken && v.owner && v.crashCooldown <= 0 && v.yieldT <= 0);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      a.ends(_a1, _a2);
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const reach = a.spec.halfLength + b.spec.halfLength;
        if (Math.abs(a.pos.x - b.pos.x) > reach || Math.abs(a.pos.z - b.pos.z) > reach) continue;
        if (a.crashCooldown > 0 || b.crashCooldown > 0 || a.speed + b.speed < 0.8) continue;
        b.ends(_b1, _b2);
        if (segmentDistance(_a1, _a2, _b1, _b2) > a.spec.halfWidth + b.spec.halfWidth - 0.1) continue;
        a.crash();
        b.crash();
        this.onCrash(a, b, new THREE.Vector3((a.pos.x + b.pos.x) / 2, 0.8, (a.pos.z + b.pos.z) / 2));
      }
    }
  }

  /** Could the player see something of this size here (in front of the camera and not too far)? */
  private inSight(pos: THREE.Vector3, size: number, playerPos: THREE.Vector3) {
    const d = pos.distanceTo(playerPos);
    if (d < NEAR_DIST) return true;
    if (!this.sightReady) return false;
    if (d > SIGHT_DIST) return false;
    return _frustum.intersectsSphere(_sphere.set(_a2.set(pos.x, 1.5, pos.z), size + 1.5));
  }

  /** Is another vehicle (in any lane — crossing roads overlap at junctions) too close to (x, z)? */
  private occupied(v: Vehicle, x: number, z: number) {
    return this.vehicles.some((o) => {
      if (o === v || o.broken || !o.lane) return false;
      const room = o.spec.halfLength + v.spec.halfLength + 2;
      return Math.abs(o.pos.x - x) < room && Math.abs(o.pos.z - z) < room;
    });
  }

  /**
   * Bring a vehicle that drove off the edge back in from beyond the far end of its road, so it drives
   * into the map; if that spot is taken or in view, somewhere else free and out of sight.
   */
  private reenter(v: Vehicle, playerPos: THREE.Vector3) {
    const { origin, dir } = v.lane;
    const x = origin.x - dir.x * ENTRY_RUN, z = origin.z - dir.z * ENTRY_RUN;
    if (!this.inSight(_a1.set(x, 0, z), v.spec.halfLength, playerPos) && !this.occupied(v, x, z)) v.place(v.lane, -ENTRY_RUN);
    else this.spawn(v, playerPos, RESPAWN_DIST, false);
  }

  /** Put a vehicle on a free spot of some lane; with `newDriver` false the current driver comes along. */
  private spawn(v: Vehicle, playerPos: THREE.Vector3, minDist: number, newDriver = true) {
    for (let tries = 0; tries < 40; tries++) {
      const lanes = Math.random() < 0.6 ? this.busy : this.city.lanes;
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      const s = Math.random() * lane.length;
      const x = lane.origin.x + lane.dir.x * s, z = lane.origin.z + lane.dir.z * s;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < minDist) continue;
      // Never pop into view.
      if (this.inSight(_a1.set(x, 0, z), v.spec.halfLength, playerPos)) continue;
      if (this.occupied(v, x, z)) continue;
      // Not on top of a stall in the road or someone walking there.
      const reach = v.spec.halfLength + 1.5;
      if (this.blockers.some((b) => Math.abs(b.pos.x - x) < reach && Math.abs(b.pos.z - z) < reach)) continue;
      v.restore();
      v.place(lane, s);
      if (newDriver) this.makeDriver(v);
      return true;
    }
    return false;
  }
}

/** Shortest distance between segments p1–q1 and p2–q2 on the ground plane. */
function segmentDistance(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3) {
  const d1x = q1.x - p1.x, d1z = q1.z - p1.z, d2x = q2.x - p2.x, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, rz = p1.z - p2.z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (a < 1e-6 && e < 1e-6) return Math.hypot(rx, rz);
  if (a < 1e-6) {
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1z * rz;
    if (e < 1e-6) {
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1z * d2z, denom = a * e - b * b;
      s = denom > 1e-6 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  return Math.hypot(p1.x + d1x * s - (p2.x + d2x * t), p1.z + d1z * s - (p2.z + d2z * t));
}
