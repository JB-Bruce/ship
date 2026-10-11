import { LIGHTNING } from '../config';
import type { ChaseCamera } from '../camera/chaseCamera';
import type { Fleet } from '../fleet/fleet';
import type { Effects } from '../fx/effects';
import type { Ship } from '../ship/ship';
import type { Hud } from '../ui/hud';
import type { WeatherEvents } from './weather';

/**
 * Ce que les dangers du temps font au jeu : un éclair proche secoue la caméra, la foudre qui frappe un mât fait des
 * éclats et des dégâts, un paquet de mer déferle sur l'avant d'un bateau. `damage` : Game.applyDamage.
 */
export function weatherHazards(camera: ChaseCamera, effects: Effects, fleet: Fleet, hud: Hud, damage: (ship: Ship, amount: number) => void): WeatherEvents {
  return {
    bolt(distance) {
      if (distance < LIGHTNING.shakeRadius) camera.shake(LIGHTNING.shake * (1 - distance / LIGHTNING.shakeRadius));
    },
    strike(ship, top) {
      effects.impact(top);
      const member = fleet.members.find((m) => m.ship === ship);
      if (member) hud.message(`⚡ La foudre frappe ${member.name} !`, 3);
      damage(ship, ship.stats.maxHealth * LIGHTNING.strikeDamage);
    },
    seaHit(ship, bow, amount) {
      effects.seaWash(bow, Math.sin(ship.heading), Math.cos(ship.heading), ship.stats.width);
      damage(ship, amount);
    },
  };
}
