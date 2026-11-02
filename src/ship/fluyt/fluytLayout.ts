import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { LateenSailShape } from '../parts/sails';

/** Longueur de la flûte de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const FLUYT_LENGTH = 24;
const BASE_HALF = FLUYT_LENGTH / 2;
/** Milieu du pont (u de base), entre le gaillard d'arrière et le gaillard d'avant : c'est lui qui s'étire. */
const WAIST = { from: -0.3, to: 0.4 };

/**
 * Gabarit de la coque (u de base) : ventrue, haute sur l'eau, en banane. Le plat-bord se relève fort vers la poupe
 * (gaillard d'arrière, puis dunette) et un peu vers l'avant (gaillard) ; deux sections très proches font chaque marche.
 * Le fond remonte aux deux bouts : voûte arrondie sous la poupe (la quille sort de l'eau), avant arrondi. La poupe est
 * étroite en haut (les flancs rentrent de plus en plus avec la hauteur, voir TUMBLE).
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.8, 6.9, 2.6],
  [-0.96, 0.84, 6.75, 1.6],
  [-0.91, 0.88, 6.55, 0.2],
  [-0.86, 0.91, 6.4, -0.9],
  [-0.825, 0.92, 6.3, -1.4],
  [-0.815, 0.92, 5.6, -1.5],
  [-0.7, 0.95, 5.4, -2],
  [-0.55, 0.98, 5.2, -2.3],
  [-0.385, 0.995, 5, -2.45],
  [-0.37, 0.995, 4, -2.45],
  [-0.2, 1, 3.6, -2.5],
  [0.05, 1, 3.4, -2.55],
  [0.3, 0.995, 3.5, -2.5],
  [0.5, 0.96, 3.75, -2.35],
  [0.695, 0.89, 4.05, -2.1],
  [0.71, 0.88, 4.8, -2.05],
  [0.82, 0.75, 5, -1.6],
  [0.92, 0.5, 5.2, -0.5],
  [1, 0.12, 5.4, 1],
];
/** Maître-bau (demi-largeur, m), haut du bouchain (m) et rentrée des flancs : forte, mesurée à une hauteur fixe. */
const HALF_WIDTH = 3.4;
const UPPER_BILGE = 0.8;
const TUMBLE = { fraction: 0.46, height: 3.5 };

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal, à l'air libre au milieu ; la batterie couverte est dessous, ses sabords 1,05 m plus bas. */
export const DECK_Y = 2.85;
export const BATTERY_Y = DECK_Y - 1.05;
/**
 * Tonture des préceintes et des sabords de batterie : ils remontent de `aft` × |u|^power vers la poupe et de
 * `fore` × u^power vers l'étrave (m, u de la coque), comme le pont qu'ils suivent : la « banane » de la flûte.
 */
const SHEER = { aft: 2.3, fore: 1, power: 1.6 };
/** Préceintes (bandes aux couleurs du camp) : hauteur au milieu, part de la tonture suivie, hauteur de la bande. */
export const WALES = [
  { y: BATTERY_Y + 0.45, sheer: 1, height: 0.2 },
  { y: BATTERY_Y - 0.42, sheer: 0.85, height: 0.18 },
  { y: 0.75, sheer: 0.6, height: 0.14 },
] as const;
/** Batterie couverte (u de base) : 6 sabords réguliers par bord, 1 de plus sur la flûte allongée ; les 4 du milieu d'abord. */
const BATTERY_SPAN = { from: -0.45, to: 0.47, slots: 6, perExtension: 1, first: 4 };
/** Canons légers des gaillards (u de base), dans l'ordre d'achat : deux sur le gaillard d'arrière, puis un sur celui d'avant (allongée). */
const DECK_SLOTS = [-0.5, -0.68, 0.79];

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

/**
 * Plan d'une flûte, de base ou allongée. Les positions le long de la coque sont en u de la coque ; `base(u)` convertit
 * une position pensée pour la flûte de base (le milieu s'étire, les gaillards glissent).
 */
export interface FluytLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Station en u de la coque. */
  station(u: number): Station;
  /** Tonture (m) des préceintes et des sabords de batterie, en u de la coque. */
  sheer(u: number): number;
  readonly quarterdeck: Deck;
  /** Dunette : la chambre du capitaine, à l'arrière du gaillard d'arrière, plus haute encore. */
  readonly poop: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  /** Basse voile, hunier et perroquet de la misaine et du grand mât, puis le perroquet de fougue (artimon). */
  readonly squareSails: readonly SquareSail[];
  /** Voile latine d'artimon, dans le repère de son gréement (origine sur le mât, à `mizzenYardY`). */
  readonly mizzenSail: LateenSailShape;
  readonly mizzenYardY: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Civadière pendue sous le beaupré : milieu de sa vergue, largeur, hauteur. */
  readonly spritsail: { yard: THREE.Vector3; width: number; height: number };
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords de la batterie couverte (u de la coque) : `batteryPorts` de l'arrière vers l'avant, `batterySlots` dans l'ordre d'achat. */
  readonly batteryPorts: readonly number[];
  readonly batterySlots: readonly number[];
  /** Canons légers des gaillards (u de la coque, et hauteur du pont qui les porte), dans l'ordre d'achat. */
  readonly deckSlots: readonly { u: number; y: number }[];
  /** Grandes écoutilles de la cale, sur le pont principal. */
  readonly hatches: readonly { u: number; width: number; depth: number }[];
  /** Pont de l'équipage animé ; canons servis à découvert = ceux des gaillards (la batterie est couverte). */
  readonly deck: DeckPlan;
}

function createLayout(level: number): FluytLayout {
  const added = (SHIP_TYPES.fluyt.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
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
  const quarterdeck = { y: 4.3, from: base(-0.82), to: base(-0.38) };
  const poop = { y: 5.5, from: base(-0.99), to: base(-0.82) };
  const forecastle = { y: 3.95, from: base(0.705), to: base(0.97) };
  const foreMast = { z: at(0.585).z, base: DECK_Y, top: 17.4, topPlatform: 10.6 };
  const mainMast = { z: at(0).z, base: DECK_Y, top: 19.8, topPlatform: 11.6 };
  const mizzenMast = { z: at(-0.63).z, base: quarterdeck.y, top: 15.2, topPlatform: 10.8 };
  const bowsprit = { base: new THREE.Vector3(0, 4.6, 10.6 + bowShift), tip: new THREE.Vector3(0, 8.4, 17.4 + bowShift) };
  const count = BATTERY_SPAN.slots + BATTERY_SPAN.perExtension * level;
  const [first, last] = [base(BATTERY_SPAN.from), base(BATTERY_SPAN.to)];
  const batteryPorts = Array.from({ length: count }, (_, k) => first + ((last - first) * k) / (count - 1));
  const wheel = { y: quarterdeck.y + 0.85, z: at(-0.76).z };
  const qdFront = hull.stationAt(quarterdeck.to).z;
  const fcFront = hull.stationAt(forecastle.from).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.fluyt + DECK_CREW.handsPerExtension.fluyt * level,
    helm: { x: 0, y: quarterdeck.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.86).z, facing: 0 },
    // Pont principal (entre les escaliers des gaillards), et le gaillard d'arrière, devant le grand mât d'artimon.
    walks: [...deckWalks(DECK_Y, [0.75, -0.75], qdFront + 1.3, fcFront - 1.3), ...deckWalks(quarterdeck.y, [0.5], at(-0.58).z, qdFront - 0.4)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.halfWidthAt(hull.stationAt(z / half), DECK_Y)),
    isOpenGun: (mount) => mount.calibre === 'deck',
  };
  const deckSlots = DECK_SLOTS.slice(0, 2 + level).map((u) => ({ u: base(u), y: u > 0 ? forecastle.y : quarterdeck.y }));
  return {
    length: FLUYT_LENGTH + extra,
    hull,
    base,
    at,
    station: (u) => hull.stationAt(u),
    sheer: (u) => (u < 0 ? SHEER.aft : SHEER.fore) * Math.abs(u) ** SHEER.power,
    quarterdeck,
    poop,
    forecastle,
    foreMast,
    mainMast,
    mizzenMast,
    squareSails: [
      { mastZ: foreMast.z, yardY: 9.8, width: 7.4, height: 4.3 },
      { mastZ: foreMast.z, yardY: 14.2, width: 5.6, height: 3.6 },
      { mastZ: foreMast.z, yardY: 16.8, width: 3.6, height: 2.1 },
      { mastZ: mainMast.z, yardY: 10.8, width: 8.4, height: 4.9 },
      { mastZ: mainMast.z, yardY: 15.9, width: 6.4, height: 4.2 },
      { mastZ: mainMast.z, yardY: 18.9, width: 4.2, height: 2.5 },
      { mastZ: mizzenMast.z, yardY: 14.3, width: 3.4, height: 2.2 },
    ],
    mizzenSail: { tack: new THREE.Vector3(0, -2.8, 3.4), peak: new THREE.Vector3(0, 4.2, -3.8), clew: new THREE.Vector3(0, -1.9, -3), bulge: 0.55 },
    mizzenYardY: 9.4,
    bowsprit,
    spritsail: { yard: bowsprit.base.clone().lerp(bowsprit.tip, 0.68).add(new THREE.Vector3(0, -0.15, 0)), width: 4.2, height: 2.2 },
    wheel,
    flag: { length: 1.8, height: 1.1, y: mainMast.top + 0.1 },
    batteryPorts,
    batterySlots: purchaseOrder(count, BATTERY_SPAN.first).map((k) => batteryPorts[k]),
    deckSlots,
    hatches: [
      { u: base(0.28), width: 1.6, depth: 1.8 },
      { u: base(-0.2), width: 1.5, depth: 1.6 },
    ],
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const fluytLayout = (level: number): FluytLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) : les deux canons du gaillard d'arrière sont là dès la base,
 * la batterie prend les suivants jusqu'à remplir ses sabords, le reste va au gaillard d'avant (flûte allongée).
 */
export function fluytArmament(perSide: number, layout: FluytLayout): { battery: number; deck: number } {
  const battery = Math.max(0, Math.min(layout.batterySlots.length, perSide - 2));
  return { battery, deck: Math.min(layout.deckSlots.length, perSide - battery) };
}
