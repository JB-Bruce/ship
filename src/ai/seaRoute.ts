import { MERCHANT, ROUTES } from '../config';
import { land, type Island } from '../world/island';

export interface Waypoint {
  x: number;
  z: number;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));

/** Sortie (ou entrée) de la crique d'une île : un point au large de son port, un peu au hasard autour de son axe. */
export function bayMouth(island: Island): Waypoint {
  const angle = island.def.bay.angle + (Math.random() * 2 - 1) * ROUTES.mouthAngle;
  return island.pointAt(angle, -(MERCHANT.offing + rand(ROUTES.mouthOffing)));
}

/**
 * Trajet en mer de `from` jusqu'à `to` (inclus) : sur un long trajet, 1 ou 2 détours tirés au hasard d'un côté ou de
 * l'autre, gardés loin des côtes. La terre qui reste sur le chemin est contournée par `steerTo`.
 */
export function seaRoute(from: Waypoint, to: Waypoint): Waypoint[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const route: Waypoint[] = [];
  if (length > ROUTES.detourFrom) {
    const count = randInt(ROUTES.detours);
    for (let i = 1; i <= count; i++) {
      const t = (i + (Math.random() - 0.5) * 0.4) / (count + 1);
      const side = (Math.random() * 2 - 1) * ROUTES.detourWidth;
      // Perpendiculaire au trajet : (dz, -dx) / longueur.
      route.push(land.keepOffshore(from.x + dx * t + (dz / length) * side, from.z + dz * t - (dx / length) * side, ROUTES.shoreClearance));
    }
  }
  route.push(to);
  return route;
}

/** Ondulation du cap en route, propre à chaque navire (rad). */
export class Wander {
  private time = Math.random() * 100;
  private readonly pulsation = (2 * Math.PI) / rand(ROUTES.wanderPeriod);

  update(dt: number): number {
    this.time += dt;
    return Math.sin(this.time * this.pulsation) * ROUTES.wander;
  }
}
