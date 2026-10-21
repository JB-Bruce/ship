import * as THREE from 'three';
import { lampsFor, mastTopLamp, type LampSpec } from '../parts/shipLamps';
import { DECK_Y, type FrigateLayout } from './frigateLayout';

/** Demi-épaisseur des cloisons des châteaux (12 cm, centrées sur leur station) : les appliques se posent sur leur face. */
const BULKHEAD_FACE = 0.06;
/** Hune (frigateTemplate : cylindre de 0,12 m centré sur `topPlatform`, 0,85 m de rayon au-dessous). */
const TOP = { half: 0.06, rim: 0.85 };
/** Rayon du bas mât (frigateTemplate : 0,3 m au pied, 0,18 m en tête) à la hauteur d'une potence. */
const mastRadius = (mast: { base: number; top: number }, y: number) => 0.3 - 0.12 * ((y - mast.base) / (mast.top - mast.base));

const cache = new Map<FrigateLayout, readonly LampSpec[]>();

/**
 * Lampes de la frégate en plus des trois fanaux de poupe (parts/shipLamps.ts), dans l'ordre où elles s'ajoutent
 * (SHIP_LAMPS : 6, puis 2 de plus par allongement) : lanterne de hune du grand mât ; appliques de part et d'autre de
 * la porte du gaillard d'arrière ; lampadaire au bord du gaillard d'avant, entre ses deux escaliers ; lanternes pendues
 * à des potences de part et d'autre du grand mât, au-dessus des têtes ; allongée : appliques de la cloison de la
 * dunette ; grande frégate : lanternes pendues sous le rebord du gaillard d'arrière, au-dessus des coins du pont
 * (entre les escaliers et le bordé).
 */
export function frigateLamps(L: FrigateLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const castle = L.station(L.quarterdeck.to).z + BULKHEAD_FACE;
  const poop = L.station(L.poop.to).z + BULKHEAD_FACE;
  const forecastle = L.station(L.forecastle.from).z;
  const main = L.mainMast;
  const potence = DECK_Y + 2.5;
  const corner = L.width(L.quarterdeck.to, L.quarterdeck.y) - 0.85;
  const both = (make: (side: 1 | -1) => LampSpec) => [make(1), make(-1)];
  lamps = lampsFor('frigate', L.level, [
    mastTopLamp(main.z, main.topPlatform - TOP.half, TOP.rim),
    ...both((side) => ({ kind: 'wall', at: v(side * 0.68, DECK_Y + 1.75, castle), facing: 0, scale: 1.1 })),
    { kind: 'post', at: v(0, L.forecastle.y, forecastle + 0.35), height: 1.1, scale: 1.1 },
    ...both((side) => ({ kind: 'hanging', at: v(side * mastRadius(main, potence), potence, main.z), facing: (side * Math.PI) / 2, arm: 0.4, drop: 0.1 })),
    ...both((side) => ({ kind: 'wall', at: v(side * 0.7, L.quarterdeck.y + 1.47, poop), facing: 0 })),
    ...both((side) => ({ kind: 'hanging', at: v(side * corner, L.quarterdeck.y - 0.12, castle), facing: 0, arm: 0.4, drop: 0.06 })),
  ]);
  cache.set(L, lamps);
  return lamps;
}
