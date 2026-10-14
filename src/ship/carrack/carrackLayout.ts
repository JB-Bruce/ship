import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { LateenSailShape } from '../parts/sails';

/** Longueur de la caraque de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const CARRACK_LENGTH = 29;
const BASE_HALF = CARRACK_LENGTH / 2;
/** Milieu bas du navire (u de base), entre le demi-pont et le château avant : c'est lui qui s'étire. */
const WAIST = { from: -0.18, to: 0.5 };

/**
 * Gabarit de la coque (u de base) : large et haute. Château arrière à trois étages (demi-pont, gaillard, dunette),
 * milieu bas, château avant haut ; deux sections très proches font chaque marche. Le fond remonte aux deux bouts :
 * poupe ronde dessous, et le château avant déborde de l'étrave (la quille sort de l'eau sous lui).
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.62, 11.2, 4.4],
  [-0.95, 0.74, 11.1, 2.4],
  [-0.89, 0.83, 11, 0.4],
  [-0.82, 0.89, 10.9, -1],
  [-0.725, 0.93, 10.8, -1.9],
  [-0.715, 0.93, 9.2, -1.95],
  [-0.6, 0.96, 9.05, -2.4],
  [-0.49, 0.98, 8.9, -2.75],
  [-0.48, 0.98, 7, -2.8],
  [-0.35, 0.99, 6.9, -3.05],
  [-0.215, 0.995, 6.8, -3.2],
  [-0.205, 0.995, 4.4, -3.2],
  [0, 1, 4, -3.4],
  [0.25, 0.995, 4, -3.35],
  [0.45, 0.97, 4.3, -3.1],
  [0.545, 0.95, 4.5, -2.85],
  [0.555, 0.945, 8.7, -2.8],
  [0.7, 0.86, 8.7, -2.3],
  [0.82, 0.7, 8.72, -1.4],
  [0.9, 0.52, 8.74, -0.2],
  [0.96, 0.38, 8.76, 1.6],
  [1, 0.26, 8.8, 3.6],
];
/** Maître-bau (demi-largeur, m), haut du bouchain (m) et rentrée des flancs, mesurée à une hauteur fixe. */
const HALF_WIDTH = 4.4;
const UPPER_BILGE = 1.2;
const TUMBLE = { fraction: 0.22, height: 5 };

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal (le milieu, à l'air libre) ; la batterie basse est dessous, ses sabords 1,2 m plus bas. */
export const DECK_Y = 3.4;
export const BATTERY_Y = DECK_Y - 1.2;
/** Étage bas du château avant, couvert (ses pièces tirent par des sabords). */
export const FORE_LOWER_Y = 5.6;
/** Tonture des préceintes et des sabords de batterie (m) : `aft` × |u|^power vers la poupe, `fore` × u^power vers l'avant. */
const SHEER = { aft: 0.6, fore: 0.4, power: 1.6 };
/** Préceintes : hauteur au milieu, part de la tonture suivie (plus forte que celle des sabords), hauteur de la bande. */
export const WALES = [
  { y: BATTERY_Y + 0.65, sheer: 2.3, height: 0.2 },
  { y: BATTERY_Y - 0.58, sheer: 2, height: 0.18 },
  { y: 0.6, sheer: 1.5, height: 0.16 },
] as const;
/** Batterie basse (u de base) : 6 sabords réguliers par bord, 1 de plus sur la grande caraque ; les 4 du milieu d'abord. */
const BATTERY_SPAN = { from: -0.5, to: 0.51, slots: 6, perExtension: 1, first: 4 };
/**
 * Pièces des châteaux (u de base), dans l'ordre d'achat : demi-pont (à découvert), sous le gaillard d'arrière, étage bas
 * du château avant, sous la dunette, puis le haut du château avant (grande caraque, à découvert). `deck` : le pont qui
 * la porte ; `open` : sur affût derrière le pavois, servie par un canonnier (sinon un fût dans un sabord du château).
 */
const CASTLE_SLOTS = [
  { u: -0.33, deck: 'halfDeck', open: true },
  { u: -0.6, deck: 'halfDeck', open: false },
  { u: 0.7, deck: 'foreLower', open: false },
  { u: -0.85, deck: 'quarterdeck', open: false },
  { u: 0.86, deck: 'forecastle', open: true },
] as const;
/** Canons de chasse : sous le château avant, de part et d'autre de l'axe (écart, m), à cette hauteur. */
const CHASE = { x: 0.45, y: 6 };

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

/** Un canon d'un château : position (u de la coque), hauteur du pont qui le porte, à découvert ou dans un sabord. */
export interface CastleSlot {
  u: number;
  y: number;
  open: boolean;
}

/**
 * Plan d'une caraque, de base ou allongée. Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour la caraque de base (le milieu s'étire, les châteaux glissent).
 */
export interface CarrackLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Station en u de la coque. */
  station(u: number): Station;
  /** Tonture (m) des sabords de batterie, en u de la coque. */
  sheer(u: number): number;
  /** Demi-pont, gaillard d'arrière et dunette (château arrière, de bas en haut), haut du château avant. */
  readonly halfDeck: Deck;
  readonly quarterdeck: Deck;
  readonly poop: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  readonly bonaventureMast: Mast;
  /** Basse voile et hunier de misaine, basse voile, hunier et perroquet du grand mât. */
  readonly squareSails: readonly SquareSail[];
  /** Artimon et contre-artimon, à voiles latines. */
  readonly lateens: readonly Lateen[];
  /** Boute-hors de poupe, où s'amure l'écoute du contre-artimon. */
  readonly bumkin: { base: THREE.Vector3; tip: THREE.Vector3 };
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  readonly spritsail: { yard: THREE.Vector3; width: number; height: number };
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords de la batterie basse (u de la coque) : `batteryPorts` de l'arrière vers l'avant, `batterySlots` dans l'ordre d'achat. */
  readonly batteryPorts: readonly number[];
  readonly batterySlots: readonly number[];
  /** Pièces des châteaux, dans l'ordre d'achat. */
  readonly castleSlots: readonly CastleSlot[];
  /** Canons de chasse : écart à l'axe, hauteur, et z de la face avant du château avant. */
  readonly chase: { x: number; y: number; z: number };
  readonly hatches: readonly { u: number; width: number; depth: number }[];
  /** Pont de l'équipage animé ; canons servis à découvert = les pièces sur affût (`object.userData.openGun`). */
  readonly deck: DeckPlan;
}

function createLayout(level: number): CarrackLayout {
  const added = (SHIP_TYPES.carrack.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
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
  const halfDeck = { y: 5.9, from: base(-0.99), to: base(-0.205) };
  const quarterdeck = { y: 7.9, from: base(-0.99), to: base(-0.48) };
  const poop = { y: 9.9, from: base(-0.99), to: base(-0.715) };
  const forecastle = { y: 7.8, from: base(0.555), to: base(0.99) };
  const deckY = { halfDeck: halfDeck.y, quarterdeck: quarterdeck.y, foreLower: FORE_LOWER_Y, forecastle: forecastle.y };
  const foreMast = { z: at(0.655).z, base: forecastle.y, top: 20.5, topPlatform: 15 };
  const mainMast = { z: at(0.07).z, base: DECK_Y, top: 27, topPlatform: 19.6 };
  const mizzenMast = { z: at(-0.5).z, base: quarterdeck.y, top: 20.5, topPlatform: 17 };
  const bonaventureMast = { z: at(-0.83).z, base: poop.y, top: 16.8, topPlatform: 14.4 };
  const stern = hull.stationAt(-1);
  const bowsprit = { base: new THREE.Vector3(0, 8.4, at(0.85).z), tip: new THREE.Vector3(0, 12.4, 22 + bowShift) };
  const count = BATTERY_SPAN.slots + BATTERY_SPAN.perExtension * level;
  const [first, last] = [base(BATTERY_SPAN.from), base(BATTERY_SPAN.to)];
  const batteryPorts = Array.from({ length: count }, (_, k) => first + ((last - first) * k) / (count - 1));
  const wheel = { y: quarterdeck.y + 0.85, z: at(-0.66).z };
  const hdFront = hull.stationAt(halfDeck.to).z;
  const qdFront = hull.stationAt(quarterdeck.to).z;
  const fcFront = hull.stationAt(forecastle.from).z;
  const widthAt = (y: number) => (z: number) => hull.halfWidthAt(hull.stationAt(z / half), y);
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.carrack + DECK_CREW.handsPerExtension.carrack * level,
    helm: { x: 0, y: quarterdeck.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.82).z, facing: 0 },
    // Le milieu (entre les escaliers des châteaux), et le demi-pont à découvert, devant le gaillard d'arrière.
    walks: [...deckWalks(DECK_Y, [1.2, -1.2], hdFront + 2.6, fcFront - 4.2), ...deckWalks(halfDeck.y, [0.6], qdFront + 0.7, hdFront - 0.6)],
    ropes: [...ropeSpots(DECK_Y, [mainMast.z], widthAt(DECK_Y)), ...ropeSpots(forecastle.y, [foreMast.z], widthAt(forecastle.y))],
    isOpenGun: (mount) => mount.object.userData.openGun === true,
  };
  return {
    length: CARRACK_LENGTH + extra,
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
      { mastZ: foreMast.z, yardY: 13.4, width: 8.4, height: 4.4 },
      { mastZ: foreMast.z, yardY: 18.7, width: 5.4, height: 3.4 },
      { mastZ: mainMast.z, yardY: 16.6, width: 13, height: 7.8 },
      { mastZ: mainMast.z, yardY: 23, width: 8.2, height: 3.4 },
      { mastZ: mainMast.z, yardY: 26.2, width: 4.6, height: 2.6 },
    ],
    lateens: [
      {
        mast: mizzenMast,
        yardY: 14.4,
        sail: { tack: new THREE.Vector3(0, -3.2, 4), peak: new THREE.Vector3(0, 6, -5.2), clew: new THREE.Vector3(0, -1.8, -3), bulge: 0.55 },
      },
      {
        mast: bonaventureMast,
        yardY: 13.6,
        sail: { tack: new THREE.Vector3(0, -0.8, 1.2), peak: new THREE.Vector3(0, 3.4, -4.4), clew: new THREE.Vector3(0, -0.9, -4.2), bulge: 0.45 },
      },
    ],
    bumkin: { base: new THREE.Vector3(0, stern.gunwale - 0.4, stern.z + 0.6), tip: new THREE.Vector3(0, stern.gunwale - 0.1, stern.z - 2.3) },
    bowsprit,
    spritsail: { yard: bowsprit.base.clone().lerp(bowsprit.tip, 0.68).add(new THREE.Vector3(0, -0.15, 0)), width: 5.6, height: 3 },
    wheel,
    flag: { length: 2, height: 1.25, y: mainMast.top + 0.1 },
    batteryPorts,
    batterySlots: purchaseOrder(count, BATTERY_SPAN.first).map((k) => batteryPorts[k]),
    castleSlots: CASTLE_SLOTS.slice(0, 4 + level).map((c) => ({ u: base(c.u), y: deckY[c.deck], open: c.open })),
    chase: { x: CHASE.x, y: CHASE.y, z: hull.stationAt(1).z },
    hatches: [
      { u: base(0.3), width: 1.6, depth: 1.7 },
      { u: base(-0.12), width: 1.5, depth: 1.5 },
    ],
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const carrackLayout = (level: number): CarrackLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) entre la batterie basse et les pièces des châteaux, selon
 * l'ordre d'achat : 7 = 4 + 3 au départ, 8 = 5 + 3, 9 = 5 + 4, 10 = 6 + 4, 12 = 7 + 5 (grande caraque).
 */
const SPLITS: Readonly<Record<number, readonly [number, number]>> = { 7: [4, 3], 8: [5, 3], 9: [5, 4], 10: [6, 4], 12: [7, 5] };

export function carrackArmament(perSide: number, layout: CarrackLayout): { battery: number; castle: number } {
  const [battery, castle] = SPLITS[perSide] ?? [perSide - 3, 3];
  return { battery: Math.min(battery, layout.batterySlots.length), castle: Math.min(castle, layout.castleSlots.length) };
}
