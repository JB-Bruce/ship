import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastPotences, mastTopLamp, potenceHeight, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { carrackLayout, DECK_Y, type CarrackLayout } from './carrackLayout';

/** Face des cloisons des châteaux (`bulkhead` : 14 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.07;
/** Hunes rondes (carrackTemplate : paniers de 0,55 m posés sur `topPlatform`, rayon du bas : 0,7 × 1,15 et 0,7 × 0,9 m). */
const TOP = { main: 0.805, fore: 0.63 };
/** Rayon du grand mât à la hauteur des potences (carrackTemplate : 0,34 m au pied). */
const MAIN_RADIUS = 0.33;

const cache = new Map<CarrackLayout, readonly LampSpec[]>();

/**
 * Lampes de la caraque en plus de ses trois fanaux de poupe (parts/shipLamps.ts), dans l'ordre où elles s'ajoutent
 * (SHIP_LAMPS : 6, puis 2 de plus par allongement) : lanternes de hune du grand mât et de la misaine ; appliques de
 * part et d'autre des portes du demi-pont (face avant) et du château avant (face arrière) ; grande caraque : lanternes
 * pendues à des potences de part et d'autre du grand mât, au-dessus du pont du milieu ; caraque royale : appliques de
 * la cloison du gaillard d'arrière, de part et d'autre de sa porte (décalée à bâbord).
 */
export function carrackLamps(L: CarrackLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const { halfDeck, quarterdeck, forecastle } = L;
  const hd = L.station(halfDeck.to).z + FACE;
  const fc = L.station(forecastle.from).z - FACE;
  const qd = L.station(quarterdeck.to).z + FACE;
  const qdY = sconceHeight(halfDeck.y, quarterdeck.y);
  lamps = lampsFor('carrack', layoutLevel(L, carrackLayout), [
    mastTopLamp(L.mainMast.z, L.mainMast.topPlatform, TOP.main),
    mastTopLamp(L.foreMast.z, L.foreMast.topPlatform, TOP.fore),
    ...doorSconces(hd, sconceHeight(DECK_Y, halfDeck.y), 0.62),
    ...doorSconces(fc, sconceHeight(DECK_Y, forecastle.y), 0.6, Math.PI),
    ...mastPotences(L.mainMast.z, potenceHeight(DECK_Y), MAIN_RADIUS),
    { kind: 'wall', at: new THREE.Vector3(0.95, qdY, qd), facing: 0 },
    { kind: 'wall', at: new THREE.Vector3(-0.35, qdY, qd), facing: 0 },
  ]);
  cache.set(L, lamps);
  return lamps;
}
