import { LAND } from '../config';
import type { Ship } from '../ship/ship';
import { land } from './island';

/** Points de la coque testés (fraction de la longueur vers l'avant, fraction de la largeur vers bâbord). */
const PROBES = [
  [0.48, 0],
  [-0.45, 0],
  [0, 0.5],
  [0, -0.5],
  [0.28, 0.42],
  [0.28, -0.42],
  [-0.28, 0.45],
  [-0.28, -0.45],
] as const;
/** Distance minimale au rivage (m) : la coque ne s'enfonce pas dans le sable. */
const SHORE_GAP = 1;
const g = { x: 0, z: 0 };

/**
 * Les bateaux butent contre la côte : si un point de la coque entre dans les terres, le bateau est repoussé
 * vers le large. Pas de dégâts ; sa vitesse tombe à LAND.bumpSpeed, assez pour virer et repartir.
 */
export function resolveLandCollisions(ships: readonly Ship[]) {
  for (const ship of ships) {
    const p = ship.position;
    if (land.sdf(p.x, p.z) > ship.stats.length + SHORE_GAP) continue;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    let deepest = 0;
    let hitX = 0;
    let hitZ = 0;
    for (const [f, s] of PROBES) {
      // Bâbord en coordonnées monde : (fz, -fx).
      const x = p.x + fx * f * ship.stats.length + fz * s * ship.stats.width;
      const z = p.z + fz * f * ship.stats.length - fx * s * ship.stats.width;
      const depth = SHORE_GAP - land.sdf(x, z);
      if (depth > deepest) {
        deepest = depth;
        hitX = x;
        hitZ = z;
      }
    }
    if (deepest <= 0) continue;
    land.gradient(hitX, hitZ, g);
    p.x += g.x * deepest;
    p.z += g.z * deepest;
    ship.speed = Math.min(ship.speed, LAND.bumpSpeed);
  }
}
