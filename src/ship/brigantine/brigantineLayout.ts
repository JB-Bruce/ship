import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch } from '../parts/hullStretch';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';

/** Longueur du brigantin de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const BRIG_LENGTH = 16;
const BASE_HALF = BRIG_LENGTH / 2;
/** Pont principal découvert (u de base), entre le château et le gaillard d'avant : c'est lui qui s'étire quand le brigantin est allongé. */
const WAIST = { from: -0.4, to: 0.38 };

/**
 * Gabarit de la coque (u de base) : plat-bord en paliers, haut sur le château arrière, bas au milieu (le pont
 * principal), remontant sur le gaillard d'avant. Deux sections très proches font chaque marche presque verticale.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.78, 3.3, -0.8],
  [-0.8, 0.92, 3.15, -1.1],
  [-0.47, 1, 2.95, -1.3],
  [-0.43, 1, 1.75, -1.32],
  [0, 0.99, 1.6, -1.35],
  [0.4, 0.92, 1.7, -1.25],
  [0.44, 0.9, 2.35, -1.2],
  [0.75, 0.62, 2.45, -0.95],
  [0.92, 0.3, 2.6, -0.55],
  [1, 0.03, 2.7, 0],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1;
/** Grand-voile basse du grand mât (index dans squareSails) : la plus grande voile. */
export const MAIN_COURSE = 2;

/**
 * Emplacements des canons sur chaque bord (u de base), dans l'ordre où ils s'ajoutent : deux à l'abri dans le château
 * arrière, un devant (pont découvert), puis ceux du pont principal (achetables). Brigantin allongé : le pont principal
 * porte un canon de plus (ses canons et celui de l'avant sont répartis régulièrement), et un dernier s'abrite sous le
 * gaillard d'avant.
 */
const CASTLE_GUNS = [-0.82, -0.62];
const WAIST_GUNS = { from: -0.2, to: 0.34, standard: [-0.2, 0.06, 0.34] };
const FORECASTLE_GUN = 0.6;

export interface Deck {
  y: number;
  /** Étendue, en u de la coque. */
  from: number;
  to: number;
}

export interface Mast {
  z: number;
  top: number;
  topPlatform: number;
}

/**
 * Plan d'un brigantin, standard ou allongé. Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour le brigantin de base (le pont principal s'étire, le reste glisse).
 */
export interface BrigantineLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Station en u de la coque. */
  station(u: number): Station;
  readonly quarterdeck: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  /** Voiles carrées (z du mât qui les porte). */
  readonly squareSails: readonly { mastZ: number; yardY: number; width: number; height: number }[];
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Focs : point d'amure (sur le beaupré), têtière et point d'écoute. */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Emplacements des canons (u de la coque), dans l'ordre d'achat. */
  readonly gunSlots: readonly number[];
  /** Pont de l'équipage animé ; canons servis à découvert = ceux du pont principal (pas ceux des châteaux). */
  readonly deck: DeckPlan;
}

function createLayout(level: number): BrigantineLayout {
  const added = (SHIP_TYPES.brigantine.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    2.3,
    0.6,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  const quarterdeck = { y: 2.7, from: base(-0.99), to: base(-0.45) };
  const foreMast = { z: at(0.28).z, top: 15, topPlatform: 10 };
  const mainMast = { z: at(-0.22).z, top: 16, topPlatform: 10.8 };
  const bowsprit = { base: new THREE.Vector3(0, 2.5, 7.6 + bowShift), tip: new THREE.Vector3(0, 3.9, 12.3 + bowShift) };
  // Pont principal : ses canons (et celui de l'avant) répartis régulièrement ; un de plus quand il est allongé.
  const count = WAIST_GUNS.standard.length + level;
  const [first, last] = [base(WAIST_GUNS.from), base(WAIST_GUNS.to)];
  const waist = level > 0 ? Array.from({ length: count }, (_, k) => first + ((last - first) * k) / (count - 1)) : WAIST_GUNS.standard.map(base);
  // Ordre d'achat : château, avant (le dernier du pont), puis le pont d'arrière en avant, puis sous le gaillard d'avant.
  const gunSlots = [...CASTLE_GUNS.map(base), waist[waist.length - 1], ...waist.slice(0, -1), ...(level > 0 ? [base(FORECASTLE_GUN)] : [])];
  const forecastle = { y: 2, from: base(0.42), to: base(0.95) };
  const castle = hull.stationAt(quarterdeck.to).z;
  const fore = hull.stationAt(forecastle.from).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.brigantine + DECK_CREW.handsPerExtension.brigantine * level,
    helm: { x: 0, y: quarterdeck.y, z: at(-0.78).z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.7).z, facing: 0 },
    walks: [...deckWalks(DECK_Y, [0.55, -0.55], castle + 1.9, fore - 0.5), ...deckWalks(quarterdeck.y, [0.8], at(-0.92).z, castle - 0.4)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: (mount) => mount.object.position.z > castle && mount.object.position.z < fore,
  };
  return {
    length: BRIG_LENGTH + extra,
    hull,
    base,
    at,
    station: (u) => hull.stationAt(u),
    quarterdeck,
    forecastle,
    deck,
    foreMast,
    mainMast,
    squareSails: [
      { mastZ: foreMast.z, yardY: 8.6, width: 7, height: 5.2 },
      { mastZ: foreMast.z, yardY: 13.6, width: 5.2, height: 3.8 },
      { mastZ: mainMast.z, yardY: 9.4, width: 7.6, height: 5.6 },
      { mastZ: mainMast.z, yardY: 14.6, width: 5.6, height: 4 },
    ],
    bowsprit,
    jibs: [
      { tack: bowsprit.tip, head: new THREE.Vector3(0, 14.2, foreMast.z + 0.3), clew: new THREE.Vector3(0, 3.6, 7.2 + bowShift) },
      { tack: new THREE.Vector3(0, 3.2, 10 + bowShift), head: new THREE.Vector3(0, 11, foreMast.z + 0.25), clew: new THREE.Vector3(0, 3, 6.2 + bowShift) },
    ],
    wheel: { y: quarterdeck.y + 0.85, z: at(-0.78).z },
    flag: { length: 1.6, height: 1, y: mainMast.top + 0.1 },
    gunSlots,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const brigantineLayout = (level: number): BrigantineLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
