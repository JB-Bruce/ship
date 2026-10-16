import * as THREE from 'three';
import { CRIT } from '../config';
import type { Ship } from '../ship/ship';
import type { Effects } from './effects';

const point = new THREE.Vector3();
const debris = new THREE.Vector3();

/** Colonne de fumée laissée par une sainte-barbe, au point de l'explosion. */
interface Column {
  readonly at: THREE.Vector3;
  time: number;
  acc: number;
}

/**
 * Ce que montrent les coups critiques : flammes hautes, panache noir et braises de l'incendie, fumée du gouvernail brisé
 * à la poupe, et la sainte-barbe (grosse explosion, débris projetés à l'eau, colonne de fumée qui reste).
 */
export class CritFx {
  /** Accumulateurs d'émission par navire : flammes, fumée de l'incendie, braises, fumée de la poupe. */
  private readonly timers = new WeakMap<Ship, { flame: number; smoke: number; ember: number; stern: number }>();
  private readonly columns: Column[] = [];

  constructor(private readonly effects: Effects) {}

  /** La réserve de poudre de `ship` saute en `at`. */
  magazine(ship: Ship, at: THREE.Vector3) {
    this.effects.explosion(at, CRIT.magazineScale);
    const [near, far] = CRIT.magazineDebrisRange;
    for (let i = 0; i < CRIT.magazineDebris; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = near + Math.random() * (far - near);
      debris.set(at.x + Math.cos(a) * d, ship.position.y, at.z + Math.sin(a) * d);
      this.effects.impact(debris);
      this.effects.splash(debris.x, debris.y, debris.z);
    }
    this.columns.push({ at: at.clone(), time: CRIT.magazineSmoke.time, acc: 0 });
  }

  update(dt: number, ships: readonly Ship[]) {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i];
      c.time -= dt;
      for (c.acc += dt * CRIT.magazineSmoke.rate; c.acc >= 1; c.acc--) this.effects.plume(c.at, 1.3);
      if (c.time <= 0) this.columns.splice(i, 1);
    }
    for (const ship of ships) {
      const { crits } = ship;
      if (!ship.alive || !crits.any) continue;
      let t = this.timers.get(ship);
      if (!t) this.timers.set(ship, (t = { flame: 0, smoke: 0, ember: 0, stern: 0 }));
      ship.model.root.updateMatrixWorld();
      if (crits.fire > 0) {
        const spots = ship.model.fireSpots;
        if (spots.length) point.copy(spots[crits.fireSpot % spots.length]).applyMatrix4(ship.model.root.matrixWorld);
        else point.copy(ship.position).setY(ship.position.y + 1.5);
        for (t.flame += dt * CRIT.flameRate; t.flame >= 1; t.flame--) this.effects.flame(point);
        for (t.smoke += dt * CRIT.smokeRate; t.smoke >= 1; t.smoke--) this.effects.plume(point);
        for (t.ember += dt * CRIT.emberRate; t.ember >= 1; t.ember--) this.effects.ember(point);
      }
      if (crits.rudder > 0) {
        const back = ship.stats.length / 2;
        point.set(ship.position.x - Math.sin(ship.heading) * back, ship.position.y + 1.2, ship.position.z - Math.cos(ship.heading) * back);
        for (t.stern += dt * CRIT.smokeRate * 0.6; t.stern >= 1; t.stern--) this.effects.puff(point, false);
      }
    }
  }
}
