import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import type { Deck, Mast, PieceSlot, SquareSail } from '../galleon/galleonLayout';
import { HullShape, type Station } from '../parts/hullShape';
import { balancedMainMast, hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { GaffSailShape } from '../parts/sails';

/** Longueur du vaisseau de 64 (m) : les positions écrites en « u de base » s'y rapportent. */
export const SHIP_OF_LINE_LENGTH = 38;
const BASE_HALF = SHIP_OF_LINE_LENGTH / 2;
/**
 * Parties qui s'étirent (u de base) à chaque allongement (74, puis 80) : le gaillard d'arrière devant la dunette, le
 * milieu, et le gaillard d'avant ; `share` = part de la longueur de chaque allongement donnée à chacune.
 */
const STRETCH = [
  { from: -0.78, to: -0.45, share: 0.3 },
  { from: -0.38, to: 0.56, share: 0.5 },
  { from: 0.64, to: 0.8, share: 0.2 },
];

/**
 * Gabarit de la coque (u de base) : très large en bas, flancs qui rentrent fortement vers le pont (rentrée mesurée à
 * hauteur fixe), tonture douce ; châteaux bas : dunette sur un gaillard d'arrière à peine plus haut que le pont, gaillard
 * d'avant jusqu'à l'étrave ; pavois bas au milieu. Poupe plate au-dessus d'une voûte arrondie : la quille remonte en
 * courbe sous les galeries, le tableau ne descend pas jusqu'à l'eau. Deux sections très proches font chaque marche.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.6, 9.9, 4.2],
  [-0.98, 0.7, 9.88, 3],
  [-0.95, 0.78, 9.85, 1.5],
  [-0.91, 0.85, 9.82, -0.2],
  [-0.86, 0.9, 9.8, -1.9],
  [-0.8, 0.935, 9.78, -3.1],
  [-0.7, 0.96, 9.75, -3.8],
  [-0.69, 0.962, 7.98, -3.85],
  [-0.55, 0.98, 7.95, -4.2],
  [-0.42, 0.995, 7.92, -4.35],
  [-0.41, 0.995, 6.05, -4.4],
  [0, 1, 5.95, -4.5],
  [0.3, 0.99, 6, -4.4],
  [0.6, 0.94, 6.15, -4],
  [0.61, 0.935, 7.85, -3.95],
  [0.74, 0.86, 7.9, -3.3],
  [0.85, 0.72, 8, -2.3],
  [0.93, 0.52, 8.1, -1],
  [0.97, 0.36, 8.15, -0.2],
  [1, 0.16, 8.2, 0.9],
];
/** Maître-bau (demi-largeur, m), haut du bouchain (m) et rentrée des flancs, mesurée à une hauteur fixe. */
const HALF_WIDTH = 5.1;
const UPPER_BILGE = 2;
const TUMBLE = { fraction: 0.26, height: 6.2 };

// Hauteurs (identiques pour toutes les longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont du milieu (à l'air libre) ; les deux batteries couvertes sont dessous, serrées l'une sur l'autre. */
export const DECK_Y = 5.2;
/** Sabords des deux batteries (centre, au milieu du navire ; ils suivent la tonture). */
export const LOW_Y = 2.3;
export const HIGH_Y = 4.15;
/** Taille des sabords des batteries (hauteur, largeur, m). */
export const PORT = { low: [0.56, 0.6], high: [0.52, 0.56] } as const;
/** Tonture des préceintes et des sabords (m) : `aft` × |u|^power vers la poupe, `fore` × u^power vers l'avant. */
const SHEER = { aft: 0.45, fore: 0.4, power: 1.6 };
/** Batteries (u de base) : sabords réguliers, de plus à chaque allongement, ceux du milieu achetés d'abord. */
const LOW_SPAN = { from: -0.74, to: 0.8, slots: [13, 14, 15], first: 6 };
const HIGH_SPAN = { from: -0.78, to: 0.84, slots: [13, 15, 16], first: 6 };
/** Pièces légères (second calibre, u de base) dans l'ordre d'achat, et combien en porte chaque taille (64, 74, 80). */
const PIECE_SLOTS = [
  { u: -0.47, deck: 'quarterdeck' },
  { u: 0.78, deck: 'forecastle' },
  { u: -0.55, deck: 'quarterdeck' },
  { u: 0.87, deck: 'forecastle' },
  { u: 0.32, deck: 'waist' },
  { u: -0.2, deck: 'waist' },
  { u: 0.45, deck: 'waist' },
  { u: -0.3, deck: 'waist' },
  { u: 0.2, deck: 'waist' },
] as const;
const PIECES = [6, 8, 9];
/** Fenêtres des flancs (u de base, hauteur) : chambre sous la dunette, devant les bouteilles. */
const WINDOWS: readonly (readonly [number, number])[] = [
  [-0.82, 8],
  [-0.75, 8],
];
/** Poulaine (comme celle du galion, galleonBow.ts) : sous le plat-bord de l'avant, avancée, demi-largeur, éperon, lion (m). */
const BEAK = { below: 1.3, reach: 4.2, halfWidth: 1.1, cutwaterFoot: 1.6, tip: 0.85 };
/** Beaupré : pied sous le pont du gaillard d'avant, juste devant la misaine ; pointe ; petit mât de contre-civadière (m). */
const BOWSPRIT = { heel: 0.6, heelBelow: 0.5, tipY: 15.8, reach: 11, topmast: 5 };
/**
 * Focs (au-dessus de la civadière, ce qui distingue sa voilure de celle du galion) : point d'amure le long du beaupré
 * (0 au pied, 1 à la pointe), têtière sur la misaine (hauteur), point d'écoute bas et en arrière (hauteur, recul depuis
 * la misaine, m) : des triangles assez larges. Grand foc puis petit foc.
 */
const JIBS = [
  { along: 0.88, head: 30.5, clewY: 11.5, clewAhead: 6.4 },
  { along: 0.58, head: 24, clewY: 9.6, clewAhead: 4.2 },
];
/** Roue : devant la cloison de la dunette (m). */
const WHEEL_AHEAD = 0.95;
/** Brigantine : hauteur de sa bôme au-dessus de la dunette (au-dessus des têtes), dépassement de la poupe (m). */
const SPANKER = { boomAbovePoop: 2.1, overhang: 3.4 };

/**
 * Plan d'un vaisseau de ligne : de 64 (base), de 74 (1 allongement), de 80 (2). Les positions le long de la coque sont
 * en u de la coque ; `base(u)` convertit une position pensée pour le vaisseau de 64 (le milieu et les gaillards
 * s'étirent, la dunette, la poupe et l'étrave glissent). Les types des mâts, voiles carrées, ponts et pièces sont ceux du galion (galleonLayout.ts).
 */
export interface ShipOfLineLayout {
  readonly level: number;
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  at(baseU: number): Station;
  station(u: number): Station;
  /** Tonture (m) des sabords et des préceintes, en u de la coque. */
  sheer(u: number): number;
  /** Gaillard d'arrière, dunette au-dessus de lui, gaillard d'avant. */
  readonly quarterdeck: Deck;
  readonly poop: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  /**
   * Voiles carrées : basse voile, hunier et perroquet de misaine et du grand mât, hunier d'artimon (au-dessus de la
   * brigantine), contre-civadière. `mainCourse` : la grande voile, qui porte l'emblème.
   */
  readonly squareSails: readonly SquareSail[];
  readonly mainCourse: number;
  /** Brigantine d'artimon (repère de son gréement, qui pivote autour du mât à la hauteur `boomY`). */
  readonly spanker: GaffSailShape;
  readonly boomY: number;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3; topmast: THREE.Vector3 };
  readonly spritsail: { yard: THREE.Vector3; width: number; height: number };
  /** Focs : point d'amure, têtière et point d'écoute. */
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly beak: { y: number; rootZ: number; tipZ: number; halfWidth: number; cutwaterFoot: number; figurehead: THREE.Vector3 };
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords des batteries (u de la coque) : `…Ports` de l'arrière vers l'avant, `…Slots` dans l'ordre d'achat. */
  readonly lowPorts: readonly number[];
  readonly lowSlots: readonly number[];
  readonly highPorts: readonly number[];
  readonly highSlots: readonly number[];
  /** Pièces légères des gaillards et du pont, dans l'ordre d'achat. */
  readonly pieceSlots: readonly PieceSlot[];
  readonly windows: readonly { u: number; y: number }[];
  readonly hatches: readonly { u: number; width: number; depth: number }[];
  /** z du cabestan, sur le pont du milieu. */
  readonly capstan: number;
  /** Pont de l'équipage animé ; canons servis à découvert = les pièces légères (second calibre). */
  readonly deck: DeckPlan;
}

/** `count` positions régulières de `from` à `to`. */
const spread = (from: number, to: number, count: number) => Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));

function createLayout(level: number): ShipOfLineLayout {
  const added = (SHIP_TYPES.shipOfLine.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, STRETCH.map(({ from, to, share }) => ({ from, to, added: added * share })));
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
  // Chaque pont d'un château s'arrête à la section haute de sa marche.
  const quarterdeck = { y: 7.05, from: base(-0.99), to: base(-0.42) };
  const poop = { y: 8.95, from: base(-0.99), to: base(-0.7) };
  const forecastle = { y: 6.95, from: base(0.61), to: base(0.97) };
  const deckY = { quarterdeck: quarterdeck.y, forecastle: forecastle.y, waist: DECK_Y };
  const foreMast = { z: at(0.7).z, base: forecastle.y, top: 36, topPlatform: 22.5 };
  const mizzenMast = { z: at(-0.58).z, base: quarterdeck.y, top: 31, topPlatform: 20 };
  const mainMast = { z: balancedMainMast(at(0.1).z, foreMast.z, mizzenMast.z, level), base: DECK_Y, top: 41, topPlatform: 26 };
  const stem = hull.stationAt(1);
  const bowTip = new THREE.Vector3(0, BOWSPRIT.tipY, BASE_HALF + BOWSPRIT.reach + bowShift);
  const bowsprit = { base: new THREE.Vector3(0, forecastle.y - BOWSPRIT.heelBelow, foreMast.z + BOWSPRIT.heel), tip: bowTip, topmast: bowTip.clone().setY(bowTip.y + BOWSPRIT.topmast) };
  const lowPorts = spread(base(LOW_SPAN.from), base(LOW_SPAN.to), LOW_SPAN.slots[level]);
  const highPorts = spread(base(HIGH_SPAN.from), base(HIGH_SPAN.to), HIGH_SPAN.slots[level]);
  const poopFront = hull.stationAt(poop.to).z;
  const wheel = { y: quarterdeck.y + 0.85, z: poopFront + WHEEL_AHEAD };
  const boomY = poop.y + SPANKER.boomAbovePoop;
  const sternZ = hull.stationAt(-1).z;
  const qdFront = hull.stationAt(quarterdeck.to).z;
  const fcBack = hull.stationAt(forecastle.from).z;
  const widthAt = (y: number) => (z: number) => hull.halfWidthAt(hull.stationAt(z / half), y);
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.shipOfLine + DECK_CREW.handsPerExtension.shipOfLine * level,
    helm: { x: 0, y: quarterdeck.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.9).z, facing: 0 },
    // Le milieu (entre les escaliers des gaillards), et le gaillard d'arrière devant la roue.
    walks: [...deckWalks(DECK_Y, [1.4, -1.4], qdFront + 2.4, fcBack - 2.4), ...deckWalks(quarterdeck.y, [1], wheel.z + 1, qdFront - 0.8)],
    ropes: [...ropeSpots(DECK_Y, [mainMast.z], widthAt(DECK_Y)), ...ropeSpots(forecastle.y, [foreMast.z], widthAt(forecastle.y))],
    isOpenGun: (mount) => mount.calibre === 'deck',
  };
  return {
    level,
    length: SHIP_OF_LINE_LENGTH + extra,
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
      { mastZ: foreMast.z, yardY: 20.6, width: 13.5, height: 8.6 },
      { mastZ: foreMast.z, yardY: 29.5, width: 10, height: 6.4 },
      { mastZ: foreMast.z, yardY: 34.6, width: 6.4, height: 3.6 },
      { mastZ: mainMast.z, yardY: 24.6, width: 15.5, height: 9.6 },
      { mastZ: mainMast.z, yardY: 34.6, width: 11.4, height: 7.2 },
      { mastZ: mainMast.z, yardY: 40, width: 7.2, height: 4 },
      { mastZ: mizzenMast.z, yardY: 29.2, width: 7.6, height: 5.4 },
      { mastZ: bowTip.z, yardY: bowTip.y + BOWSPRIT.topmast - 0.3, width: 5.6, height: 3.4 },
    ],
    mainCourse: 3,
    spanker: {
      tack: new THREE.Vector3(0, 0, -0.3),
      clew: new THREE.Vector3(0, 0, sternZ - mizzenMast.z - SPANKER.overhang),
      throat: new THREE.Vector3(0, mizzenMast.topPlatform - boomY - 1.2, -0.3),
      peak: new THREE.Vector3(0, mizzenMast.topPlatform - boomY + 1.6, sternZ - mizzenMast.z - 1.4),
      bulge: 0.6,
    },
    boomY,
    bowsprit,
    jibs: JIBS.map((j) => ({
      tack: bowsprit.base.clone().lerp(bowsprit.tip, j.along),
      head: new THREE.Vector3(0, j.head, foreMast.z + 0.3),
      clew: new THREE.Vector3(0, j.clewY, foreMast.z + j.clewAhead),
    })),
    spritsail: { yard: bowsprit.base.clone().lerp(bowsprit.tip, 0.66).add(new THREE.Vector3(0, -0.15, 0)), width: 8.4, height: 3.8 },
    beak: {
      y: stem.gunwale - BEAK.below,
      rootZ: stem.z,
      tipZ: stem.z + BEAK.reach,
      halfWidth: BEAK.halfWidth,
      cutwaterFoot: BEAK.cutwaterFoot,
      figurehead: new THREE.Vector3(0, stem.gunwale - BEAK.below + BEAK.tip * 0.3, stem.z + BEAK.reach + BEAK.tip),
    },
    wheel,
    flag: { length: 2.6, height: 1.6, y: mainMast.top + 0.1 },
    lowPorts,
    lowSlots: purchaseOrder(lowPorts.length, LOW_SPAN.first).map((k) => lowPorts[k]),
    highPorts,
    highSlots: purchaseOrder(highPorts.length, HIGH_SPAN.first).map((k) => highPorts[k]),
    pieceSlots: PIECE_SLOTS.slice(0, PIECES[level]).map((p) => ({ u: base(p.u), y: deckY[p.deck] })),
    windows: WINDOWS.map(([u, y]) => ({ u: base(u), y })),
    hatches: [
      { u: base(0.4), width: 1.8, depth: 1.9 },
      { u: base(-0.08), width: 1.7, depth: 1.7 },
    ],
    capstan: at(-0.27).z,
    deck,
  };
}

/** Un plan par nombre d'allongements (0 : vaisseau de 64, 1 : de 74, 2 : de 80). */
const LAYOUTS = [0, 1, 2].map(createLayout);

export const shipOfLineLayout = (level: number): ShipOfLineLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) entre batterie basse, batterie haute et pièces légères : les
 * pièces au prorata des places du plan, puis les batteries à parts égales (la basse d'abord) ; toutes les places
 * remplies au maximum (32 par bord pour le 64, 37 pour le 74, 40 pour le 80).
 */
export function shipOfLineArmament(perSide: number, L: ShipOfLineLayout): { low: number; high: number; pieces: number } {
  const slots = { low: L.lowPorts.length, high: L.highPorts.length, pieces: L.pieceSlots.length };
  const total = slots.low + slots.high + slots.pieces;
  const pieces = Math.min(slots.pieces, Math.round((perSide * slots.pieces) / total));
  const low = Math.min(slots.low, Math.ceil((perSide - pieces) / 2));
  const high = Math.min(slots.high, perSide - pieces - low);
  return { low, high, pieces: Math.min(slots.pieces, perSide - low - high) };
}
