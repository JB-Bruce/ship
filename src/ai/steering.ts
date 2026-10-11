import * as THREE from 'three';
import { ENEMIES, LAND } from '../config';
import { isHostile, type Ship } from '../ship/ship';
import { wrapAngle } from '../utils/math';
import { land } from '../world/island';

/** Avantage (rad) qu'il faut pour changer de flanc pendant un engagement : évite d'hésiter. */
const SIDE_SWITCH_MARGIN = 0.5;

/**
 * Met la barre pour rejoindre un cap, avec la jauge de voile donnée (0..1).
 * Le cap est d'abord corrigé pour contourner les terres : les ennemis s'en tiennent très à l'écart, les alliés moins.
 */
export function steerTo(ship: Ship, heading: number, sail: number) {
  heading = avoidLand(ship, heading, ship.faction === 'enemy' ? LAND.enemyMargin : LAND.allyMargin);
  const diff = wrapAngle(heading - ship.heading);
  ship.controls.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
  ship.controls.sail = sail;
}

/** Écarts de cap essayés pour contourner une terre, du plus petit au plus grand (rad). */
const DETOURS = [0.35, 0.7, 1.05, 1.4, 1.8, 2.3, 2.8];
const away = { x: 0, z: 0 };

/**
 * Sonde la mer devant le bateau dans la direction `heading` : si la route passe à moins de `margin` mètres
 * du rivage, renvoie le cap dégagé le plus proche (d'un côté ou de l'autre) ; si tout est bouché, le large.
 */
export function avoidLand(ship: Ship, heading: number, margin: number): number {
  const p = ship.position;
  const look = ship.stats.length + 10 + ship.speed * 3;
  if (land.sdf(p.x, p.z) > margin + look) return heading;
  const clearance = (h: number) => {
    const sx = Math.sin(h);
    const sz = Math.cos(h);
    return Math.min(land.sdf(p.x + sx * look * 0.5, p.z + sz * look * 0.5), land.sdf(p.x + sx * look, p.z + sz * look));
  };
  if (clearance(heading) >= margin) return heading;
  for (const delta of DETOURS) {
    const left = clearance(heading + delta);
    const right = clearance(heading - delta);
    if (left >= margin || right >= margin) return left >= right ? heading + delta : heading - delta;
  }
  land.gradient(p.x, p.z, away);
  return Math.atan2(away.x, away.z);
}

/** Cap vers un point du monde. */
export function bearingTo(ship: Ship, x: number, z: number): number {
  return Math.atan2(x - ship.position.x, z - ship.position.z);
}

/** Le bateau hostile vivant le plus proche parmi `candidates`, s'il est à moins de `maxDistance`. */
export function nearest(ship: Ship, candidates: readonly Ship[], maxDistance: number): Ship | null {
  let best: Ship | null = null;
  let bestDistance = maxDistance;
  for (const other of candidates) {
    if (other === ship || !other.alive || !isHostile(ship, other)) continue;
    const d = ship.distanceTo(other);
    if (d < bestDistance) {
      best = other;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Engagement flanc à flanc : cap perpendiculaire à la cible (elle se retrouve sur un flanc, face aux canons),
 * corrigé pour tenir la distance `range`. La cible peut être un bateau ou un point fixe (une citadelle assiégée).
 * Renvoie le flanc choisi (+1 / -1), à repasser à l'appel suivant.
 */
export function broadside(ship: Ship, target: { position: THREE.Vector3 }, side: number, sail: number, range = ENEMIES.engageRange): number {
  const distance = Math.hypot(target.position.x - ship.position.x, target.position.z - ship.position.z);
  const bearing = bearingTo(ship, target.position.x, target.position.z);
  // Trop loin : on referme l'angle vers la cible. Trop près : on l'ouvre pour s'écarter.
  const correction = THREE.MathUtils.clamp((distance - range) / range, -0.6, 0.6);
  const headingFor = (s: number) => wrapAngle(bearing + s * (Math.PI / 2 - correction));
  const turnFor = (s: number) => Math.abs(wrapAngle(headingFor(s) - ship.heading));
  if (turnFor(-side) + SIDE_SWITCH_MARGIN < turnFor(side)) side = -side;
  steerTo(ship, headingFor(side), sail);
  return side;
}
