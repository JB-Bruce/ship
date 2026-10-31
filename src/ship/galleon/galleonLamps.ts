import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastPotences, mastTopLamp, potenceHeight, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { DECK_Y, galleonLayout, type GalleonLayout } from './galleonLayout';

/** Face des cloisons des châteaux (`bulkhead` : 14 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.07;
/** Hunes rondes (galleonTemplate : paniers de 0,55 m posés sur `topPlatform`, rayon du bas : 0,7 × 1,25 et 0,7 × 0,95 m). */
const TOP = { main: 0.875, fore: 0.665 };
/** Rayon du grand mât à la hauteur des potences (galleonTemplate : 0,38 m au pied). */
const MAIN_RADIUS = 0.37;

const cache = new Map<GalleonLayout, readonly LampSpec[]>();

/**
 * Lampes du galion en plus de ses trois grands fanaux de poupe (parts/shipLamps.ts), dans l'ordre où elles s'ajoutent
 * (SHIP_LAMPS : 8, puis 2 de plus par allongement) : lanternes de hune du grand mât et de la misaine ; appliques de part
 * et d'autre des portes du demi-pont (face avant) et du château avant (face arrière) ; lanternes pendues à des potences
 * de part et d'autre du grand mât, au-dessus du pont du milieu ; allongé : appliques de la cloison du gaillard (sa porte
 * est décalée à bâbord) ; grand galion : appliques de la cloison de la dunette (porte décalée à tribord).
 */
export function galleonLamps(L: GalleonLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const { halfDeck, quarterdeck, poop, forecastle } = L;
  const hd = L.station(halfDeck.to).z + FACE;
  const fc = L.station(forecastle.from).z - FACE;
  const qd = L.station(quarterdeck.to).z + FACE;
  const pp = L.station(poop.to).z + FACE;
  const wall = (x: number, y: number, z: number): LampSpec => ({ kind: 'wall', at: new THREE.Vector3(x, y, z), facing: 0 });
  lamps = lampsFor('galleon', layoutLevel(L, galleonLayout), [
    mastTopLamp(L.mainMast.z, L.mainMast.topPlatform, TOP.main),
    mastTopLamp(L.foreMast.z, L.foreMast.topPlatform, TOP.fore),
    ...doorSconces(hd, sconceHeight(DECK_Y, halfDeck.y), 0.67, 0, 1.15),
    ...doorSconces(fc, sconceHeight(DECK_Y, forecastle.y), 0.64, Math.PI, 1.1),
    ...mastPotences(L.mainMast.z, potenceHeight(DECK_Y), MAIN_RADIUS),
    wall(1.05, sconceHeight(halfDeck.y, quarterdeck.y), qd),
    wall(-0.25, sconceHeight(halfDeck.y, quarterdeck.y), qd),
    wall(0.35, sconceHeight(quarterdeck.y, poop.y), pp),
    wall(-0.9, sconceHeight(quarterdeck.y, poop.y), pp),
  ]);
  cache.set(L, lamps);
  return lamps;
}
