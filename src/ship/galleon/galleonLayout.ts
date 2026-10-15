import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { LateenSailShape } from '../parts/sails';

/** Longueur du galion de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const GALLEON_LENGTH = 36;
const BASE_HALF = GALLEON_LENGTH / 2;
/** Milieu bas du navire (u de base), entre le demi-pont et le château avant : c'est lui qui s'étire. */
const WAIST = { from: -0.2, to: 0.58 };

/**
 * Gabarit de la coque (u de base) : haute, flancs qui rentrent nettement (les ponts sont bien plus étroits que la coque
 * à l'eau), tonture marquée (la coque remonte vers la poupe et vers l'avant). Château arrière à trois étages (demi-pont,
 * gaillard, dunette) jusqu'à une poupe très haute, arrondie vue de dessus, dont la quille remonte un peu au-dessus de
 * l'eau ; milieu bas ; château avant bas, en retrait de l'étrave : devant lui, un petit pont où s'appuie la poulaine.
 * Deux sections très proches font chaque marche.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.5, 13.1, 1.6],
  [-0.985, 0.6, 13.05, 0.8],
  [-0.96, 0.69, 13, -0.2],
  [-0.92, 0.77, 12.95, -0.8],
  [-0.86, 0.84, 12.85, -1.6],
  [-0.78, 0.9, 12.75, -2.2],
  [-0.704, 0.94, 12.6, -2.6],
  [-0.694, 0.94, 10.5, -2.65],
  [-0.58, 0.97, 10.45, -3],
  [-0.454, 0.985, 10.4, -3.3],
  [-0.444, 0.985, 8.5, -3.3],
  [-0.33, 0.995, 8.4, -3.5],
  [-0.232, 1, 8.35, -3.6],
  [-0.222, 1, 6.45, -3.6],
  [0, 1, 6, -3.8],
  [0.3, 0.99, 6.15, -3.7],
  [0.601, 0.94, 6.5, -3.3],
  [0.611, 0.935, 8.7, -3.25],
  [0.72, 0.86, 8.75, -2.8],
  [0.82, 0.74, 8.85, -2],
  [0.925, 0.5, 9, -0.6],
  [0.935, 0.48, 6.9, -0.4],
  [0.97, 0.33, 6.95, 0.3],
  [1, 0.15, 7, 1.2],
];
/** Maître-bau (demi-largeur, m), haut du bouchain (m) et rentrée des flancs, mesurée à une hauteur fixe. */
const HALF_WIDTH = 4.6;
const UPPER_BILGE = 1.4;
const TUMBLE = { fraction: 0.3, height: 7 };

// Hauteurs (identiques pour toutes les longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal (le milieu, à l'air libre) ; les deux batteries couvertes sont dessous. */
export const DECK_Y = 5.2;
/** Sabords des deux batteries (centre, au milieu du navire ; ils suivent la tonture). */
export const LOW_Y = 2.4;
export const HIGH_Y = 4.4;
/** Tonture des préceintes et des sabords (m) : `aft` × |u|^power vers la poupe, `fore` × u^power vers l'avant. */
const SHEER = { aft: 0.7, fore: 0.6, power: 1.6 };
/** Préceintes : sous la batterie basse, entre les batteries, et la haute (le bordé est peint au-dessus) ; part de la tonture suivie. */
export const WALES = [
  { y: 5.15, sheer: 2.3, height: 0.2 },
  { y: 3.35, sheer: 2, height: 0.2 },
  { y: 1.6, sheer: 1.6, height: 0.18 },
] as const;
/** Batteries (u de base) : sabords réguliers, 1 de plus par allongement, les 4 du milieu achetés d'abord. */
const LOW_SPAN = { from: -0.417, to: 0.583, slots: 7, perExtension: 1, first: 4 };
const HIGH_SPAN = { from: -0.333, to: 0.5, slots: 6, perExtension: 1, first: 4 };
/**
 * Pièces légères (second calibre, u de base), sur affût derrière les sabords du pavois, dans l'ordre d'achat : deux sur
 * le demi-pont et une sur le château avant, une autre sur le château avant (amélioration), puis deux sur le pont du
 * milieu à chaque allongement (entre les haubans du grand mât et les escaliers des châteaux). `deck` : le pont qui la porte.
 */
const PIECE_SLOTS = [
  { u: -0.283, deck: 'halfDeck' },
  { u: -0.383, deck: 'halfDeck' },
  { u: 0.75, deck: 'forecastle' },
  { u: 0.85, deck: 'forecastle' },
  { u: -0.1, deck: 'waist' },
  { u: 0.36, deck: 'waist' },
  { u: 0.25, deck: 'waist' },
  { u: 0.47, deck: 'waist' },
] as const;
/** Pièces légères montées par allongement. */
const PIECES_PER_EXTENSION = 2;
/** Fenêtres des flancs (u de base, hauteur) : chambres sous le gaillard et sous la dunette, étage bas du château avant. */
const WINDOWS: readonly (readonly [number, number])[] = [
  [-0.5, 8.7],
  [-0.58, 8.7],
  [-0.74, 10.7],
  [0.7, 6.8],
  [0.8, 6.8],
];
/**
 * Poulaine, en avant de l'étrave : sa plate-forme (hauteur sous le plat-bord de l'avant, avancée, demi-largeur à la
 * racine), l'éperon courbe qui la porte (il part de l'étrave à `cutwaterFoot` m et remonte jusqu'à la pointe) et le lion
 * de proue au bout (m).
 */
const BEAK = { below: 0.45, reach: 4.4, halfWidth: 1.05, cutwaterFoot: 1.6, tip: 0.85 };
/**
 * Beaupré : son pied sous le pont du château avant, juste devant le mât de misaine (il traverse le pont et repose sur la
 * lisse de l'avant), sa pointe, et le petit mât de contre-civadière dressé au bout (m).
 */
const BOWSPRIT = { heel: 0.6, heelBelow: 0.5, tipY: 14.2, tipZ: 27.2, topmast: 5 };

export interface Deck {
  y: number;
  /** Étendue, en u de la coque. */
  from: number;
  to: number;
}

export interface Mast {
  z: number;
  base: number;
  top: number;
  topPlatform: number;
}

/** Une voile carrée : z du mât qui la porte, hauteur de sa vergue, largeur, hauteur. */
export interface SquareSail {
  mastZ: number;
  yardY: number;
  width: number;
  height: number;
}

/** Une voile latine (artimon, contre-artimon) : son mât, la hauteur de son gréement sur le mât, sa forme. */
export interface Lateen {
  mast: Mast;
  yardY: number;
  sail: LateenSailShape;
}

/** Une pièce légère : position (u de la coque) et hauteur du pont qui la porte. */
export interface PieceSlot {
  u: number;
  y: number;
}

/**
 * Plan d'un galion, de base ou allongé. Les positions le long de la coque sont en u de la coque ; `base(u)` convertit
 * une position pensée pour le galion de base (le milieu s'étire, les châteaux glissent).
 */
export interface GalleonLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Station en u de la coque. */
  station(u: number): Station;
  /** Tonture (m) des sabords et des préceintes, en u de la coque. */
  sheer(u: number): number;
  /** Château arrière (demi-pont, gaillard, dunette, de bas en haut) et château avant. */
  readonly halfDeck: Deck;
  readonly quarterdeck: Deck;
  readonly poop: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  readonly bonaventureMast: Mast;
  /**
   * Voiles carrées : basse voile, hunier et perroquet de misaine et du grand mât, hunier d'artimon (au-dessus de sa
   * latine), contre-civadière (sur son petit mât au bout du beaupré). `mainCourse` : la grande voile, qui porte l'emblème.
   */
  readonly squareSails: readonly SquareSail[];
  readonly mainCourse: number;
  /** Artimon et contre-artimon, à voiles latines. */
  readonly lateens: readonly Lateen[];
  /** Beaupré (du pied à la pointe) et petit mât de contre-civadière dressé à sa pointe (jusqu'à sa tête). */
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3; topmast: THREE.Vector3 };
  readonly spritsail: { yard: THREE.Vector3; width: number; height: number };
  /**
   * Poulaine : hauteur de sa plate-forme, z de sa racine (l'étrave) et de sa pointe, demi-largeur à sa racine ; l'éperon
   * courbe qui la porte part de l'étrave à la hauteur `cutwaterFoot` ; le lion de proue se dresse en `figurehead`.
   */
  readonly beak: { y: number; rootZ: number; tipZ: number; halfWidth: number; cutwaterFoot: number; figurehead: THREE.Vector3 };
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords des batteries (u de la coque) : `…Ports` de l'arrière vers l'avant, `…Slots` dans l'ordre d'achat. */
  readonly lowPorts: readonly number[];
  readonly lowSlots: readonly number[];
  readonly highPorts: readonly number[];
  readonly highSlots: readonly number[];
  /** Pièces légères des châteaux et du pont, dans l'ordre d'achat. */
  readonly pieceSlots: readonly PieceSlot[];
  /** Fenêtres des flancs (u de la coque, hauteur), sur les deux bords. */
  readonly windows: readonly { u: number; y: number }[];
  readonly hatches: readonly { u: number; width: number; depth: number }[];
  /** Pont de l'équipage animé ; canons servis à découvert = les pièces légères (second calibre). */
  readonly deck: DeckPlan;
}

/** `count` positions régulières de `from` à `to`. */
const spread = (from: number, to: number, count: number) => Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));

function createLayout(level: number): GalleonLayout {
  const added = (SHIP_TYPES.galleon.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    HALF_WIDTH,
    UPPER_BILGE,
    TUMBLE.fraction,
    TUMBLE.height,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  // Chaque étage d'un château s'arrête à la section haute de sa marche (là où ses flancs ont toute leur hauteur).
  const halfDeck = { y: 7.6, from: base(-0.99), to: base(-0.232) };
  const quarterdeck = { y: 9.6, from: base(-0.99), to: base(-0.454) };
  const poop = { y: 11.6, from: base(-0.99), to: base(-0.704) };
  const forecastle = { y: 7.9, from: base(0.611), to: base(0.925) };
  const deckY = { halfDeck: halfDeck.y, forecastle: forecastle.y, waist: DECK_Y };
  const foreMast = { z: at(0.694).z, base: forecastle.y, top: 28.2, topPlatform: 18.8 };
  const mainMast = { z: at(0.167).z, base: DECK_Y, top: 33.5, topPlatform: 22.5 };
  const mizzenMast = { z: at(-0.5).z, base: quarterdeck.y, top: 26.4, topPlatform: 19.5 };
  const bonaventureMast = { z: at(-0.861).z, base: poop.y, top: 21, topPlatform: 18 };
  const stem = hull.stationAt(1);
  const bowTip = new THREE.Vector3(0, BOWSPRIT.tipY, BOWSPRIT.tipZ + bowShift);
  const bowsprit = { base: new THREE.Vector3(0, forecastle.y - BOWSPRIT.heelBelow, foreMast.z + BOWSPRIT.heel), tip: bowTip, topmast: bowTip.clone().setY(bowTip.y + BOWSPRIT.topmast) };
  const lowPorts = spread(base(LOW_SPAN.from), base(LOW_SPAN.to), LOW_SPAN.slots + LOW_SPAN.perExtension * level);
  const highPorts = spread(base(HIGH_SPAN.from), base(HIGH_SPAN.to), HIGH_SPAN.slots + HIGH_SPAN.perExtension * level);
  const wheel = { y: quarterdeck.y + 0.85, z: at(-0.64).z };
  const hdFront = hull.stationAt(halfDeck.to).z;
  const qdFront = hull.stationAt(quarterdeck.to).z;
  const fcBack = hull.stationAt(forecastle.from).z;
  const widthAt = (y: number) => (z: number) => hull.halfWidthAt(hull.stationAt(z / half), y);
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.galleon + DECK_CREW.handsPerExtension.galleon * level,
    helm: { x: 0, y: quarterdeck.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.86).z, facing: 0 },
    // Le milieu (entre les échelles des châteaux), et le demi-pont à découvert, devant le gaillard.
    walks: [...deckWalks(DECK_Y, [1.3, -1.3], hdFront + 2.6, fcBack - 4.2), ...deckWalks(halfDeck.y, [0.7], qdFront + 0.7, hdFront - 0.6)],
    ropes: [...ropeSpots(DECK_Y, [mainMast.z], widthAt(DECK_Y)), ...ropeSpots(forecastle.y, [foreMast.z], widthAt(forecastle.y))],
    isOpenGun: (mount) => mount.calibre === 'deck',
  };
  return {
    length: GALLEON_LENGTH + extra,
    hull,
    base,
    at,
    station: (u) => hull.stationAt(u),
    sheer: (u) => (u < 0 ? SHEER.aft : SHEER.fore) * Math.abs(u) ** SHEER.power,
    halfDeck,
    quarterdeck,
    poop,
    forecastle,
    foreMast,
    mainMast,
    mizzenMast,
    bonaventureMast,
    squareSails: [
      { mastZ: foreMast.z, yardY: 17.4, width: 11, height: 6.8 },
      { mastZ: foreMast.z, yardY: 24, width: 7, height: 4.6 },
      { mastZ: foreMast.z, yardY: 27.6, width: 4.4, height: 2.8 },
      { mastZ: mainMast.z, yardY: 21.2, width: 15.5, height: 10.4 },
      { mastZ: mainMast.z, yardY: 29.2, width: 9.6, height: 5.8 },
      { mastZ: mainMast.z, yardY: 32.8, width: 5.4, height: 3 },
      { mastZ: mizzenMast.z, yardY: 25.8, width: 7.2, height: 4.6 },
      { mastZ: bowTip.z, yardY: bowTip.y + BOWSPRIT.topmast - 0.3, width: 5.4, height: 3.4 },
    ],
    mainCourse: 3,
    lateens: [
      {
        mast: mizzenMast,
        yardY: 16,
        sail: { tack: new THREE.Vector3(0, -3.6, 5), peak: new THREE.Vector3(0, 7.6, -6.4), clew: new THREE.Vector3(0, -2.2, -4.8), bulge: 0.55 },
      },
      {
        mast: bonaventureMast,
        yardY: 15,
        // Le point d'écoute reste au-dessus de la dunette (pas de boute-hors).
        sail: { tack: new THREE.Vector3(0, -1.4, 3.4), peak: new THREE.Vector3(0, 5, -4), clew: new THREE.Vector3(0, -1, -2.2), bulge: 0.45 },
      },
    ],
    bowsprit,
    spritsail: { yard: bowsprit.base.clone().lerp(bowsprit.tip, 0.68).add(new THREE.Vector3(0, -0.15, 0)), width: 8, height: 3.7 },
    beak: {
      y: stem.gunwale - BEAK.below,
      rootZ: stem.z,
      tipZ: stem.z + BEAK.reach,
      halfWidth: BEAK.halfWidth,
      cutwaterFoot: BEAK.cutwaterFoot,
      figurehead: new THREE.Vector3(0, stem.gunwale - BEAK.below + BEAK.tip * 0.3, stem.z + BEAK.reach + BEAK.tip),
    },
    wheel,
    flag: { length: 2.4, height: 1.5, y: mainMast.top + 0.1 },
    lowPorts,
    lowSlots: purchaseOrder(lowPorts.length, LOW_SPAN.first).map((k) => lowPorts[k]),
    highPorts,
    highSlots: purchaseOrder(highPorts.length, HIGH_SPAN.first).map((k) => highPorts[k]),
    pieceSlots: PIECE_SLOTS.slice(0, 4 + PIECES_PER_EXTENSION * level).map((p) => ({ u: base(p.u), y: deckY[p.deck] })),
    windows: WINDOWS.map(([u, y]) => ({ u: base(u), y })),
    hatches: [
      { u: base(0.36), width: 1.7, depth: 1.8 },
      { u: base(-0.06), width: 1.6, depth: 1.6 },
    ],
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1, 2). */
const LAYOUTS = [0, 1, 2].map(createLayout);

export const galleonLayout = (level: number): GalleonLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) entre batterie basse, batterie haute et pièces légères, selon
 * l'ordre d'achat : 12 = 5 + 4 + 3 au départ, 13 = 6 + 4 + 3, 14 = 6 + 5 + 3, 15 = 6 + 5 + 4, 16 = 7 + 5 + 4,
 * 17 = 7 + 6 + 4 ; chaque allongement ouvre deux niveaux, chacun une pièce sur le pont et un canon de batterie (basse,
 * puis haute) : 19 = 8 + 6 + 5, 21 = 8 + 7 + 6 (grand galion), 23 = 9 + 7 + 7, 25 = 9 + 8 + 8 (galion amiral).
 */
const SPLITS: Readonly<Record<number, readonly [number, number, number]>> = {
  12: [5, 4, 3],
  13: [6, 4, 3],
  14: [6, 5, 3],
  15: [6, 5, 4],
  16: [7, 5, 4],
  17: [7, 6, 4],
  19: [8, 6, 5],
  21: [8, 7, 6],
  23: [9, 7, 7],
  25: [9, 8, 8],
};

export function galleonArmament(perSide: number, layout: GalleonLayout): { low: number; high: number; pieces: number } {
  const [low, high, pieces] = SPLITS[perSide] ?? [Math.ceil((perSide - 3) / 2), Math.floor((perSide - 3) / 2), 3];
  return {
    low: Math.min(low, layout.lowSlots.length),
    high: Math.min(high, layout.highSlots.length),
    pieces: Math.min(pieces, layout.pieceSlots.length),
  };
}
