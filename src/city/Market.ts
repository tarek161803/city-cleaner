import * as THREE from 'three';
import type { City } from '../world/City';
import { Stall } from './Stall';

/** Hawkers only set up again when the player is this far away. */
const RESPAWN_DIST = 30;

/** Footpath stalls: one per slot, rebuilt with a new shopkeeper some time after being smashed. */
export class Market {
  readonly stalls: Stall[] = [];

  constructor(
    private scene: THREE.Scene,
    private city: City,
    private makeKeeper: (s: Stall) => void,
  ) {}

  populate() {
    for (const slot of this.city.stallSlots) {
      const s = new Stall(slot);
      this.stalls.push(s);
      this.scene.add(s.group);
      this.makeKeeper(s);
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    for (const s of this.stalls) {
      if (s.broken) {
        s.respawnT -= dt;
        if (s.respawnT <= 0 && s.pos.distanceTo(playerPos) > RESPAWN_DIST) {
          s.rebuild();
          this.makeKeeper(s);
        }
        continue;
      }
      s.updateVisual(dt, playerPos);
    }
  }
}
