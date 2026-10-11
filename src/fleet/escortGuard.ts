import { FLEET, LAND } from '../config';
import type { Ship } from '../ship/ship';
import { land } from '../world/island';

/**
 * Poste d'un suiveur dans le cercle de protection autour du navire escorté, en coordonnées monde.
 * `rank` (à partir de 0) parmi `count` gardes, répartis à égale distance d'angle en partant de son flanc bâbord :
 * un seul garde se tient sur son flanc, deux sur ses deux flancs, quatre devant, derrière et sur les flancs.
 */
export function guardSlot(rank: number, count: number, escort: Ship, guard: Ship): { x: number; z: number } {
  const radius = FLEET.guardGap + (escort.stats.length + guard.stats.length) / 2;
  const angle = escort.heading + Math.PI / 2 + (rank / Math.max(1, count)) * Math.PI * 2;
  const x = escort.position.x + Math.sin(angle) * radius;
  const z = escort.position.z + Math.cos(angle) * radius;
  return land.keepOffshore(x, z, LAND.allyMargin + 6);
}
