import { lampsFor, layoutLevel, potenceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, DECK_Y, RAKE, schoonerLayout, type SchoonerLayout } from './schoonerLayout';

/** Rayon des mâts au pied (schoonerTemplate : 0,17 m au pied, 0,12 m en tête), et longueur du bras de la potence (m). */
const MAST = { radius: 0.17, arm: 0.3 };

const cache = new Map<SchoonerLayout, readonly LampSpec[]>();

/**
 * Lampes de la goélette en plus de son fanal de poupe (parts/shipLamps.ts) : une lanterne pendue à une potence sur
 * l'avant du grand mât, au-dessus des têtes (la bôme part vers l'arrière) ; à hunier : une autre sur l'avant de la
 * misaine.
 */
export function schoonerLamps(L: SchoonerLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const y = potenceHeight(DECK_Y);
  // Mât incliné vers l'arrière : son axe à la hauteur de la potence, et sa face avant.
  const front = (mastZ: number) => alongMast(mastZ, (y - DECK_Y) / Math.cos(RAKE)).setY(y).add({ x: 0, y: 0, z: MAST.radius });
  const potence = (mastZ: number): LampSpec => ({ kind: 'hanging', at: front(mastZ), facing: 0, arm: MAST.arm, drop: 0.1 });
  lamps = lampsFor('schooner', layoutLevel(L, schoonerLayout), [potence(L.mainMastZ), potence(L.foreMastZ)]);
  cache.set(L, lamps);
  return lamps;
}
