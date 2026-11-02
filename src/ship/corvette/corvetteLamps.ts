import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastTopLamp, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { corvetteLayout, DECK_Y, type CorvetteLayout } from './corvetteLayout';

/** Face des cloisons (12 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.06;
/** Hunes (corvetteTemplate : cylindre de 0,1 m centré sur `topPlatform`, 0,7 m de rayon au-dessous). */
const TOP = { half: 0.05, rim: 0.7 };
/** Lampadaire du gaillard d'avant : en retrait de son bord arrière (m), hauteur du poteau (m). */
const FORE_POST = { back: 0.4, height: 1.1 };

const cache = new Map<CorvetteLayout, readonly LampSpec[]>();

/**
 * Lampes de la corvette en plus de son fanal de poupe (parts/shipLamps.ts) : lanterne de hune du grand mât, appliques
 * de part et d'autre de la porte du gaillard d'arrière, lampadaire au bord arrière du gaillard d'avant (entre ses
 * escaliers) ; allongée : lanterne de hune de la misaine.
 */
export function corvetteLamps(L: CorvetteLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const castle = L.station(L.quarterdeck.to).z + FACE;
  const fore = L.station(L.forecastle.from).z + FACE;
  lamps = lampsFor('corvette', layoutLevel(L, corvetteLayout), [
    mastTopLamp(L.mainMast.z, L.mainMast.topPlatform - TOP.half, TOP.rim),
    ...doorSconces(castle, sconceHeight(DECK_Y, L.quarterdeck.y), 0.5),
    { kind: 'post', at: new THREE.Vector3(0, L.forecastle.y, fore + FORE_POST.back), height: FORE_POST.height },
    mastTopLamp(L.foreMast.z, L.foreMast.topPlatform - TOP.half, TOP.rim),
  ]);
  cache.set(L, lamps);
  return lamps;
}
