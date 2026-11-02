import * as THREE from 'three';
import { doorSconces, lampsFor, layoutLevel, mastTopLamp, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { brigantineLayout, DECK_Y, type BrigantineLayout } from './brigantineLayout';

/** Face des cloisons (12 cm d'épaisseur, centrées sur leur station). */
const FACE = 0.06;
/** Hunes (brigantineTemplate : cylindre de 0,1 m centré sur `topPlatform`, 0,6 m de rayon au-dessous). */
const TOP = { half: 0.05, rim: 0.6 };
/** Lampadaire du gaillard d'avant : en retrait de son bord arrière (m), hauteur du poteau (m). */
const FORE_POST = { back: 0.4, height: 1 };

const cache = new Map<BrigantineLayout, readonly LampSpec[]>();

/**
 * Lampes du brigantin en plus de son grand fanal de poupe (parts/shipLamps.ts) : lanterne de hune du grand mât,
 * appliques de part et d'autre de la porte du château arrière (entre la porte et ses fenêtres) ; allongé : un
 * lampadaire au bord arrière du gaillard d'avant, entre ses escaliers.
 */
export function brigantineLamps(L: BrigantineLayout): readonly LampSpec[] {
  let lamps = cache.get(L);
  if (lamps) return lamps;
  const castle = L.station(L.quarterdeck.to).z + FACE;
  const fore = L.station(L.forecastle.from).z + FACE;
  lamps = lampsFor('brigantine', layoutLevel(L, brigantineLayout), [
    mastTopLamp(L.mainMast.z, L.mainMast.topPlatform - TOP.half, TOP.rim),
    ...doorSconces(castle, sconceHeight(DECK_Y, L.quarterdeck.y), 0.46),
    { kind: 'post', at: new THREE.Vector3(0, L.forecastle.y, fore + FORE_POST.back), height: FORE_POST.height },
  ]);
  cache.set(L, lamps);
  return lamps;
}
