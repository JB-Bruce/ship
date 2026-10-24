import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastTopLamp, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { DECK_Y, galleassLayout, type GalleassLayout } from './galleassLayout';

/** Face des cloisons des châteaux (`bulkhead` : 14 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.07;
/** Hunes en panier (galleassTemplate : 0,5 m posés sur `topPlatform`, rayon du bas : 0,7 × 0,75 et 0,7 × 0,6 m). */
const TOP = { main: 0.525, fore: 0.42 };
/**
 * Lampadaires aux coins des châteaux, côté pont du milieu : écart au bordé et au bord du château (m), hauteur du
 * poteau (m) ; entre le bordé et les échelles (LADDER_X), sur la balustrade du bord.
 */
const CORNER_POST = { side: 0.35, edge: 0.3, height: 0.9 };

const cache = new Map<GalleassLayout, readonly LampSpec[]>();

/**
 * Lampes de la galéasse en plus de ses trois fanaux de poupe (parts/shipLamps.ts), dans l'ordre où elles s'ajoutent
 * (SHIP_LAMPS : 6, puis 2 de plus par allongement) : lanternes de hune du grand mât et de la misaine ; appliques de part
 * et d'autre des portes du château de poupe (face avant) et du château avant (face arrière) ; allongée : lampadaires aux
 * coins arrière du château avant ; grande galéasse : lampadaires aux coins avant du château de poupe (le tendelet,
 * trop bas, ne porte pas de lanterne pendue). Les vergues latines pivotent : rien n'est accroché aux mâts.
 */
export function galleassLamps(L: GalleassLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const { sternDeck, forecastle, hull } = L;
  const stern = L.station(sternDeck.to);
  const fore = L.station(forecastle.from);
  const corners = (s: typeof stern, y: number, inward: number): LampSpec[] =>
    [1, -1].map((side) => ({
      kind: 'post',
      at: new THREE.Vector3(side * (hull.halfWidthAt(s, y) - CORNER_POST.side), y, s.z + inward * CORNER_POST.edge),
      height: CORNER_POST.height,
    }));
  lamps = lampsFor('galleass', layoutLevel(L, galleassLayout), [
    mastTopLamp(L.mainMast.z, L.mainMast.topPlatform, TOP.main),
    mastTopLamp(L.foreMast.z, L.foreMast.topPlatform, TOP.fore),
    ...doorSconces(stern.z + FACE, sconceHeight(DECK_Y, sternDeck.y), 0.65),
    ...doorSconces(fore.z - FACE, sconceHeight(DECK_Y, forecastle.y), 0.65, Math.PI),
    ...corners(fore, forecastle.y, 1),
    ...corners(stern, sternDeck.y, -1),
  ]);
  cache.set(L, lamps);
  return lamps;
}
