import { doorSconces, lampsFor, mastPotences, mastTopLamp, potenceHeight, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { DECK_Y, type ShipOfLineLayout } from './shipOfLineLayout';

/** Face des cloisons des châteaux (`bulkhead` : 14 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.07;
/**
 * Hunes plates (shipOfLineRig : 1,6 × la demi-largeur de profondeur, centrées 0,15 m derrière le mât) : recul de leur
 * centre et demi-profondeur, pour le grand mât et la misaine.
 */
const TOP = { back: 0.15, main: 0.8 * 1.35, fore: 0.8 * 1.1 };
/** Rayons des mâts à la hauteur des potences (shipOfLineRig : 0,42 et 0,32 m au pied). */
const RADIUS = { main: 0.41, fore: 0.31 };

const cache = new Map<ShipOfLineLayout, readonly LampSpec[]>();

/**
 * Lampes du vaisseau en plus de ses trois grands fanaux de poupe (parts/shipLamps.ts), dans l'ordre où elles s'ajoutent
 * (SHIP_LAMPS : 8, puis 2 de plus par allongement) : lanternes de hune du grand mât et de la misaine ; appliques de part
 * et d'autre des portes du gaillard d'arrière (face avant) et du gaillard d'avant (face arrière) ; potences de part et
 * d'autre du grand mât ; vaisseau de 74 : appliques de la cloison de la dunette ; de 80 : potences de la misaine.
 */
export function shipOfLineLamps(L: ShipOfLineLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const { quarterdeck, poop, forecastle } = L;
  const qd = L.station(quarterdeck.to).z + FACE;
  const fc = L.station(forecastle.from).z - FACE;
  const pp = L.station(poop.to).z + FACE;
  lamps = lampsFor('shipOfLine', L.level, [
    mastTopLamp(L.mainMast.z - TOP.back, L.mainMast.topPlatform, TOP.main),
    mastTopLamp(L.foreMast.z - TOP.back, L.foreMast.topPlatform, TOP.fore),
    ...doorSconces(qd, sconceHeight(DECK_Y, quarterdeck.y), 0.7, 0, 1.1),
    ...doorSconces(fc, sconceHeight(DECK_Y, forecastle.y), 0.7, Math.PI, 1.1),
    ...mastPotences(L.mainMast.z, potenceHeight(DECK_Y), RADIUS.main),
    ...doorSconces(pp, sconceHeight(quarterdeck.y, poop.y), 0.75, 0),
    ...mastPotences(L.foreMast.z, potenceHeight(forecastle.y), RADIUS.fore),
  ]);
  cache.set(L, lamps);
  return lamps;
}
