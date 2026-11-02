import * as THREE from 'three';
import { lampsFor, potenceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, DECK_Y, RAKE, type CutterLayout } from './cutterLayout';

/** Rayon du mât à la hauteur de la potence (cutterTemplate : 0,19 m au pied), et longueur du bras de la potence (m). */
const MAST = { radius: 0.18, arm: 0.3 };

const cache = new Map<CutterLayout, readonly LampSpec[]>();

/**
 * Lampes du cotre en plus de son fanal de poupe (parts/shipLamps.ts) : une lanterne pendue à une potence sur l'avant du
 * mât, au-dessus des têtes (la bôme part vers l'arrière) ; armé : un lampadaire contre le pavois avant, à bâbord.
 */
export function cutterLamps(L: CutterLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const y = potenceHeight(DECK_Y);
  const front = alongMast(L.mastZ, (y - DECK_Y) / Math.cos(RAKE)).setY(y).add({ x: 0, y: 0, z: MAST.radius });
  const z = L.z(4);
  const fore = L.hull.stationAt(z / L.hull.halfLength);
  lamps = lampsFor('cutter', L.level, [
    { kind: 'hanging', at: front, facing: 0, arm: MAST.arm, drop: 0.1 },
    { kind: 'post', at: new THREE.Vector3(fore.halfWidth - 0.3, DECK_Y, z) },
  ]);
  cache.set(L, lamps);
  return lamps;
}
