import * as THREE from 'three';
import { FIRESHIP } from '../config';
import type { Effects } from '../fx/effects';
import { isHostile, type Ship } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import type { Criticals } from './criticals';

/** Ce que l'explosion d'un brûlot touche et montre. */
export interface FireshipWorld {
  readonly effects: Effects;
  readonly criticals: Criticals;
  /** Dégâts portés par `attacker` (null : le brûlot qui se sacrifie) ; `forced` : même sur un navire invincible (triche). */
  applyDamage(ship: Ship, damage: number, attacker: Ship | null, forced?: boolean): void;
}

const puff = new THREE.Vector3();

/**
 * Brûlots (navires maudits) : au premier contact avec une coque adverse (world/collisions.ts), toute leur poudre saute.
 * Le navire touché prend la charge entière (`ShipTypeDef.fireship`, selon les allongements) et prend feu ; les autres
 * adversaires du brûlot dans le rayon du souffle en prennent une part (FIRESHIP) et prennent souvent feu ; le brûlot
 * sombre. Sa fumée traîne derrière lui tant qu'il est à flot, près de la caméra.
 */
export class Fireships {
  /** Temps jusqu'à la prochaine bouffée de fumée, par brûlot. */
  private readonly smoke = new Map<Ship, number>();

  constructor(private readonly world: FireshipWorld) {}

  detonate(fireship: Ship, target: Ship, ships: readonly Ship[]) {
    const charge = SHIP_TYPES[fireship.type].fireship;
    if (!charge || !fireship.alive) return;
    const k = Math.min(fireship.extension, charge.damage.length - 1);
    const damage = charge.damage[k];
    const radius = charge.radius[k];
    const { criticals } = this.world;
    criticals.explode(fireship);
    this.world.applyDamage(target, damage, fireship);
    criticals.ignite(target);
    for (const other of ships) {
      if (other === fireship || other === target || !other.alive || other.intangible || !isHostile(fireship, other)) continue;
      const d = other.distanceTo(fireship);
      if (d > radius) continue;
      this.world.applyDamage(other, damage * FIRESHIP.blastShare * (1 - (1 - FIRESHIP.edge) * (d / radius)), fireship);
      if (Math.random() < FIRESHIP.igniteChance) criticals.ignite(other);
    }
    this.world.applyDamage(fireship, fireship.health + fireship.stats.maxHealth, null, true);
  }

  /** Fumée des brûlots à flot à moins de FIRESHIP.smoke.range de la caméra. */
  update(dt: number, ships: readonly Ship[], camera: THREE.Vector3) {
    const { rate, scale, range } = FIRESHIP.smoke;
    for (const ship of ships) {
      if (!SHIP_TYPES[ship.type].fireship) continue;
      if (!ship.alive || ship.drowned > 0) {
        this.smoke.delete(ship);
        continue;
      }
      if (ship.position.distanceTo(camera) > range) continue;
      const left = (this.smoke.get(ship) ?? Math.random() / rate) - dt;
      if (left > 0) {
        this.smoke.set(ship, left);
        continue;
      }
      this.smoke.set(ship, 1 / rate);
      const spots = ship.model.fireSpots;
      if (!spots.length) continue;
      ship.model.root.updateMatrixWorld();
      puff.copy(spots[Math.floor(Math.random() * spots.length)]).applyMatrix4(ship.model.root.matrixWorld);
      this.world.effects.plume(puff, scale);
    }
    // Brûlots disparus du monde : on oublie leur minuterie.
    for (const ship of this.smoke.keys()) if (!ships.includes(ship)) this.smoke.delete(ship);
  }
}
