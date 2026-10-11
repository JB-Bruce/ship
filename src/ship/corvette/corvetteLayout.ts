import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import type { GaffSailShape } from '../parts/sails';

/** Longueur de la corvette de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const CORVETTE_LENGTH = 22;
const BASE_HALF = CORVETTE_LENGTH / 2;
/** Partie droite du milieu (u de base), entre le château et le gaillard d'avant : c'est elle qui s'étire quand la corvette est allongée. */
const MIDBODY = { from: -0.4, to: 0.25 };

/**
 * Gabarit de la coque (u de base) : pont principal bas au milieu (le passavant), gaillard d'avant un peu surélevé,
 * château arrière plus haut. Deux sections très proches font chaque marche presque verticale.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.72, 4.9, -0.9],
  [-0.8, 0.9, 4.7, -1.4],
  [-0.52, 0.98, 4.55, -1.75],
  [-0.48, 0.99, 2.9, -1.8],
  [-0.1, 1, 2.85, -1.9],
  [0.3, 0.99, 2.85, -1.9],
  [0.62, 0.88, 2.95, -1.6],
  [0.66, 0.86, 3.85, -1.55],
  [0.8, 0.66, 3.95, -1.25],
  [0.93, 0.34, 4.05, -0.7],
  [1, 0.03, 4.15, 0],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal (à l'air libre au milieu) ; la batterie couverte est dessous, toujours 1,05 m plus bas. */
export const DECK_Y = 2;
export const BATTERY_Y = DECK_Y - 1.05;
/** Batterie couverte (u de base) : 4 sabords réguliers, 2 de plus par bord sur la corvette allongée. */
const BATTERY_SPAN = { from: -0.5, to: 0.38, slots: 4, perExtension: 2 };
/** Canons légers du pont principal (u de base), dans l'ordre d'achat (deux par deux) : d'abord au milieu, puis aux extrémités. */
const DECK_SLOTS = [-0.08, 0.24, -0.38, 0.52];
/** Grand-voile basse du grand mât (index dans squareSails) : la plus grande voile. */
export const MAIN_COURSE = 3;

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
  base: number;
}

/**
 * Plan d'une corvette, standard ou allongée. Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour la corvette de base (la partie droite du milieu s'étire, le reste glisse).
 */
export interface CorvetteLayout {
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
  readonly mizzenMast: Mast;
  /** Voiles carrées de la misaine et du grand mât : basse voile, hunier, perroquet (z du mât qui les porte). */
  readonly squareSails: readonly { mastZ: number; yardY: number; width: number; height: number }[];
  readonly mizzenSail: GaffSailShape;
  readonly mizzenBoomY: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Focs : point d'amure (sur le beaupré), têtière et point d'écoute. */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords de la batterie couverte (u de la coque), dans l'ordre d'achat. */
  readonly batterySlots: readonly number[];
  /** Canons légers du pont (u de la coque), dans l'ordre d'achat. */
  readonly deckSlots: readonly number[];
  readonly hatches: readonly { u: number; width: number; depth: number; kind: 'grating' | 'open' }[];
  /** Pont de l'équipage animé ; canons servis à découvert = ceux du pont (la batterie est couverte). */
  readonly deck: DeckPlan;
}

function createLayout(level: number): CorvetteLayout {
  const added = (SHIP_TYPES.corvette.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...MIDBODY, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    3,
    0.75,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  const quarterdeck = { y: 3.7, from: base(-0.99), to: base(-0.5) };
  const foreMast = { z: at(0.45).z, top: 18, topPlatform: 11, base: DECK_Y };
  const mainMast = { z: at(-0.05).z, top: 20, topPlatform: 12, base: DECK_Y };
  const mizzenMast = { z: at(-0.62).z, top: 15.5, topPlatform: 10, base: quarterdeck.y };
  const bowsprit = { base: new THREE.Vector3(0, 4, 10.6 + bowShift), tip: new THREE.Vector3(0, 6, 17.2 + bowShift) };
  const [first, last] = [base(BATTERY_SPAN.from), base(BATTERY_SPAN.to)];
  const count = BATTERY_SPAN.slots + BATTERY_SPAN.perExtension * level;
  const forecastle = { y: 2.95, from: base(0.64), to: base(0.95) };
  const castle = hull.stationAt(quarterdeck.to).z;
  const fore = hull.stationAt(forecastle.from).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.corvette + DECK_CREW.handsPerExtension.corvette * level,
    helm: { x: 0, y: quarterdeck.y, z: at(-0.8).z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.84).z, facing: 0 },
    // Pont principal (entre les escaliers), et le château arrière du côté sans tonneau.
    walks: [...deckWalks(DECK_Y, [0.75, -0.75], castle + 2, fore - 1.4), ...deckWalks(quarterdeck.y, [0.9], at(-0.72).z, castle - 0.4)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: (mount) => mount.calibre === 'deck',
  };
  return {
    length: CORVETTE_LENGTH + extra,
    hull,
    base,
    at,
    station: (u) => hull.stationAt(u),
    quarterdeck,
    forecastle,
    deck,
    foreMast,
    mainMast,
    mizzenMast,
    squareSails: [
      { mastZ: foreMast.z, yardY: 10.4, width: 9.5, height: 6.4 },
      { mastZ: foreMast.z, yardY: 15, width: 7.4, height: 4.2 },
      { mastZ: foreMast.z, yardY: 17.6, width: 5.2, height: 2.4 },
      { mastZ: mainMast.z, yardY: 11.4, width: 10.5, height: 7 },
      { mastZ: mainMast.z, yardY: 16.6, width: 8, height: 4.8 },
      { mastZ: mainMast.z, yardY: 19.6, width: 5.6, height: 2.8 },
    ],
    // Brigantine (voile aurique) du mât d'artimon, dans le repère de son gréement posé à la hauteur de la bôme.
    mizzenSail: {
      tack: new THREE.Vector3(0, 0, -0.25),
      clew: new THREE.Vector3(0, 0, -4.6),
      peak: new THREE.Vector3(0, 8.4, -3.8),
      throat: new THREE.Vector3(0, 6.4, -0.25),
      bulge: 0.6,
    },
    mizzenBoomY: quarterdeck.y + 1.9,
    bowsprit,
    jibs: [
      { tack: bowsprit.tip, head: new THREE.Vector3(0, 17.4, foreMast.z + 0.3), clew: new THREE.Vector3(0, 4.9, 10.2 + bowShift) },
      { tack: new THREE.Vector3(0, 5.2, 14.2 + bowShift), head: new THREE.Vector3(0, 14.6, foreMast.z + 0.25), clew: new THREE.Vector3(0, 4.6, 9 + bowShift) },
    ],
    wheel: { y: quarterdeck.y + 0.9, z: at(-0.8).z },
    flag: { length: 1.8, height: 1.1, y: mainMast.top + 0.1 },
    batterySlots: purchaseOrder(count).map((k) => first + ((last - first) * k) / (count - 1)),
    deckSlots: DECK_SLOTS.map(base),
    // Écoutilles vers la batterie : caillebotis devant le grand mât et à l'avant, trappe ouverte avec son échelle.
    hatches: [
      { u: base(0.2), width: 1.3, depth: 1.1, kind: 'grating' },
      { u: base(0.56), width: 1.1, depth: 0.9, kind: 'grating' },
      { u: base(-0.24), width: 1, depth: 1.1, kind: 'open' },
    ],
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const corvetteLayout = (level: number): CorvetteLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) : la batterie couverte (4 sabords) d'abord, puis les canons
 * légers du pont (jusqu'à 4) ; au-delà de 8, les sabords en plus de la corvette allongée (9, 10).
 */
export function corvetteArmament(perSide: number, layout: CorvetteLayout): { battery: number; deck: number } {
  const base = BATTERY_SPAN.slots;
  const battery = Math.min(layout.batterySlots.length, base + Math.max(0, perSide - base - DECK_SLOTS.length));
  return { battery, deck: Math.min(layout.deckSlots.length, Math.max(0, perSide - battery)) };
}
