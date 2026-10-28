import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { GaffSailShape } from '../parts/sails';

/** Longueur de la galiote de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const GALIOT_LENGTH = 22;
const BASE_HALF = GALIOT_LENGTH / 2;
/** Milieu du pont (u de base) : c'est lui qui s'étire quand la galiote est allongée. */
const WAIST = { from: -0.45, to: 0.32 };

/**
 * Gabarit de la coque (u de base) : large et trapue, avant rond et plein (la quille remonte sous l'étrave), plat-bord
 * en palier : haut sur le gaillard d'arrière, bas sur le pont du milieu et de l'avant, où sont les mortiers.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.78, 4, -0.8],
  [-0.85, 0.9, 3.95, -1.5],
  [-0.56, 0.99, 3.85, -1.8],
  [-0.52, 1, 2.75, -1.85],
  [0, 1, 2.7, -1.9],
  [0.4, 0.98, 2.8, -1.8],
  [0.7, 0.86, 2.95, -1.5],
  [0.88, 0.62, 3.1, -1],
  [0.97, 0.32, 3.2, -0.4],
  [1, 0.05, 3.25, 0.2],
];

// Hauteurs (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1.8;
/** Gaillard d'arrière (étendue en u de base). */
export const QUARTERDECK = { y: 3, from: -0.99, to: -0.54 };
/** Inclinaison des mâts vers l'arrière (rad). */
export const RAKE = 0.03;
/** Sabords des canons de flanc : hauteur de leur centre, répartis sur le pont du milieu (u de base). */
export const PORT_Y = DECK_Y + 0.45;
const GUN_SPAN = { from: -0.44, to: 0.24, slots: 5, first: 2 };
/** Mortiers : la paire côte à côte sur l'avant, puis le troisième dans l'axe (grande galiote) ; rayon des plateformes. */
const MORTARS = { pair: { u: 0.52, x: 1.45 }, third: 0.25, platform: 0.85 };

/** Un mât : pied (z, hauteur du pont où il est posé), longueur, hune (le long du mât), et ses voiles carrées. */
export interface GaliotMast {
  z: number;
  base: number;
  length: number;
  top: number;
  /** Voiles carrées, de bas en haut : hauteur de la vergue le long du mât, largeur, hauteur. */
  sails: readonly { along: number; width: number; height: number }[];
}

/**
 * Plan d'une galiote, de base ou grande (allongée). Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour la galiote de base (le milieu s'étire, l'arrière et l'avant glissent).
 */
export interface GaliotLayout {
  readonly level: number;
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  readonly mainMast: GaliotMast;
  readonly mizzen: GaliotMast;
  /** Voile aurique d'artimon, dans le repère de son gréement (sur le mât, à `boomAlong` de son pied). */
  readonly spanker: GaffSailShape;
  readonly boomAlong: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /**
   * Trinquette, foc et clin-foc : point d'amure, têtière et point d'écoute. Le point d'écoute est bas et bien en arrière
   * de l'étai, pour des triangles assez larges (pas de longues voiles étroites).
   */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  /** Cloison du gaillard d'arrière (z de sa face avant). */
  readonly bulkhead: number;
  /** Places des mortiers (centre de leur plateforme sur le pont), dans l'ordre d'achat ; rayon des plateformes. */
  readonly mortars: readonly THREE.Vector3[];
  readonly platform: number;
  readonly flag: { length: number; height: number };
  /** Sabords (z), et les mêmes dans l'ordre d'achat (d'abord le milieu). */
  readonly ports: readonly number[];
  readonly gunSlots: readonly number[];
  /** Pont de l'équipage animé ; tous les canons sont servis à découvert. */
  readonly deck: DeckPlan;
}

/** Point le long d'un mât (pied en `mast.z`, sur son pont), à `along` m de son pied. */
export function alongMast(mast: { z: number; base: number }, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, mast.base + along * Math.cos(RAKE), mast.z - along * Math.sin(RAKE));
}

function createLayout(level: number): GaliotLayout {
  const added = (SHIP_TYPES.galiot.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    3.4,
    1,
    0.06,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowZ = zOf(BASE_HALF);
  const mainMast: GaliotMast = {
    z: at(0.04).z,
    base: DECK_Y,
    length: 19.5,
    top: 8.4,
    sails: [
      { along: 7.8, width: 11, height: 6 },
      { along: 12.6, width: 8.4, height: 4.4 },
      { along: 16.3, width: 5.8, height: 3 },
    ],
  };
  const mizzen: GaliotMast = { z: at(-0.72).z, base: QUARTERDECK.y, length: 12, top: 7.4, sails: [{ along: 10.6, width: 4.4, height: 2.6 }] };
  const main = (along: number) => alongMast(mainMast, along);
  const bowsprit = { base: new THREE.Vector3(0, DECK_Y + 0.6, at(0.84).z), tip: new THREE.Vector3(0, 5.2, bowZ + 7.5) };
  const onSprit = (t: number) => bowsprit.base.clone().lerp(bowsprit.tip, t);
  const stem = at(1);
  const [first, last] = [at(GUN_SPAN.from).z, at(GUN_SPAN.to).z];
  const ports = Array.from({ length: GUN_SPAN.slots }, (_, k) => first + ((last - first) * k) / (GUN_SPAN.slots - 1));
  const pair = at(MORTARS.pair.u).z;
  const mortars = [new THREE.Vector3(MORTARS.pair.x, DECK_Y, pair), new THREE.Vector3(-MORTARS.pair.x, DECK_Y, pair)];
  if (level > 0) mortars.push(new THREE.Vector3(0, DECK_Y, at(MORTARS.third).z));
  const wheel = { y: QUARTERDECK.y + 0.9, z: at(-0.88).z + 0.55 };
  const bulkhead = at(QUARTERDECK.to).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.galiot + DECK_CREW.handsPerExtension.galiot * level,
    helm: { x: 0, y: QUARTERDECK.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: at(0.82).z, facing: 0 },
    // Les promenades restent derrière le grand mât : l'avant est aux mortiers.
    walks: [...deckWalks(DECK_Y, [0.8, -0.8], bulkhead + 1.6, mainMast.z - 0.8), ...deckWalks(QUARTERDECK.y, [0.8], at(-0.92).z, bulkhead - 0.5)],
    ropes: ropeSpots(DECK_Y, [mainMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: () => true,
  };
  return {
    level,
    length: GALIOT_LENGTH + extra,
    hull,
    base,
    at,
    mainMast,
    mizzen,
    // La bôme d'artimon déborde de la poupe.
    spanker: {
      tack: new THREE.Vector3(0, 0, -0.3),
      clew: new THREE.Vector3(0, 0, -(mizzen.z - at(-1).z) - 1.6),
      throat: new THREE.Vector3(0, 5, -0.3),
      peak: new THREE.Vector3(0, 6.8, -4.2),
      bulge: 0.6,
    },
    boomAlong: 2.1,
    bowsprit,
    jibs: [
      { tack: new THREE.Vector3(0, stem.gunwale + 0.1, stem.z - 0.2), head: main(10.5), clew: new THREE.Vector3(0, 4.2, mainMast.z + 3.6) },
      { tack: onSprit(0.55), head: main(12.2), clew: new THREE.Vector3(0, 4.5, mainMast.z + 5.6) },
      { tack: bowsprit.tip, head: main(15.6), clew: new THREE.Vector3(0, 5.1, mainMast.z + 8.6) },
    ],
    wheel,
    bulkhead,
    mortars,
    platform: MORTARS.platform,
    flag: { length: 1.9, height: 1.15 },
    ports,
    gunSlots: purchaseOrder(GUN_SPAN.slots, GUN_SPAN.first).map((k) => ports[k]),
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const galiotLayout = (level: number): GaliotLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
