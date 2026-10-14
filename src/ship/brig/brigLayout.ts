import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { GaffSailShape } from '../parts/sails';

/** Longueur du brick de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const BRIG_LENGTH = 20;
const BASE_HALF = BRIG_LENGTH / 2;
/** Milieu du pont (u de base) : c'est lui qui s'étire quand le brick est allongé. */
const WAIST = { from: -0.5, to: 0.3 };

/**
 * Gabarit de la coque (u de base) : pont ras, sans château ni gaillard ; une tonture douce qui se relève un peu vers
 * l'étrave, tableau arrière plat.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.7, 2.75, -0.6],
  [-0.85, 0.86, 2.62, -1.2],
  [-0.5, 0.98, 2.52, -1.6],
  [0, 1, 2.48, -1.7],
  [0.4, 0.97, 2.55, -1.6],
  [0.7, 0.75, 2.7, -1.2],
  [0.88, 0.42, 2.82, -0.7],
  [1, 0.03, 2.95, 0],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1.5;
/** Inclinaison des mâts vers l'arrière (rad). */
export const RAKE = 0.05;
/** Bande peinte le long des sabords (hauteurs, m) : les sabords noirs y font un damier. */
export const BAND = { from: DECK_Y + 0.1, to: DECK_Y + 0.78 };
/** Sabords : hauteur de leur centre, régulièrement répartis sur le pont (u de base), 2 de plus par allongement. */
export const PORT_Y = DECK_Y + 0.42;
const GUN_SPAN = { from: -0.66, to: 0.6, slots: 9, perExtension: 2, first: 6 };
/** Filets de bastingage (hamacs roulés sur le plat-bord), de l'arrière à l'avant (u de base). */
export const NETTING = { from: -0.82, to: 0.78, height: 0.32 };

/** Un mât incliné vers l'arrière : pied, longueur, hune (le long du mât), et ses quatre voiles carrées. */
export interface BrigMast {
  z: number;
  length: number;
  top: number;
  /** Voiles carrées, de bas en haut : hauteur de la vergue le long du mât, largeur, hauteur. */
  sails: readonly { along: number; width: number; height: number }[];
}

/**
 * Plan d'un brick, de base ou allongé. Les positions le long de la coque sont en u de la coque ; `base(u)` convertit
 * une position pensée pour le brick de base (le milieu s'étire, l'arrière et l'avant glissent).
 */
export interface BrigLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  readonly foreMast: BrigMast;
  readonly mainMast: BrigMast;
  /** Grande brigantine du grand mât, dans le repère de son gréement (sur le mât, à la hauteur `boomAlong` de la bôme). */
  readonly spanker: GaffSailShape;
  readonly boomAlong: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Focs : point d'amure, têtière et point d'écoute. */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number };
  /** Sabords (z), tous percés dans la bande ; `gunSlots` = les mêmes dans l'ordre d'achat. */
  readonly ports: readonly number[];
  readonly gunSlots: readonly number[];
  /** Pont de l'équipage animé ; tous les canons sont servis à découvert. */
  readonly deck: DeckPlan;
}

/** Point le long d'un mât incliné vers l'arrière dont le pied est en `mastZ`, à `along` m de son pied. */
export function alongMast(mastZ: number, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, DECK_Y + along * Math.cos(RAKE), mastZ - along * Math.sin(RAKE));
}

function createLayout(level: number): BrigLayout {
  const added = (SHIP_TYPES.brig.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    2.7,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  const foreMast: BrigMast = {
    z: at(0.38).z,
    length: 17.7,
    top: 7.4,
    sails: [
      { along: 6.7, width: 8.6, height: 5 },
      { along: 10.9, width: 7, height: 3.9 },
      { along: 14.1, width: 5.4, height: 2.9 },
      { along: 16.5, width: 3.9, height: 2 },
    ],
  };
  const mainMast: BrigMast = {
    z: at(-0.22).z,
    length: 18.9,
    top: 7.9,
    sails: [
      { along: 7.3, width: 9.2, height: 5.4 },
      { along: 11.7, width: 7.4, height: 4.1 },
      { along: 15.1, width: 5.8, height: 3.1 },
      { along: 17.7, width: 4.2, height: 2.2 },
    ],
  };
  const fore = (along: number) => alongMast(foreMast.z, along);
  const bowsprit = { base: new THREE.Vector3(0, 2.6, 8.6 + bowShift), tip: new THREE.Vector3(0, 4.7, 16 + bowShift) };
  const count = GUN_SPAN.slots + GUN_SPAN.perExtension * level;
  const [first, last] = [at(GUN_SPAN.from).z, at(GUN_SPAN.to).z];
  const ports = Array.from({ length: count }, (_, k) => first + ((last - first) * k) / (count - 1));
  const wheel = { y: DECK_Y + 0.9, z: at(-0.86).z + 0.55 };
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.brig + DECK_CREW.handsPerExtension.brig * level,
    helm: { x: 0, y: DECK_Y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: at(0.8).z, facing: 0 },
    walks: deckWalks(DECK_Y, [0.7, -0.7], at(-0.72).z, at(0.7).z),
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: () => true,
  };
  return {
    length: BRIG_LENGTH + extra,
    hull,
    base,
    at,
    foreMast,
    mainMast,
    // La bôme déborde de la poupe d'environ 2,5 m.
    spanker: {
      tack: new THREE.Vector3(0, 0, -0.3),
      clew: new THREE.Vector3(0, 0, -(mainMast.z - at(-1).z) - 2.4),
      throat: new THREE.Vector3(0, 6.8, -0.3),
      peak: new THREE.Vector3(0, 9.6, -7.2),
      bulge: 0.7,
    },
    boomAlong: 3,
    bowsprit,
    jibs: [
      { tack: bowsprit.tip, head: fore(16), clew: new THREE.Vector3(0, 4.4, 9.8 + bowShift) },
      { tack: new THREE.Vector3(0, 4, 13.8 + bowShift), head: fore(13.2), clew: new THREE.Vector3(0, 3.8, 8.6 + bowShift) },
      { tack: new THREE.Vector3(0, 3.2, 11 + bowShift), head: fore(10.2), clew: new THREE.Vector3(0, 3.4, 6.6 + bowShift) },
    ],
    wheel,
    flag: { length: 1.8, height: 1.1 },
    ports,
    gunSlots: purchaseOrder(count, GUN_SPAN.first).map((k) => ports[k]),
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const brigLayout = (level: number): BrigLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
