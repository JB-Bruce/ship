import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import type { GaffSailShape } from '../parts/sails';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';

/** Longueur de la frégate de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const FRIGATE_LENGTH = 28;
const BASE_HALF = FRIGATE_LENGTH / 2;
/**
 * Parties de la coque qui s'étirent quand la frégate est allongée (u de base) : l'arrière sous le gaillard d'arrière
 * découvert (entre la dunette et la cloison), la partie droite du milieu, et l'avant du gaillard d'avant. Le reste
 * (poupe, galeries, étrave, éperon) glisse sans se déformer.
 */
const SECTIONS = { aft: { from: -0.745, to: -0.47 }, mid: { from: -0.25, to: 0.15 }, fore: { from: 0.645, to: 0.8 } };
type Section = keyof typeof SECTIONS;
/** Part de la longueur de chaque allongement donnée à chaque partie : le 1er au milieu, le 2e à l'arrière, au milieu et à l'avant. */
const EXTENSION_SPLIT: readonly Record<Section, number>[] = [
  { aft: 0, mid: 1, fore: 0 },
  { aft: 0.3, mid: 0.4, fore: 0.3 },
];

/**
 * Gabarit de la coque (u de base), à la manière des vaisseaux du XVIIe : tonture marquée (le plat-bord et la quille
 * remontent vers les deux bouts), château arrière en escalier (gaillard d'arrière puis dunette, la poupe très haute),
 * gaillard d'avant, flancs rentrants (le plat-bord est plus étroit que le maître-bau, atteint à 1 m au-dessus de
 * l'eau). Deux sections très proches font chaque marche presque verticale.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.72, 8.3, -0.9],
  [-0.9, 0.86, 8, -1.4],
  [-0.76, 0.95, 7.75, -1.8],
  [-0.74, 0.955, 6.05, -1.85],
  [-0.6, 0.98, 5.9, -2],
  [-0.47, 0.99, 5.85, -2.1],
  [-0.44, 1, 3.85, -2.15],
  [-0.25, 1, 3.6, -2.2],
  [-0.05, 1, 3.5, -2.25],
  [0.15, 1, 3.5, -2.25],
  [0.35, 0.98, 3.6, -2.2],
  [0.55, 0.92, 3.85, -2],
  [0.62, 0.89, 3.95, -1.9],
  [0.645, 0.88, 5, -1.88],
  [0.8, 0.68, 5.25, -1.5],
  [0.93, 0.36, 5.5, -0.85],
  [1, 0.03, 5.7, 0],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal (à l'air libre au milieu) ; la batterie couverte est dessous, 1,15 m plus bas. */
export const DECK_Y = 2.6;
export const BATTERY_Y = DECK_Y - 1.15;
/** Les préceintes (et les sabords de la batterie) suivent la tonture : elles remontent de SHEER × u² vers les bouts. */
export const SHEER = 0.5;
export const sheer = (u: number) => SHEER * u * u;
/** Hauteur d'un sabord de la batterie (u de la coque : il suit la tonture). */
export const batteryY = (u: number) => BATTERY_Y + sheer(u);

/** Batterie couverte (u de base) : 8 sabords réguliers de la poupe à la proue, 2 de plus par allongement sur la même étendue rallongée. */
const BATTERY_SPAN = { from: -0.62, to: 0.5, slots: 8, perExtension: 2 };
/** Canons légers des gaillards (u de base) selon le nombre d'allongements, dans l'ordre d'achat : arrière, avant, avant, arrière, puis un à l'avant (allongée) et un à l'arrière (grande frégate). */
const DECK_SLOTS = [
  [-0.52, 0.72, 0.86, -0.66],
  [-0.52, 0.69, 0.87, -0.66, 0.78],
  [-0.52, 0.69, 0.87, -0.66, 0.78, -0.59],
];

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
  crossTree: number;
  base: number;
}

/**
 * Plan d'une frégate, standard ou allongée (une ou deux fois). Tout ce qui se trouve le long de la coque est exprimé
 * en u de la coque (−1 = poupe, 1 = proue) ; `base(u)` convertit une position pensée pour la frégate de base : les
 * parties SECTIONS s'étirent, le reste glisse sans se déformer.
 */
export interface FrigateLayout {
  readonly length: number;
  readonly hull: HullShape;
  /** u de la coque d'un point placé en u de base. */
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Demi-largeur du bordé à la hauteur y, en u de base (flancs rentrants compris). */
  widthAt(baseU: number, y: number): number;
  /** Station et demi-largeur en u de la coque (ponts, sabords). */
  station(u: number): Station;
  width(u: number, y: number): number;
  /** Décalage (m) de ce qui est devant l'étrave d'origine (beaupré, focs). */
  readonly bowShift: number;
  readonly quarterdeck: Deck;
  readonly poop: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  readonly spritMast: { base: THREE.Vector3; top: THREE.Vector3 };
  readonly squareSails: readonly { z: number; yardY: number; width: number; height: number }[];
  readonly spanker: GaffSailShape;
  readonly spankerBoomY: number;
  readonly jibs: readonly { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 }[];
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  readonly spritFlag: { length: number; height: number };
  /** Sabords de batterie (u de la coque), dans l'ordre d'achat. */
  readonly batterySlots: readonly number[];
  /** Canons légers des gaillards (u de la coque), dans l'ordre d'achat. */
  readonly deckSlots: readonly { u: number; y: number }[];
  /** Écoutilles du pont principal (u de la coque). */
  readonly hatches: readonly { u: number; width: number; depth: number; kind: 'grating' | 'open' }[];
  /** Pont de l'équipage animé : barre, vigie, promenades, cordages ; canons servis à découvert = ceux des gaillards. */
  readonly deck: DeckPlan;
}

/** Grand-voile basse du grand mât (index dans squareSails) : la plus grande voile. */
export const MAIN_COURSE = 3;

function createLayout(level: number): FrigateLayout {
  // Longueur ajoutée à chaque partie par les `level` premiers allongements.
  const lengths = (SHIP_TYPES.frigate.extensions ?? []).slice(0, level).map((e) => e.length);
  const { half, extra, zOf, base } = hullStretch(
    BASE_HALF,
    (Object.keys(SECTIONS) as Section[]).map((k) => ({ ...SECTIONS[k], added: lengths.reduce((sum, length, i) => sum + length * EXTENSION_SPLIT[i][k], 0) })),
  );
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    3.7,
    1,
    0.14,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  const quarterdeck = { y: 4.95, from: base(-0.99), to: base(-0.46) };
  const poop = { y: 6.85, from: base(-0.99), to: base(-0.745) };
  const forecastle = { y: 4.1, from: base(0.64), to: base(0.95) };
  const foreMast = { z: at(0.42).z, top: 23.5, topPlatform: 13.8, crossTree: 19.6, base: DECK_Y };
  const mainMast = { z: at(-0.04).z, top: 26.5, topPlatform: 15.2, crossTree: 21.4, base: DECK_Y };
  const mizzenMast = { z: at(-0.6).z, top: 23.6, topPlatform: 15.4, crossTree: 20.2, base: quarterdeck.y };
  // Beaupré, et le mâtereau dressé à son bout qui porte la contre-civadière.
  const bowsprit = { base: new THREE.Vector3(0, 5.4, 13.6 + bowShift), tip: new THREE.Vector3(0, 8.4, 22.4 + bowShift) };
  const alongBowsprit = (t: number) => new THREE.Vector3().lerpVectors(bowsprit.base, bowsprit.tip, t);
  const spritMast = { base: bowsprit.tip.clone(), top: new THREE.Vector3(0, 12.6, 22.6 + bowShift) };
  const spritsailYard = alongBowsprit(0.7);
  // Batterie : sabords réguliers sur l'étendue (rallongée), 2 de plus par allongement.
  const [first, last] = [base(BATTERY_SPAN.from), base(BATTERY_SPAN.to)];
  const count = BATTERY_SPAN.slots + BATTERY_SPAN.perExtension * level;
  const batterySlots = purchaseOrder(count).map((k) => first + ((last - first) * k) / (count - 1));
  // Pont de l'équipage : promenades sur le pont principal (devant les escaliers des châteaux), le gaillard d'arrière et le gaillard d'avant.
  const castle = hull.stationAt(quarterdeck.to).z;
  const fore = hull.stationAt(forecastle.from).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.frigate + DECK_CREW.handsPerExtension.frigate * level,
    helm: { x: 0, y: quarterdeck.y, z: at(-0.68).z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.86).z, facing: 0 },
    walks: [
      ...deckWalks(DECK_Y, [1.6, -1.6], castle + 2.6, fore - 2.2),
      ...deckWalks(quarterdeck.y, [0.9, -0.9], hull.stationAt(poop.to).z + 1, castle - 0.4),
      ...deckWalks(forecastle.y, [0], fore + 0.8, at(0.8).z),
    ],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z], (z) => hull.halfWidthAt(hull.stationAt(z / half), DECK_Y + 0.8)),
    isOpenGun: (mount) => mount.calibre === 'deck',
  };
  return {
    length: FRIGATE_LENGTH + extra,
    hull,
    base,
    at,
    widthAt: (u, y) => hull.halfWidthAt(at(u), y),
    station: (u) => hull.stationAt(u),
    width: (u, y) => hull.halfWidthAt(hull.stationAt(u), y),
    bowShift,
    quarterdeck,
    poop,
    forecastle,
    foreMast,
    mainMast,
    mizzenMast,
    bowsprit,
    spritMast,
    /**
     * Voiles carrées : basse voile, hunier et perroquet à la misaine et au grand mât ; hunier et perroquet à l'artimon,
     * au-dessus de la brigantine ; civadière sous le beaupré et contre-civadière sur son mâtereau.
     * `z` : plan de la voile (juste devant sa vergue).
     */
    squareSails: [
      { z: foreMast.z + 0.25, yardY: 13.2, width: 11.5, height: 7.6 },
      { z: foreMast.z + 0.25, yardY: 19.2, width: 9, height: 5.4 },
      { z: foreMast.z + 0.25, yardY: 22.6, width: 6.4, height: 3 },
      { z: mainMast.z + 0.25, yardY: 14.6, width: 12.6, height: 8.4 },
      { z: mainMast.z + 0.25, yardY: 21, width: 9.8, height: 5.8 },
      { z: mainMast.z + 0.25, yardY: 25.4, width: 7, height: 3.4 },
      { z: mizzenMast.z + 0.25, yardY: 19.6, width: 7, height: 3.8 },
      { z: mizzenMast.z + 0.25, yardY: 22.8, width: 5, height: 2.4 },
      { z: spritsailYard.z + 0.2, yardY: spritsailYard.y - 0.15, width: 7.2, height: 3.6 },
      { z: spritMast.top.z + 0.15, yardY: spritMast.top.y - 0.4, width: 4.4, height: 2.6 },
    ],
    // Brigantine (voile aurique) de l'artimon, dans le repère de son gréement posé à la hauteur de la bôme (au-dessus de la dunette).
    spanker: {
      tack: new THREE.Vector3(0, 0, -0.3),
      clew: new THREE.Vector3(0, 0, -6),
      peak: new THREE.Vector3(0, 6.6, -5),
      throat: new THREE.Vector3(0, 4.8, -0.3),
      bulge: 0.6,
    },
    spankerBoomY: poop.y + 1.9,
    // Un seul foc, entre le beaupré et la misaine : les voiles carrées du beaupré restent dégagées.
    jibs: [{ tack: alongBowsprit(0.45), head: new THREE.Vector3(0, 19.4, foreMast.z + 0.3), clew: new THREE.Vector3(0, 5.8, 11.8 + bowShift) }],
    wheel: { y: quarterdeck.y + 0.9, z: at(-0.68).z },
    flag: { length: 2.2, height: 1.35, y: mainMast.top + 0.1 },
    spritFlag: { length: 1.2, height: 0.75 },
    batterySlots,
    deckSlots: DECK_SLOTS[level].map((u) => ({ u: base(u), y: u < 0 ? quarterdeck.y : forecastle.y })),
    deck,
    hatches: [
      { u: base(0.22), width: 1.5, depth: 1.3, kind: 'grating' },
      { u: base(0.54), width: 1.2, depth: 1, kind: 'grating' },
      { u: base(-0.26), width: 1.1, depth: 1.2, kind: 'open' },
      // Allongée : une écoutille de plus dans la partie ajoutée, entre le grand mât et le cabestan.
      ...(level > 0 ? [{ u: (mainMast.z - 3.2) / half, width: 1.3, depth: 1.2, kind: 'grating' as const }] : []),
    ],
  };
}

/** Un plan par nombre d'allongements (0, 1, 2). */
const LAYOUTS = DECK_SLOTS.map((_, level) => createLayout(level));

/** Plan de la frégate selon ses allongements. */
export const frigateLayout = (level: number): FrigateLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord selon leur nombre (stats.cannonsPerSide) : 4 en batterie et 2 sur les gaillards
 * au départ ; chaque achat ajoute un canon de batterie, et les achats 2, 4, 6 et 8 un canon de gaillard (6, 7, 9, 10,
 * 12 ; frégate allongée : 14 avec deux canons de batterie, 15 ; grande frégate : 17, 18).
 */
export function frigateArmament(perSide: number, layout: FrigateLayout): { battery: number; deck: number } {
  const deck = Math.min(layout.deckSlots.length, 2 + [9, 12, 15, 18].filter((n) => perSide >= n).length);
  return { battery: Math.min(layout.batterySlots.length, perSide - deck), deck };
}
