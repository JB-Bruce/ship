import * as THREE from 'three';
import { BROADSIDE, LAND, LINE_OF_FIRE, SAIL } from '../config';
import { cannonStatsOf } from '../combat/cannons';
import { isHostile, type Ship } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import { wrapAngle } from '../utils/math';
import { land } from '../world/island';
import { conditions } from '../world/weather';
import { worldEdge } from '../world/worldEdge';

/** Avantage (rad) qu'il faut pour changer de flanc pendant un engagement : évite d'hésiter. */
const SIDE_SWITCH_MARGIN = 0.5;
/** Un canon dont la direction de tir s'écarte de l'axe de plus de 45° (sinus) est un canon de flanc. */
const FLANK_SINE = Math.SQRT1_2;

/**
 * Met la barre pour rejoindre un cap, avec la jauge de voile donnée (0..1).
 * Le cap est d'abord corrigé pour contourner les terres : les ennemis s'en tiennent très à l'écart, les alliés moins.
 */
export function steerTo(ship: Ship, heading: number, sail: number) {
  heading = avoidLand(ship, heading, ship.faction === 'enemy' || ship.faction === 'cursed' ? LAND.enemyMargin : LAND.allyMargin);
  const diff = wrapAngle(heading - ship.heading);
  ship.controls.rudder = THREE.MathUtils.clamp(diff * 2, -1, 1);
  ship.controls.sail = sail;
}

/** Écarts de cap essayés pour contourner une terre, du plus petit au plus grand (rad). */
const DETOURS = [0.35, 0.7, 1.05, 1.4, 1.8, 2.3, 2.8];
const away = { x: 0, z: 0 };

/** Place libre autour de (x, z) : distance au rivage, ou à la limite que les IA gardent avant la tempête du bord. */
const room = (x: number, z: number) => Math.min(land.sdf(x, z), worldEdge.room(x, z));

/**
 * Sonde la mer devant le bateau dans la direction `heading` : si la route passe à moins de `margin` mètres
 * du rivage (ou de la limite de la tempête du bord), renvoie le cap dégagé le plus proche (d'un côté ou de l'autre) ;
 * si tout est bouché, le large (ou le centre du monde).
 */
export function avoidLand(ship: Ship, heading: number, margin: number): number {
  const p = ship.position;
  const look = ship.stats.length + 10 + ship.speed * 3;
  if (room(p.x, p.z) > margin + look) return heading;
  const clearance = (h: number) => {
    const sx = Math.sin(h);
    const sz = Math.cos(h);
    return Math.min(room(p.x + sx * look * 0.5, p.z + sz * look * 0.5), room(p.x + sx * look, p.z + sz * look));
  };
  if (clearance(heading) >= margin) return heading;
  for (const delta of DETOURS) {
    const left = clearance(heading + delta);
    const right = clearance(heading - delta);
    if (left >= margin || right >= margin) return left >= right ? heading + delta : heading - delta;
  }
  if (worldEdge.room(p.x, p.z) < land.sdf(p.x, p.z)) worldEdge.inward(p.x, p.z, away);
  else land.gradient(p.x, p.z, away);
  return Math.atan2(away.x, away.z);
}

/** Cap vers un point du monde. */
export function bearingTo(ship: Ship, x: number, z: number): number {
  return Math.atan2(x - ship.position.x, z - ship.position.z);
}

/**
 * Le bateau hostile vivant le plus proche parmi `candidates`, s'il est à moins de `maxDistance`. `spotting` : il faut
 * d'abord le repérer (patrouille) ; un navire discret (ShipTypeDef.detectability) ne l'est qu'à une part de la portée.
 */
export function nearest(ship: Ship, candidates: readonly Ship[], maxDistance: number, spotting = false): Ship | null {
  let best: Ship | null = null;
  let bestDistance = maxDistance;
  for (const other of candidates) {
    if (other === ship || !other.alive || !isHostile(ship, other)) continue;
    const d = ship.distanceTo(other) / (spotting ? (SHIP_TYPES[other.type].detectability ?? 1) : 1);
    if (d < bestDistance) {
      best = other;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Portée de tir d'un navire (m) : son canon de flanc qui porte le plus loin, améliorations et météo comprises. Un canon
 * de chasse (tourné vers la proue) ne compte pas : réglé sur lui, le navire tiendrait sa cible hors de portée de ses
 * bordées. Un navire armé seulement à l'avant (barque) compte ses canons de proue.
 */
export function firingRange(ship: Ship): number {
  let flank = 0;
  let any = 0;
  for (const mount of ship.model.cannons) {
    const range = cannonStatsOf(ship, mount).range;
    any = Math.max(any, range);
    if (Math.abs(Math.sin(mount.angle)) > FLANK_SINE) flank = Math.max(flank, range);
  }
  return (flank || any) * conditions.rangeFactor;
}

/**
 * Engagement flanc à flanc, réglé sur la portée de tir du navire : au-delà de BROADSIDE.turnAt × sa portée, il fonce
 * droit sur la cible (toute voile) ; en deçà, il vire peu à peu pour lui présenter son flanc, jusqu'à être
 * perpendiculaire à `hold` (par défaut BROADSIDE.holdFraction × sa portée) ; plus près, il ouvre l'angle pour s'écarter.
 * La cible peut être un bateau ou un point fixe (une citadelle assiégée). Renvoie le flanc choisi (+1 / -1), à repasser
 * à l'appel suivant.
 */
export function broadside(ship: Ship, target: { position: THREE.Vector3 }, side: number, sail: number, hold?: number): number {
  const reach = firingRange(ship);
  const keep = hold ?? reach * BROADSIDE.holdFraction;
  const start = Math.max(reach * BROADSIDE.turnAt, keep * 1.2);
  const distance = Math.hypot(target.position.x - ship.position.x, target.position.z - ship.position.z);
  const bearing = bearingTo(ship, target.position.x, target.position.z);
  if (distance >= start) {
    steerTo(ship, bearing, SAIL.full);
    return side;
  }
  // Écart du cap avec la direction de la cible : 0 en entrant à portée, 90° à la distance tenue (racine : il vire
  // franchement dès qu'il arrive à portée), plus de 90° trop près.
  const offset =
    distance > keep
      ? (Math.PI / 2) * Math.sqrt((start - distance) / (start - keep))
      : Math.PI / 2 + THREE.MathUtils.clamp((keep - distance) / keep, 0, 0.6);
  const headingFor = (s: number) => wrapAngle(bearing + s * offset);
  const turnFor = (s: number) => Math.abs(wrapAngle(headingFor(s) - ship.heading));
  if (turnFor(-side) + SIDE_SWITCH_MARGIN < turnFor(side)) side = -side;
  steerTo(ship, headingFor(side), sail);
  return side;
}

/**
 * IA au combat dont un camarade masque la cible (Ship.fireBlocker, posé par updateCannons) : elle ralentit s'il est
 * devant elle, force la voile s'il est derrière, et s'écarte de quelques degrés de son côté pour sortir de l'axe.
 * À appeler après le pilotage de combat (broadside…), qu'elle corrige tant que la gêne dure.
 */
export function clearLineOfFire(ship: Ship) {
  const blocker = ship.fireBlocker;
  if (ship.fireBlocked <= 0 || !blocker || !blocker.alive) return;
  const bx = blocker.position.x - ship.position.x;
  const bz = blocker.position.z - ship.position.z;
  const ahead = bx * Math.sin(ship.heading) + bz * Math.cos(ship.heading) > 0;
  // Bâbord = +X local : le camarade est-il à bâbord (> 0) ? On s'écarte de l'autre côté.
  const port = bx * Math.cos(ship.heading) - bz * Math.sin(ship.heading) > 0;
  steerTo(ship, ship.heading + (port ? -1 : 1) * LINE_OF_FIRE.veer, ahead ? LINE_OF_FIRE.slowSail : SAIL.full);
}
