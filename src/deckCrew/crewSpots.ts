import { DECK_CREW, DECK_NAV } from '../config';
import type { CannonMount } from '../ship/shipModel';
import type { DeckNav } from './deckNav';

/** Marque dans `avoid` les nœuds à moins de `r` m de chaque pièce (affût, culasse) : on les contourne en marchant. */
export function markGuns(nav: DeckNav, cannons: readonly CannonMount[], avoid: Uint8Array, r: number = DECK_CREW.walk.gunClearance) {
  avoid.fill(0);
  for (const mount of cannons) {
    const p = mount.object.position;
    for (let dz = -r; dz <= r; dz += DECK_NAV.cell) {
      for (let dx = -r; dx <= r; dx += DECK_NAV.cell) {
        if (dx * dx + dz * dz > r * r) continue;
        const n = nav.nodeAt(p.x + dx, p.z + dz, p.y, 1);
        if (n >= 0) avoid[n] = 1;
      }
    }
  }
}

/**
 * Le bord du pont (contre le pavois) le plus proche de (x, y, z) où se mettre à couvert, à moins de
 * DECK_CREW.walk.coverRange, hors des places `taken` ; -1 s'il n'y en a pas.
 */
export function coverNear(nav: DeckNav, x: number, y: number, z: number, taken: (node: number) => boolean): number {
  let best = -1;
  let bestD = DECK_CREW.walk.coverRange;
  for (const r of nav.rails) {
    const d = Math.hypot(nav.x(r.node) - x, nav.z(r.node) - z) + Math.abs(nav.y(r.node) - y) * 3;
    if (d < bestD && !taken(r.node)) {
      bestD = d;
      best = r.node;
    }
  }
  return best;
}
