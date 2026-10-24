import * as THREE from 'three';
import { lampsFor, layoutLevel, mastPotences, mastTopLamp, potenceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, brigLayout, DECK_Y, RAKE, type BrigLayout } from './brigLayout';

/** Hunes (brigTemplate : cylindre de 0,12 m centré en tête du bas mât, 0,75 m de rayon au-dessous). */
const TOP = { half: 0.06, rim: 0.75 };
/** Rayon des bas mâts à la hauteur des potences (brigTemplate : 0,22 et 0,24 m au pied), bras d'une potence (m). */
const MAST = { fore: 0.21, main: 0.23, arm: 0.4 };

const cache = new Map<BrigLayout, readonly LampSpec[]>();

/**
 * Lampes du brick en plus de son fanal de poupe (parts/shipLamps.ts) : lanternes de hune du grand mât et de la misaine,
 * lanternes pendues à des potences de part et d'autre du grand mât (au-dessus des têtes) ; allongé : une autre à
 * l'arrière de la misaine (le pont avant, où tourne le mortier, reste libre).
 */
export function brigLamps(L: BrigLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const y = potenceHeight(DECK_Y);
  // Mâts inclinés vers l'arrière : leur axe à la hauteur des potences, et leur hune en tête du bas mât.
  const axis = (mastZ: number) => alongMast(mastZ, (y - DECK_Y) / Math.cos(RAKE)).z;
  const top = (mast: { z: number; top: number }) => {
    const t = alongMast(mast.z, mast.top);
    return mastTopLamp(t.z, t.y - TOP.half, TOP.rim);
  };
  lamps = lampsFor('brig', layoutLevel(L, brigLayout), [
    top(L.mainMast),
    top(L.foreMast),
    ...mastPotences(axis(L.mainMast.z), y, MAST.main, MAST.arm),
    { kind: 'hanging', at: new THREE.Vector3(0, y, axis(L.foreMast.z) - MAST.fore), facing: Math.PI, arm: MAST.arm, drop: 0.1 },
  ]);
  cache.set(L, lamps);
  return lamps;
}
