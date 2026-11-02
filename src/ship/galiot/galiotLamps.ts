import * as THREE from 'three';
import { doorSconces, lampsFor, mastTopLamp, potenceHeight, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, DECK_Y, QUARTERDECK, RAKE, type GaliotLayout } from './galiotLayout';

/** Hune du grand mât (galiotTemplate : cylindre de 0,12 m centré en tête du bas mât, 0,8 m de rayon au-dessous). */
const TOP = { half: 0.06, rim: 0.8 };
/** Rayons des mâts à la hauteur des potences (galiotTemplate : 0,26 et 0,17 m au pied), bras d'une potence (m). */
const MAST = { main: 0.25, mizzen: 0.16, arm: 0.4 };
/** Appliques de la cloison du gaillard d'arrière : écart à l'axe (de part et d'autre de la porte). */
const SCONCE_GAP = 0.75;

const cache = new Map<GaliotLayout, readonly LampSpec[]>();

/**
 * Lampes de la galiote en plus de son fanal de poupe (parts/shipLamps.ts) : lanterne de hune du grand mât, appliques de
 * part et d'autre de la porte du gaillard d'arrière, lanterne pendue à une potence sur l'arrière du grand mât (l'avant
 * reste aux mortiers) ; grande galiote : une autre sur l'avant de l'artimon.
 */
export function galiotLamps(L: GaliotLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const top = alongMast(L.mainMast, L.mainMast.top);
  const axis = (mast: GaliotLayout['mainMast'], y: number) => alongMast(mast, (y - mast.base) / Math.cos(RAKE)).z;
  const mainY = potenceHeight(DECK_Y);
  const mizzenY = potenceHeight(QUARTERDECK.y);
  lamps = lampsFor('galiot', L.level, [
    mastTopLamp(top.z, top.y - TOP.half, TOP.rim),
    ...doorSconces(L.bulkhead + 0.07, sconceHeight(DECK_Y, QUARTERDECK.y), SCONCE_GAP),
    { kind: 'hanging', at: new THREE.Vector3(0, mainY, axis(L.mainMast, mainY) - MAST.main), facing: Math.PI, arm: MAST.arm, drop: 0.1 },
    { kind: 'hanging', at: new THREE.Vector3(0, mizzenY, axis(L.mizzen, mizzenY) + MAST.mizzen), facing: 0, arm: MAST.arm, drop: 0.1 },
  ]);
  cache.set(L, lamps);
  return lamps;
}
