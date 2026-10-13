import { CONTRACTS } from '../config';
import { SHIP_TYPES, type ShipType } from '../shipTypes';

/**
 * Menace d'une mission, en points : chaque navire compte sa taille (`ShipTypeDef.threat` : barque 1 … frégate 6), un navire d'élite
 * × CONTRACTS.eliteThreat. Les étoiles d'un contrat de combat viennent de cette menace (CONTRACTS.threatStars) :
 * couler 3 chaloupes (6 points) vaut une étoile.
 */
export const shipThreat = (type: ShipType) => SHIP_TYPES[type].threat;

/** Menace moyenne d'un navire tiré au hasard entre les tailles de `min` et de `max` (comme `squadronTypes`). */
export function rangeThreat(min: ShipType, max: ShipType): number {
  const top = shipThreat(max);
  return (Math.min(top, shipThreat(min)) + top) / 2;
}

/** Menace moyenne d'un navire parmi `types` (ceux qui apparaissent en ce moment). */
export const averageThreat = (types: readonly ShipType[]) => (types.length ? types.reduce((sum, t) => sum + shipThreat(t), 0) / types.length : 1);

/** Menace d'une escadre imposée : le chef d'abord, d'élite si `eliteLeader`. */
export const squadronThreat = (types: readonly ShipType[], eliteLeader: boolean) =>
  types.reduce((sum, t, i) => sum + shipThreat(t) * (i === 0 && eliteLeader ? CONTRACTS.eliteThreat : 1), 0);

/** Étoiles (1 à CONTRACTS.stars) d'une menace en points. */
export function starsForThreat(points: number): number {
  let stars = 1;
  for (const min of CONTRACTS.threatStars) if (points >= min) stars++;
  return Math.min(CONTRACTS.stars, stars);
}

/** Menace visée pour un nombre d'étoiles : le milieu de sa plage de points. */
export function targetThreat(stars: number): number {
  const t = CONTRACTS.threatStars;
  const from = stars > 1 ? t[stars - 2] : 0;
  const to = t[stars - 1] ?? from + (t[t.length - 1] - t[t.length - 2]);
  return (from + to) / 2;
}
