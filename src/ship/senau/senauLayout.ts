import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { GaffSailShape } from '../parts/sails';

/** Longueur du senau de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const SENAU_LENGTH = 24;
const BASE_HALF = SENAU_LENGTH / 2;
/** Milieu du pont (u de base) : c'est lui qui s'étire quand le senau est allongé. */
const WAIST = { from: -0.5, to: 0.35 };

/**
 * Gabarit de la coque (u de base) : plus haute que celle du brick, plat-bord en palier (petit gaillard d'arrière),
 * tonture douce qui se relève vers l'étrave, tableau arrière plat.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.74, 3.9, -0.7],
  [-0.85, 0.88, 3.85, -1.4],
  [-0.62, 0.97, 3.75, -1.75],
  [-0.58, 0.99, 2.9, -1.8],
  [0, 1, 2.85, -1.9],
  [0.4, 0.97, 2.92, -1.8],
  [0.7, 0.78, 3.05, -1.4],
  [0.88, 0.46, 3.2, -0.8],
  [1, 0.04, 3.4, 0],
];

// Hauteurs (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1.9;
/** Gaillard d'arrière (étendue en u de base). */
export const QUARTERDECK = { y: 2.9, from: -0.99, to: -0.6 };
/** Inclinaison des mâts vers l'arrière (rad). */
export const RAKE = 0.05;
/** Sabords : hauteur de leur centre, régulièrement répartis sur le pont (u de base), un de plus par allongement. */
export const PORT_Y = DECK_Y + 0.45;
const GUN_SPAN = { from: -0.5, to: 0.6, slots: 9, perExtension: 1, first: 4 };
/** Mât de senau : à cette distance (m) derrière le grand mât, jusque sous la hune. */
const SENAU_GAP = 0.75;

/** Un mât : pied (z, hauteur du pont où il est posé), longueur, hune (le long du mât), et ses voiles carrées. */
export interface SenauMast {
  z: number;
  base: number;
  length: number;
  top: number;
  /** Voiles carrées, de bas en haut : hauteur de la vergue le long du mât, largeur, hauteur. */
  sails: readonly { along: number; width: number; height: number }[];
}

/**
 * Plan d'un senau, de base ou grand (allongé). Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour le senau de base (le milieu s'étire, l'arrière et l'avant glissent).
 */
export interface SenauLayout {
  readonly level: number;
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  readonly foreMast: SenauMast;
  readonly mainMast: SenauMast;
  /** Mât de senau (sans voile carrée : `length` s'arrête sous la hune du grand mât). */
  readonly senauMast: SenauMast;
  /** Voile de senau (aurique), dans le repère de son gréement (sur le mât de senau, à `boomAlong` de son pied). */
  readonly spanker: GaffSailShape;
  readonly boomAlong: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Focs : point d'amure, têtière et point d'écoute (bas et en arrière de l'étai : des triangles assez larges). */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  /** Cloison du gaillard d'arrière (z de sa face avant). */
  readonly bulkhead: number;
  /** Chaloupe posée sur le pont, entre les mâts (z de son milieu). */
  readonly boatZ: number;
  readonly flag: { length: number; height: number };
  /** Sabords (z), et les mêmes dans l'ordre d'achat (d'abord le milieu). */
  readonly ports: readonly number[];
  readonly gunSlots: readonly number[];
  /** Pont de l'équipage animé ; tous les canons sont servis à découvert. */
  readonly deck: DeckPlan;
}

/** Point le long d'un mât incliné vers l'arrière (pied en `mast.z`, sur son pont), à `along` m de son pied. */
export function alongMast(mast: { z: number; base: number }, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, mast.base + along * Math.cos(RAKE), mast.z - along * Math.sin(RAKE));
}

function createLayout(level: number): SenauLayout {
  const added = (SHIP_TYPES.senau.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    3.3,
    1,
    0.05,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowZ = zOf(BASE_HALF);
  const foreMast: SenauMast = {
    z: at(0.42).z,
    base: DECK_Y,
    length: 19,
    top: 7.8,
    sails: [
      { along: 7.2, width: 9.4, height: 5.4 },
      { along: 11.6, width: 7.6, height: 4.2 },
      { along: 15, width: 5.9, height: 3.1 },
      { along: 17.6, width: 4.2, height: 2.1 },
    ],
  };
  const mainMast: SenauMast = {
    z: at(-0.18).z,
    base: DECK_Y,
    length: 20.4,
    top: 8.4,
    sails: [
      { along: 7.8, width: 10, height: 5.8 },
      { along: 12.4, width: 8, height: 4.4 },
      { along: 16, width: 6.2, height: 3.3 },
      { along: 18.8, width: 4.5, height: 2.3 },
    ],
  };
  const senauMast: SenauMast = { z: mainMast.z - SENAU_GAP, base: DECK_Y, length: mainMast.top - 0.2, top: mainMast.top - 0.2, sails: [] };
  const fore = (along: number) => alongMast(foreMast, along);
  const bowsprit = { base: new THREE.Vector3(0, 3.1, at(0.86).z), tip: new THREE.Vector3(0, 5.4, bowZ + 8) };
  const onSprit = (t: number) => bowsprit.base.clone().lerp(bowsprit.tip, t);
  const count = GUN_SPAN.slots + GUN_SPAN.perExtension * level;
  const [first, last] = [at(GUN_SPAN.from).z, at(GUN_SPAN.to).z];
  const ports = Array.from({ length: count }, (_, k) => first + ((last - first) * k) / (count - 1));
  const wheel = { y: QUARTERDECK.y + 0.9, z: at(-0.88).z + 0.55 };
  const bulkhead = at(QUARTERDECK.to).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.senau + DECK_CREW.handsPerExtension.senau * level,
    helm: { x: 0, y: QUARTERDECK.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: at(0.86).z, facing: 0 },
    walks: [...deckWalks(DECK_Y, [1, -1], bulkhead + 1.8, foreMast.z - 0.8), ...deckWalks(QUARTERDECK.y, [0.8], at(-0.92).z, bulkhead - 0.5)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: () => true,
  };
  return {
    level,
    length: SENAU_LENGTH + extra,
    hull,
    base,
    at,
    foreMast,
    mainMast,
    senauMast,
    // La bôme passe au-dessus du gaillard (assez haut pour le barreur) et déborde de la poupe.
    spanker: {
      tack: new THREE.Vector3(0, 0, -0.3),
      clew: new THREE.Vector3(0, 0, -(senauMast.z - at(-1).z) - 2),
      throat: new THREE.Vector3(0, senauMast.top - 3.2, -0.3),
      peak: new THREE.Vector3(0, senauMast.top - 0.5, -7),
      bulge: 0.7,
    },
    boomAlong: 3,
    bowsprit,
    jibs: [
      { tack: bowsprit.tip, head: fore(16.6), clew: new THREE.Vector3(0, 4.9, foreMast.z + 6.6) },
      { tack: onSprit(0.6), head: fore(13.6), clew: new THREE.Vector3(0, 4.4, foreMast.z + 4.6) },
      { tack: onSprit(0.25), head: fore(10.6), clew: new THREE.Vector3(0, 4, foreMast.z + 2.6) },
    ],
    wheel,
    bulkhead,
    boatZ: at(0.1).z,
    flag: { length: 1.9, height: 1.15 },
    ports,
    gunSlots: purchaseOrder(count, GUN_SPAN.first).map((k) => ports[k]),
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const senauLayout = (level: number): SenauLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
