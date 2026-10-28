import { FEEDBACK } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { COLORS, rand, reset } from './particleKit';
import type { ParticleSystem } from './particles';

/**
 * Un navire très abîmé (qui gîte, `Ship.listing`) laisse derrière lui des débris de bois et une écume sale posés sur
 * l'eau. `carry` : l'accumulateur d'émission du navire ; renvoie sa nouvelle valeur.
 */
export function emitDamageTrail(lit: ParticleSystem, dt: number, ship: Ship, waves: Waves, carry: number): number {
  if (!ship.alive || ship.listing < 0.05 || ship.far) return 0;
  carry += dt * FEEDBACK.list.debris * ship.listing;
  const fx = Math.sin(ship.heading);
  const fz = Math.cos(ship.heading);
  const half = ship.stats.length / 2;
  while (carry >= 1) {
    carry -= 1;
    // Le long du flanc, plutôt vers l'arrière.
    const along = rand(-half, half * 0.3);
    const side = (Math.random() < 0.5 ? 1 : -1) * (ship.stats.width / 2 + 0.3);
    const x = ship.position.x + fx * along + fz * side;
    const z = ship.position.z + fz * along - fx * side;
    const y = waves.heightAt(x, z);
    const wood = Math.random() < 0.55;
    const s = reset(x, y, z, wood ? COLORS.wood : COLORS.dust);
    Object.assign(s, wood
      ? { life: rand(3, 5), size: rand(0.15, 0.3), sizeEnd: 0.12, shapeX: 2.2, shapeY: 0.4, spin: rand(-0.3, 0.3), onWater: true, water: true }
      : { life: rand(2, 3.5), size: rand(0.4, 0.7), sizeEnd: 1.1, shapeY: 0.12, onWater: true, water: true });
    lit.spawn(s);
  }
  return carry;
}
