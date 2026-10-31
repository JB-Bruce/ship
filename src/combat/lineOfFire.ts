import { LINE_OF_FIRE } from '../config';
import { isHostile, type Ship } from '../ship/ship';

/** Chaque coque est approchée par 3 cercles le long de la quille (fractions de la longueur), comme pour les chocs. */
const CIRCLES = [-1 / 3, 0, 1 / 3];

/**
 * Un navire du camp de `ship` (pas un adversaire) qui masque la ligne de tir de (fx, fz) à (tx, tz), ou null : sa coque
 * passe à moins de sa demi-largeur (+ LINE_OF_FIRE.margin) du trajet, entre la bouche et la cible. Les boulets
 * traversent les navires amis : ce n'est pas un risque de tir ami, mais un canon ne tire pas à travers un camarade.
 */
export function friendInLine(ship: Ship, fx: number, fz: number, tx: number, tz: number, ships: readonly Ship[]): Ship | null {
  const dx = tx - fx;
  const dz = tz - fz;
  const length2 = dx * dx + dz * dz;
  if (length2 < 1) return null;
  for (const other of ships) {
    if (other === ship || !other.alive || other.intangible || isHostile(ship, other)) continue;
    const r = other.stats.width / 2 + LINE_OF_FIRE.margin;
    // Loin du trajet : inutile de regarder sa quille.
    const reach = other.stats.length / 2 + r;
    const t0 = ((other.position.x - fx) * dx + (other.position.z - fz) * dz) / length2;
    if (t0 < -reach / Math.sqrt(length2) || t0 > 1 + reach / Math.sqrt(length2)) continue;
    for (const k of CIRCLES) {
      const cx = other.position.x + Math.sin(other.heading) * k * other.stats.length;
      const cz = other.position.z + Math.cos(other.heading) * k * other.stats.length;
      const t = ((cx - fx) * dx + (cz - fz) * dz) / length2;
      if (t <= 0 || t >= 1) continue;
      const px = fx + dx * t - cx;
      const pz = fz + dz * t - cz;
      if (px * px + pz * pz < r * r) return other;
    }
  }
  return null;
}
