import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape } from '../parts/hullShape';

/** Longueur de la goélette de base (m) : les positions écrites en « z de base » s'y rapportent. */
export const SCHOONER_LENGTH = 15;
const BASE_HALF = SCHOONER_LENGTH / 2;

/** Gabarit de la coque (u) : longue, fine et basse sur l'eau, pont ras ; la tonture remonte vers l'étrave. */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.7, 1.55, -0.7],
  [-0.75, 0.88, 1.38, -1.05],
  [-0.4, 0.98, 1.3, -1.25],
  [0, 1, 1.28, -1.3],
  [0.35, 0.93, 1.33, -1.2],
  [0.62, 0.74, 1.42, -1],
  [0.82, 0.48, 1.56, -0.65],
  [0.95, 0.2, 1.7, -0.2],
  [1, 0.02, 1.78, 0.3],
];

// Hauteurs (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.85;
/** Inclinaison des mâts vers l'arrière (rad). */
export const RAKE = 0.08;
/** Hauteur des têtes de mât au-dessus du pont, le long du mât. */
export const FORE_MAST_LENGTH = 12;
export const MAIN_MAST_LENGTH = 12.8;

/** Point le long d'un mât incliné dont le pied est en `mastZ`, à `along` m de son pied. */
export function alongMast(mastZ: number, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, DECK_Y + along * Math.cos(RAKE), mastZ - along * Math.sin(RAKE));
}

/**
 * Plan d'une goélette, de base ou à hunier (coque rallongée). La coque s'étire tout entière ; `z(baseZ)` convertit une
 * position pensée pour la goélette de 15 m, et l'avant (beaupré, focs) glisse avec l'étrave.
 */
export interface SchoonerLayout {
  readonly length: number;
  readonly hull: HullShape;
  z(baseZ: number): number;
  readonly foreMastZ: number;
  readonly mainMastZ: number;
  readonly foreTop: THREE.Vector3;
  readonly mainTop: THREE.Vector3;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Focs : point d'amure, têtière et point d'écoute. */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3; bulge: number }[];
  /** Canons sur affût, répartis régulièrement le long du pont entre ces z. */
  readonly gunZone: { aft: number; fore: number };
  /** Pont de l'équipage animé : barreur à la barre franche, vigie à l'avant ; un matelot de plus par allongement. */
  readonly deck: DeckPlan;
}

function createLayout(level: number): SchoonerLayout {
  const added = (SHIP_TYPES.schooner.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const half = BASE_HALF + added / 2;
  const hull = new HullShape(HULL_ROWS, half, 1.9);
  const z = (baseZ: number) => (baseZ * half) / BASE_HALF;
  const bowShift = half - BASE_HALF;
  const at = (u: number) => hull.stationAt(u);
  const foreMastZ = at(0.3).z;
  const mainMastZ = at(-0.22).z;
  const bowsprit = { base: new THREE.Vector3(0, 1.5, 6.4 + bowShift), tip: new THREE.Vector3(0, 2.7, 11.6 + bowShift) };
  return {
    length: 2 * half,
    hull,
    z,
    foreMastZ,
    mainMastZ,
    foreTop: alongMast(foreMastZ, FORE_MAST_LENGTH),
    mainTop: alongMast(mainMastZ, MAIN_MAST_LENGTH),
    bowsprit,
    jibs: [
      { tack: bowsprit.tip, head: alongMast(foreMastZ, 11.2), clew: new THREE.Vector3(0, 2.5, 6.1 + bowShift), bulge: 0.5 },
      { tack: new THREE.Vector3(0, 1.95, 7.35 + bowShift), head: alongMast(foreMastZ, 8.6), clew: new THREE.Vector3(0, 2.1, foreMastZ + 1.45), bulge: 0.45 },
    ],
    gunZone: { aft: z(-5), fore: z(3.4) },
    deck: {
      hands: DECK_CREW.hands.schooner + DECK_CREW.handsPerExtension.schooner * level,
      helm: { x: 0.35, y: DECK_Y, z: at(-0.9).z, facing: 0 },
      lookout: { x: 0, y: DECK_Y, z: at(0.8).z, facing: 0 },
      walks: deckWalks(DECK_Y, [0.6, -0.6], z(-4.6), z(4.6)),
      ropes: ropeSpots(DECK_Y, [foreMastZ, mainMastZ], (zz) => hull.stationAt(zz / half).halfWidth),
      isOpenGun: () => true,
    },
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const schoonerLayout = (level: number): SchoonerLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
