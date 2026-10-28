import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape } from '../parts/hullShape';

/** Longueur du cotre de base (m) : les positions écrites en « z de base » s'y rapportent. */
export const CUTTER_LENGTH = 11;
const BASE_HALF = CUTTER_LENGTH / 2;

/**
 * Gabarit de la coque (u) : fine, profonde et basse sur l'eau, pont ras ; étrave presque droite au pied profond (la
 * quille reste dans l'eau jusqu'à l'avant), tableau arrière assez large.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.64, 1.38, -0.7],
  [-0.75, 0.86, 1.26, -1.12],
  [-0.4, 0.98, 1.18, -1.32],
  [0, 1, 1.16, -1.38],
  [0.35, 0.95, 1.18, -1.32],
  [0.62, 0.78, 1.26, -1.18],
  [0.82, 0.52, 1.36, -0.98],
  [0.95, 0.22, 1.45, -0.74],
  [1, 0.02, 1.5, -0.55],
];

// Hauteurs (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.76;
/** Inclinaison du mât vers l'arrière (rad), légère. */
export const RAKE = 0.03;
/** Longueur du mât au-dessus du pont jusqu'à la tête du mât de flèche (m) : très haut pour la coque. */
export const MAST_LENGTH = 14.6;

/** Point le long du mât (pied en `mastZ`), à `along` m de son pied. */
export function alongMast(mastZ: number, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, DECK_Y + along * Math.cos(RAKE), mastZ - along * Math.sin(RAKE));
}

/** Une voile d'avant : point d'amure, têtière et point d'écoute (repère du navire), creux. */
export interface HeadSail {
  readonly tack: THREE.Vector3;
  readonly head: THREE.Vector3;
  readonly clew: THREE.Vector3;
  readonly bulge: number;
}

/**
 * Plan d'un cotre, de base ou armé (coque rallongée de 3 m). La coque s'étire tout entière ; `z(baseZ)` convertit une
 * position pensée pour le cotre de 11 m, et l'avant (beaupré, voiles d'avant) glisse avec l'étrave.
 */
export interface CutterLayout {
  readonly level: number;
  readonly length: number;
  readonly hull: HullShape;
  z(baseZ: number): number;
  readonly mastZ: number;
  readonly mastTop: THREE.Vector3;
  /** Beaupré : son pied sur le pont, contre les bittes, et son bout, très loin devant l'étrave. */
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Trinquette (sur l'étrave), foc (au milieu du beaupré), clin-foc (au bout). */
  readonly headsails: readonly HeadSail[];
  /** Canons sur affût, répartis régulièrement le long du pont entre ces z. */
  readonly gunZone: { aft: number; fore: number };
  /** Pierriers sur le plat-bord, près de la poupe (z). */
  readonly swivelZ: number;
  /** Pont de l'équipage animé : barreur à la barre franche, vigie à l'avant ; un matelot de plus allongé. */
  readonly deck: DeckPlan;
}

function createLayout(level: number): CutterLayout {
  const added = (SHIP_TYPES.cutter.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const half = BASE_HALF + added / 2;
  const hull = new HullShape(HULL_ROWS, half, 1.75);
  const z = (baseZ: number) => (baseZ * half) / BASE_HALF;
  const at = (u: number) => hull.stationAt(u);
  // Le mât est à 40 % de la longueur depuis l'étrave, plus en arrière que celui du sloop.
  const mastZ = at(0.2).z;
  const bow = at(1);
  const shift = half - BASE_HALF;
  const bowsprit = { base: new THREE.Vector3(0, DECK_Y + 0.2, at(0.72).z), tip: new THREE.Vector3(0, 1.85, BASE_HALF + 5.2 + shift) };
  const onSprit = (t: number) => bowsprit.base.clone().lerp(bowsprit.tip, t);
  return {
    level,
    length: 2 * half,
    hull,
    z,
    mastZ,
    mastTop: alongMast(mastZ, MAST_LENGTH),
    bowsprit,
    headsails: [
      { tack: new THREE.Vector3(0, bow.gunwale + 0.05, bow.z - 0.12), head: alongMast(mastZ, 8.6), clew: new THREE.Vector3(0, 2.35, mastZ + 1.1), bulge: 0.4 },
      { tack: onSprit(0.62), head: alongMast(mastZ, 10.9), clew: new THREE.Vector3(0, 2.75, bow.z - 0.6), bulge: 0.5 },
      { tack: bowsprit.tip, head: alongMast(mastZ, 12.9), clew: new THREE.Vector3(0, 3.6, bow.z + 1.6), bulge: 0.45 },
    ],
    gunZone: { aft: z(-3.3), fore: z(2.3) },
    swivelZ: z(-4.4),
    deck: {
      hands: DECK_CREW.hands.cutter + DECK_CREW.handsPerExtension.cutter * level,
      helm: { x: 0.35, y: DECK_Y, z: at(-0.9).z, facing: 0 },
      lookout: { x: 0, y: DECK_Y, z: at(0.82).z, facing: 0 },
      walks: deckWalks(DECK_Y, [0.55, -0.55], z(-3.8), z(3.4)),
      ropes: ropeSpots(DECK_Y, [mastZ], (zz) => hull.stationAt(zz / half).halfWidth, 0.45),
      isOpenGun: () => true,
    },
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const cutterLayout = (level: number): CutterLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
