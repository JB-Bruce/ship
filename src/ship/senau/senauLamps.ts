import * as THREE from 'three';
import { doorSconces, lampsFor, mastTopLamp, potenceHeight, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, DECK_Y, QUARTERDECK, RAKE, type SenauLayout, type SenauMast } from './senauLayout';

/** Hunes (senauTemplate : cylindre de 0,12 m centré en tête du bas mât, 0,8 m de rayon au-dessous). */
const TOP = { half: 0.06, rim: 0.8 };
/** Rayon de la misaine à la hauteur des potences (senauTemplate : 0,23 m au pied), bras d'une potence (m). */
const MAST = { fore: 0.22, arm: 0.4 };
/** Appliques de la cloison du gaillard d'arrière : écart à l'axe (de part et d'autre de la porte). */
const SCONCE_GAP = 0.75;

const cache = new Map<SenauLayout, readonly LampSpec[]>();

/**
 * Lampes du senau en plus de son fanal de poupe (parts/shipLamps.ts) : lanternes de hune des deux mâts, appliques de
 * part et d'autre de la porte du gaillard d'arrière, lanterne pendue à une potence sur l'arrière de la misaine ; grand
 * senau : une autre sur l'avant de la misaine.
 */
export function senauLamps(L: SenauLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const top = (mast: SenauMast) => {
    const t = alongMast(mast, mast.top);
    return mastTopLamp(t.z, t.y - TOP.half, TOP.rim);
  };
  const y = potenceHeight(DECK_Y);
  const axis = alongMast(L.foreMast, (y - DECK_Y) / Math.cos(RAKE)).z;
  lamps = lampsFor('senau', L.level, [
    top(L.mainMast),
    top(L.foreMast),
    ...doorSconces(L.bulkhead + 0.07, sconceHeight(DECK_Y, QUARTERDECK.y), SCONCE_GAP),
    { kind: 'hanging', at: new THREE.Vector3(0, y, axis - MAST.fore), facing: Math.PI, arm: MAST.arm, drop: 0.1 },
    { kind: 'hanging', at: new THREE.Vector3(0, y, axis + MAST.fore), facing: 0, arm: MAST.arm, drop: 0.1 },
  ]);
  cache.set(L, lamps);
  return lamps;
}
