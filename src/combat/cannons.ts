import * as THREE from 'three';
import { COMBAT, type CannonStats } from '../config';
import type { Effects } from '../fx/effects';
import type { Waves } from '../ocean/waves';
import { isHostile, type Ship } from '../ship/ship';
import type { CannonMount } from '../ship/shipModel';
import { moveTowards, wrapAngle } from '../utils/math';
import { conditions } from '../world/weather';
import { aimHeight, aimSpot, distanceSpread, newAimPoint, pickAimPoint, type AimPoint } from './aimSpread';
import type { Projectiles } from './projectiles';

/** Vitesse de rotation d'un canon (rad/s) : il pivote, il ne se téléporte pas. */
const TURN_SPEED = 1.3;
/** Écart toléré entre le fût et la visée pour tirer (rad). */
const AIM_TOLERANCE = 0.05;
const muzzle = new THREE.Vector3();
const velocity = new THREE.Vector3();
const aim = { x: 0, z: 0, flight: 0 };
const spot = { x: 0, z: 0 };
/** Ce sur quoi un canon peut tirer : un bateau, ou un point fixe assiégé (la citadelle d'une mission de défense). */
export interface CannonTarget {
  readonly position: THREE.Vector3;
  readonly velocityX: number;
  readonly velocityZ: number;
  /** Rayon d'un ouvrage assiégé : il est à portée dès que son enceinte l'est (m). */
  readonly radius?: number;
}

/** Point visé par chaque canon sur sa cible (sa cible aussi, pour repérer quand il en prend une nouvelle). */
const aimPoints = new WeakMap<CannonMount, AimPoint>();
const aimPointOf = (mount: CannonMount) => {
  let point = aimPoints.get(mount);
  if (!point) aimPoints.set(mount, (point = newAimPoint()));
  return point;
};

/** Réglages du calibre d'un canon : principal, ou du pont supérieur sur un navire à deux calibres. */
export function cannonStatsOf(ship: Ship, mount: CannonMount): CannonStats {
  return mount.calibre === 'deck' && ship.stats.deckCannon ? ship.stats.deckCannon : ship.stats.cannon;
}

/** Demi-angle de tir d'un canon : le sien (triples canons et pièces du château avant de la galéasse), sinon celui de son calibre. */
export const arcOf = (mount: CannonMount, c: CannonStats) => mount.arcHalfAngle ?? c.arcHalfAngle;

/** Temps de vol (s) d'un tir de ce calibre jusqu'à `distance` m : boulet tendu, ou obus de mortier en cloche. */
export function flightTime(c: CannonStats, distance: number): number {
  return c.shell ? c.shell.flightBase + c.shell.flightPerMeter * distance : distance / c.ballSpeed;
}

/** Un tirage aléatoire entre -1 et 1, plus souvent proche de 0 (somme de deux tirages). */
const centered = () => Math.random() + Math.random() - 1;

/**
 * Canons automatiques. Chaque canon pivote en continu vers l'ennemi le plus proche à portée
 * et dans sa zone de tir (même pendant le rechargement), revient au neutre sans cible,
 * et tire dès qu'il est rechargé et bien pointé. Mêmes règles pour tous les camps. Un assiégeant
 * (`Ship.siegeTarget`) bombarde la citadelle quand aucun bateau n'est à portée de ce canon.
 */
export function updateCannons(dt: number, ships: readonly Ship[], projectiles: Projectiles, effects: Effects, waves: Waves) {
  for (const ship of ships) {
    if (!ship.alive) continue;
    const mounts = ship.model.cannons;
    let lastAngle = NaN;
    let lastArc = NaN;
    let lastCalibre: CannonStats | null = null;
    let target: CannonTarget | null = null;
    for (let i = 0; i < mounts.length; i++) {
      const mount = mounts[i];
      const c = cannonStatsOf(ship, mount);
      const arc = arcOf(mount, c);
      // Les canons d'un même bord, d'un même calibre et d'un même angle de tir partagent leur cible : une seule recherche.
      if (mount.angle !== lastAngle || c !== lastCalibre || arc !== lastArc) {
        lastAngle = mount.angle;
        lastCalibre = c;
        lastArc = arc;
        target = findTarget(ship, mount.angle, ships, c, arc) ?? siegeTargetFor(ship, mount.angle, c, arc);
      }
      // Nouvelle cible : un court délai propre à chaque canon, pour que la bordée parte en cascade, et un point visé à lui.
      const point = aimPointOf(mount);
      if (point.target !== target) {
        if (target) {
          mount.fireDelay = Math.random() * COMBAT.acquireDelay;
          pickAimPoint(point, target);
        } else point.target = null;
      }
      ship.cannonCooldowns[i] = Math.max(0, ship.cannonCooldowns[i] - dt);

      let desired = 0;
      if (target) {
        leadTarget(ship, target, point, c);
        desired = yawToward(ship, mount, c, aim.x, aim.z);
      }
      mount.yaw = moveTowards(mount.yaw, desired, TURN_SPEED * dt);
      mount.object.rotation.y = mount.baseYaw + mount.yaw;

      // Le délai ne s'écoule qu'une fois le canon chargé et pointé : sinon tous les canons d'un flanc, qui pivotent
      // ensemble, l'auraient épuisé pendant la rotation et partiraient à la même image.
      const ready = target !== null && ship.cannonCooldowns[i] === 0 && Math.abs(mount.yaw - desired) < AIM_TOLERANCE;
      if (ready) mount.fireDelay = Math.max(0, mount.fireDelay - dt);
      if (ready && target && mount.fireDelay === 0) {
        fire(ship, mount, c, aimHeight(point, target, aim.x, aim.z, waves), projectiles, effects);
        ship.cannonCooldowns[i] = c.reloadTime * (mount.reloadFactor ?? 1) * (0.9 + Math.random() * 0.2);
        mount.fireDelay = Math.random() * COMBAT.acquireDelay;
        pickAimPoint(point, target);
      }
    }
  }
}

/**
 * L'ennemi le plus proche à portée et dans l'arc d'un canon pointant vers `angle`
 * (repère du bateau : 0 = proue, +π/2 = bâbord, -π/2 = tribord), ou null. `cannon` : son calibre ; `arc` : son
 * demi-angle de tir, s'il a le sien (arcOf).
 */
export function findTarget(ship: Ship, angle: number, ships: readonly Ship[], cannon: CannonStats = ship.stats.cannon, arc = cannon.arcHalfAngle): Ship | null {
  const { range } = cannon;
  const minCos = Math.cos(arc);
  // Direction de tir en coordonnées monde.
  const sx = Math.sin(ship.heading + angle);
  const sz = Math.cos(ship.heading + angle);
  let best: Ship | null = null;
  let bestDistance = range * conditions.rangeFactor;
  for (const other of ships) {
    if (other === ship || !other.alive || !isHostile(ship, other)) continue;
    const dx = other.position.x - ship.position.x;
    const dz = other.position.z - ship.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > bestDistance || (dx * sx + dz * sz) / distance < minCos) continue;
    best = other;
    bestDistance = distance;
  }
  return best;
}

/** Le point assiégé par ce bateau, s'il est à portée et dans l'arc du canon pointant vers `angle`, sinon null. */
function siegeTargetFor(ship: Ship, angle: number, cannon: CannonStats, arc: number): CannonTarget | null {
  const target = ship.siegeTarget;
  if (!target) return null;
  const dx = target.position.x - ship.position.x;
  const dz = target.position.z - ship.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance - (target.radius ?? 0) > cannon.range * conditions.rangeFactor) return null;
  const facing = (dx * Math.sin(ship.heading + angle) + dz * Math.cos(ship.heading + angle)) / distance;
  return facing >= Math.cos(arc) ? target : null;
}

/** Anticipation : où sera le point visé sur la cible quand le boulet arrivera (résultat dans `aim`). */
function leadTarget(ship: Ship, target: CannonTarget, point: AimPoint, c: CannonStats) {
  aimSpot(point, target, spot);
  aim.x = spot.x;
  aim.z = spot.z;
  for (let k = 0; k < 3; k++) {
    aim.flight = flightTime(c, Math.hypot(aim.x - ship.position.x, aim.z - ship.position.z));
    aim.x = spot.x + target.velocityX * aim.flight;
    aim.z = spot.z + target.velocityZ * aim.flight;
  }
}

/** Décalage du canon (par rapport au neutre) pour viser (tx, tz), limité à l'arc de tir. */
function yawToward(ship: Ship, mount: CannonMount, c: CannonStats, tx: number, tz: number): number {
  // Angle de la cible dans le repère du bateau, comparé à la direction neutre du canon.
  const relative = Math.atan2(tx - ship.position.x, tz - ship.position.z) - ship.heading;
  const limit = arcOf(mount, c);
  return THREE.MathUtils.clamp(wrapAngle(relative - mount.angle), -limit, limit);
}

/** Un coup de canon : un boulet par fût (triple canon), sinon un seul ; `aimY` : hauteur visée (y du monde). */
function fire(ship: Ship, mount: CannonMount, c: CannonStats, aimY: number, projectiles: Projectiles, effects: Effects) {
  ship.model.root.updateMatrixWorld();
  if (mount.barrels) for (const barrel of mount.barrels) shoot(ship, mount, barrel, c, aimY, projectiles, effects);
  else shoot(ship, mount, mount.muzzle, c, aimY, projectiles, effects);
  ship.markCombat();
  ship.recoil(mount.angle);
}

/** Tire un boulet (ou un obus) depuis la bouche `local` (repère du canon) vers le point visé, à la hauteur `aimY`. */
function shoot(ship: Ship, mount: CannonMount, local: THREE.Vector3, c: CannonStats, aimY: number, projectiles: Projectiles, effects: Effects) {
  mount.object.localToWorld(muzzle.copy(local));

  // Imprécision : un léger écart d'angle et de distance (le spread), qui peut faire rater ; il grandit avec la distance.
  const dx = aim.x - muzzle.x;
  const dz = aim.z - muzzle.z;
  const distance = Math.hypot(dx, dz);
  const far = distanceSpread(distance, c.range * conditions.rangeFactor);
  const angle = Math.atan2(dx, dz) + centered() * c.spread * far;
  const flight = flightTime(c, distance);
  const speed = (distance / flight) * (1 + centered() * c.rangeError * far);
  // Vitesse verticale pour arriver à la hauteur visée au bout du temps de vol (l'obus tombe plus vite qu'un boulet).
  const gravity = COMBAT.gravity * (c.shell?.gravityFactor ?? 1);
  const vy = (aimY - muzzle.y + 0.5 * gravity * flight * flight) / flight;
  velocity.set(Math.sin(angle) * speed, vy, Math.cos(angle) * speed);

  projectiles.fire(muzzle, velocity, ship, c.damage, c.shell);
  if (c.shell) effects.mortarLaunch(muzzle);
  else effects.muzzleFlash(muzzle, Math.sin(angle), Math.cos(angle));
}
