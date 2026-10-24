import * as THREE from 'three';
import { AUDIO, RAM } from '../config';
import type { Effects } from '../fx/effects';
import { factor } from '../progression/modifiers';
import { isHostile, type Ship } from '../ship/ship';
import { sound } from '../audio/sound';

/** Chaque coque est approchée par 3 cercles le long de la quille (fractions de la longueur). */
const CIRCLES = [-1 / 3, 0, 1 / 3];
const contact = new THREE.Vector3();

/**
 * Collisions entre bateaux : ils se repoussent, et un choc assez rapide fait des dégâts (éperonnage), selon la vitesse
 * de rapprochement et la masse de l'autre (RAM). Celui qui frappe avec sa proue encaisse moins que celui qui est percuté ;
 * le plus lourd repousse le plus léger et garde plus de sa vitesse.
 * `onRam` reçoit les dégâts à appliquer à chaque bateau touché, et le bateau qui l'a percuté.
 */
export function resolveCollisions(ships: readonly Ship[], effects: Effects, onRam: (ship: Ship, damage: number, other: Ship) => void) {
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i];
      const b = ships[j];
      if (!a.alive || !b.alive || a.intangible || b.intangible || a.distanceTo(b) > (a.stats.length + b.stats.length) / 2) continue;
      collide(a, b, effects, onRam);
    }
  }
}

function collide(a: Ship, b: Ship, effects: Effects, onRam: (ship: Ship, damage: number, other: Ship) => void) {
  // Trouve la paire de cercles qui se chevauche le plus.
  let overlap = 0;
  let nx = 0;
  let nz = 0;
  const ra = a.stats.width / 2 + 0.1;
  const rb = b.stats.width / 2 + 0.1;
  for (const ka of CIRCLES) {
    const ax = a.position.x + Math.sin(a.heading) * ka * a.stats.length;
    const az = a.position.z + Math.cos(a.heading) * ka * a.stats.length;
    for (const kb of CIRCLES) {
      const bx = b.position.x + Math.sin(b.heading) * kb * b.stats.length;
      const bz = b.position.z + Math.cos(b.heading) * kb * b.stats.length;
      const d = Math.hypot(bx - ax, bz - az) || 0.001;
      if (ra + rb - d > overlap) {
        overlap = ra + rb - d;
        nx = (bx - ax) / d;
        nz = (bz - az) / d;
        contact.set((ax + bx) / 2, (a.position.y + b.position.y) / 2 + 0.5, (az + bz) / 2);
      }
    }
  }
  if (overlap <= 0) return;

  // On les écarte le long de la normale de contact : le plus léger recule davantage.
  const shareA = b.mass / (a.mass + b.mass);
  const shareB = 1 - shareA;
  a.position.x -= nx * overlap * shareA;
  a.position.z -= nz * overlap * shareA;
  b.position.x += nx * overlap * shareB;
  b.position.z += nz * overlap * shareB;

  const closing = (a.velocityX - b.velocityX) * nx + (a.velocityZ - b.velocityZ) * nz;
  // Entre bateaux d'un même camp, on se repousse sans dégâts (la formation ne s'abîme pas toute seule).
  if (!isHostile(a, b) || closing < RAM.minSpeed || a.ramCooldown > 0 || b.ramCooldown > 0) return;

  // Chacun encaisse selon la masse de l'autre.
  const base = ((closing - RAM.minSpeed) * RAM.damagePerSpeed) / RAM.referenceMass;
  const aRams = Math.sin(a.heading) * nx + Math.cos(a.heading) * nz > 0.5;
  const bRams = -(Math.sin(b.heading) * nx + Math.cos(b.heading) * nz) > 0.5;
  // (Un maître d'armes rend l'éperonnage de son navire plus meurtrier.)
  onRam(a, base * b.mass * factor(b.modifiers, 'ram') * (aRams ? RAM.bowFactor : 1), b);
  onRam(b, base * a.mass * factor(a.modifiers, 'ram') * (bRams ? RAM.bowFactor : 1), a);
  a.ramCooldown = b.ramCooldown = RAM.cooldown;
  // Vitesse perdue selon la part de masse de l'autre (à masses égales : RAM.speedKept chacun).
  const lost = 2 * (1 - RAM.speedKept);
  a.speed *= Math.max(0, 1 - lost * shareA);
  b.speed *= Math.max(0, 1 - lost * shareB);
  effects.impact(contact);
  sound.at('combat/ram_crash', contact, { ref: AUDIO.refs.hit });
}
