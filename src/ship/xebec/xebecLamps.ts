import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastTopLamp, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { alongMast, DECK_Y, POOP, xebecLayout, type XebecLayout } from './xebecLayout';

/** Face de la cloison de la dunette (12 cm d'épaisseur, centrée sur sa station). */
const FACE = 0.06;
/** Hune du grand mât (xebecTemplate : cylindre de 0,45 m centré sur la hune, 0,66 m de rayon au-dessous). */
const TOP = { half: 0.225, rim: 0.66 };
/** Lampadaire au bord avant de la dunette, au milieu (entre ses escaliers) : en retrait du bord (m), hauteur (m). */
const POOP_POST = { back: 0.4, height: 1 };

const cache = new Map<XebecLayout, readonly LampSpec[]>();

/**
 * Lampes du chébec en plus de son fanal de poupe (parts/shipLamps.ts) : lanterne de hune du grand mât (mât incliné :
 * la hune est prise le long du mât), appliques de part et d'autre de la porte de la dunette ; allongé : un lampadaire
 * au bord avant de la dunette.
 */
export function xebecLamps(L: XebecLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const hune = alongMast(L.mainMast.z, L.topPlatform);
  const front = L.at(POOP.to).z;
  lamps = lampsFor('xebec', layoutLevel(L, xebecLayout), [
    mastTopLamp(hune.z, hune.y - TOP.half, TOP.rim),
    ...doorSconces(front + FACE, sconceHeight(DECK_Y, POOP.y), 0.52),
    { kind: 'post', at: new THREE.Vector3(0, POOP.y, front - POOP_POST.back), height: POOP_POST.height },
  ]);
  cache.set(L, lamps);
  return lamps;
}
