import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { HullShape } from '../parts/hullShape';
import type { LateenSailShape } from '../parts/sails';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';

/** Longueur du modèle (m). */
export const CARAVEL_LENGTH = 13;
const HALF = CARAVEL_LENGTH / 2;

/**
 * Coque courte, large et haute (u de la coque) : plat-bord en paliers, très haut sur le château arrière, bas au milieu
 * (le pont principal), remontant sur le gaillard d'avant. Deux sections très proches font chaque marche presque
 * verticale ; le bas suit une quille profonde, sous un bouchain fixe.
 */
export const CARAVEL_HULL = new HullShape(
  [
    [-1, 0.74, 3.55, -0.9],
    [-0.8, 0.9, 3.45, -1.2],
    [-0.49, 0.99, 3.25, -1.4],
    [-0.45, 1, 1.85, -1.42],
    [0, 1, 1.75, -1.45],
    [0.34, 0.95, 1.85, -1.35],
    [0.38, 0.94, 2.65, -1.3],
    [0.7, 0.72, 2.75, -1],
    [0.9, 0.38, 2.85, -0.55],
    [1, 0.04, 2.95, 0],
  ],
  HALF,
  2.2,
  0.6,
  0.08,
);

const at = (u: number) => CARAVEL_HULL.stationAt(u);

// Hauteurs des ponts (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1;
/** Château arrière et gaillard d'avant (étendue en u de la coque). */
export const QUARTERDECK = { y: 2.6, from: -0.99, to: -0.47 };
export const FORECASTLE = { y: 2, from: 0.36, to: 0.95 };

/** Grand mât (voile carrée) et artimon (voile latine), posé sur le château arrière. */
export const MAIN_MAST = { z: at(0.04).z, top: 13.8, topPlatform: 11.6 };
export const MIZZEN_MAST = { z: at(-0.74).z, base: QUARTERDECK.y, top: 7.7 };

/** Grand-voile carrée : hauteur de sa vergue, largeur, hauteur. */
export const MAIN_COURSE = { yardY: 10.4, width: 7.4, height: 6.5 };
/** Voile latine d'artimon, dans le repère de son gréement (origine sur le mât, à `MIZZEN_YARD_Y`). */
export const MIZZEN_YARD_Y = 7;
export const MIZZEN_SAIL: LateenSailShape = {
  tack: new THREE.Vector3(0, -4, 3),
  peak: new THREE.Vector3(0, 4.5, -3.4),
  clew: new THREE.Vector3(0, -3.2, -1.6),
  bulge: 0.55,
};

/** Beaupré, et la civadière (petite voile carrée) pendue sous lui. */
export const BOWSPRIT = { base: new THREE.Vector3(0, 2.6, at(0.86).z), tip: new THREE.Vector3(0, 4.9, 10.2) };
export const SPRITSAIL = { yard: new THREE.Vector3(0, 4.3, 8.9), width: 3.6, height: 1.9 };

export const FLAG = { length: 1.5, height: 0.95, y: MAIN_MAST.top + 0.1 };

/** Canons de flanc : répartis régulièrement sur le pont principal découvert, entre ces u (de l'arrière vers l'avant). */
export const GUN_ZONE = { aft: -0.33, fore: 0.28 };
/**
 * Sabord de chasse, sous le gaillard d'avant, dans l'axe : un coffre posé sur l'étrave, ouverture `width` × `height`
 * dans un cadre de `frame`, face avant en `front` (z). Le fût du canon de chasse y pivote et en sort.
 */
export const CHASE_PORT = { y: 1.52, width: 0.5, height: 0.44, frame: 0.1, front: at(1).z + 0.1 };

/**
 * Pont de l'équipage animé : barreur et promenade sur le château arrière, vigie sur le gaillard d'avant, matelots sur
 * le pont principal ; canons servis à découvert = ceux du pont principal (pas le canon de chasse, sous le gaillard).
 */
export const CARAVEL_DECK: DeckPlan = {
  hands: DECK_CREW.hands.caravel,
  helm: { x: 0, y: QUARTERDECK.y, z: at(-0.88).z, facing: 0 },
  lookout: { x: 0, y: FORECASTLE.y, z: at(0.62).z, facing: 0 },
  walks: [...deckWalks(DECK_Y, [0.6, -0.6], at(QUARTERDECK.to).z + 1.6, at(FORECASTLE.from).z - 0.5), ...deckWalks(QUARTERDECK.y, [0.7], at(-0.9).z, at(QUARTERDECK.to).z - 0.4)],
  ropes: ropeSpots(DECK_Y, [MAIN_MAST.z], (z) => CARAVEL_HULL.stationAt(z / HALF).halfWidth),
  isOpenGun: (mount) => mount.calibre === 'main',
};
