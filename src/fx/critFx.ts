import * as THREE from 'three';
import { CRIT } from '../config';
import type { Ship } from '../ship/ship';
import type { Effects } from './effects';

const point = new THREE.Vector3();

/** Ce que montrent les avaries des coups critiques : flammes et fumée de l'incendie, fumée du gouvernail brisé à la poupe. */
export class CritFx {
  /** Accumulateurs d'émission par navire : flammes, fumée de l'incendie, fumée de la poupe. */
  private readonly timers = new WeakMap<Ship, { flame: number; smoke: number; stern: number }>();

  constructor(private readonly effects: Effects) {}

  update(dt: number, ships: readonly Ship[]) {
    for (const ship of ships) {
      const { crits } = ship;
      if (!ship.alive || !crits.any) continue;
      let t = this.timers.get(ship);
      if (!t) this.timers.set(ship, (t = { flame: 0, smoke: 0, stern: 0 }));
      ship.model.root.updateMatrixWorld();
      if (crits.fire > 0) {
        const spots = ship.model.fireSpots;
        if (spots.length) point.copy(spots[crits.fireSpot % spots.length]).applyMatrix4(ship.model.root.matrixWorld);
        else point.copy(ship.position).setY(ship.position.y + 1.5);
        for (t.flame += dt * CRIT.flameRate; t.flame >= 1; t.flame--) this.effects.flame(point);
        for (t.smoke += dt * CRIT.smokeRate; t.smoke >= 1; t.smoke--) this.effects.puff(point, true);
      }
      if (crits.rudder > 0) {
        const back = ship.stats.length / 2;
        point.set(ship.position.x - Math.sin(ship.heading) * back, ship.position.y + 1.2, ship.position.z - Math.cos(ship.heading) * back);
        for (t.stern += dt * CRIT.smokeRate * 0.6; t.stern >= 1; t.stern--) this.effects.puff(point, false);
      }
    }
  }
}
