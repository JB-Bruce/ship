import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch, purchaseOrder } from '../parts/hullStretch';
import type { OarSpec } from '../parts/oarBank';
import type { LateenSailShape } from '../parts/sails';

/** Longueur de la galéasse de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const GALLEASS_LENGTH = 33;
const BASE_HALF = GALLEASS_LENGTH / 2;
/** Milieu (u de base), entre le château de poupe et le château avant : c'est lui qui s'étire. */
const WAIST = { from: -0.6, to: 0.6 };

/**
 * Gabarit de la coque (u de base) : longue et basse. Château de poupe et château avant (deux sections très proches font
 * chaque marche), milieu bas à peine creusé ; poupe ronde dont la quille remonte au-dessus de l'eau, avant large et
 * droit (les triples canons tirent par sa face).
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.5, 5.55, 0.4],
  [-0.95, 0.68, 5.5, -0.5],
  [-0.88, 0.8, 5.45, -1.1],
  [-0.78, 0.89, 5.4, -1.5],
  [-0.652, 0.95, 5.35, -1.8],
  [-0.642, 0.95, 3.85, -1.8],
  [-0.35, 0.995, 3.75, -2.05],
  [0, 1, 3.7, -2.1],
  [0.35, 0.99, 3.75, -2.05],
  [0.645, 0.94, 3.85, -1.85],
  [0.655, 0.94, 5.7, -1.85],
  [0.78, 0.84, 5.72, -1.55],
  [0.88, 0.7, 5.74, -1.15],
  [0.95, 0.56, 5.76, -0.7],
  [1, 0.42, 5.8, -0.2],
];
/** Maître-bau (demi-largeur, m), haut du bouchain (m) et légère rentrée des flancs, mesurée à une hauteur fixe. */
const HALF_WIDTH = 3.6;
const UPPER_BILGE = 1;
const TUMBLE = { fraction: 0.1, height: 4.5 };

// Hauteurs (identiques pour toutes les longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
/** Pont principal (le milieu, à l'air libre) ; la batterie est dessous, ses sabords 0,9 m plus bas. */
export const DECK_Y = 2.95;
export const BATTERY_Y = DECK_Y - 0.9;
/** Hauteur des triples canons (centre de la grappe) dans la face du château avant. */
export const TRIPLE_Y = 4;
/** Tonture des préceintes et des sabords de batterie (m) : `aft` × |u|^power vers la poupe, `fore` × u^power vers l'avant. */
const SHEER = { aft: 0.25, fore: 0.3, power: 2 };
/** Préceintes : hauteur au milieu, part de la tonture suivie, hauteur de la bande. */
export const WALES = [
  { y: BATTERY_Y + 0.58, sheer: 1.5, height: 0.18 },
  { y: 1.5, sheer: 1.2, height: 0.16 },
  { y: 0.45, sheer: 1, height: 0.14 },
] as const;
/** Avirons, sous la batterie : sabords d'aviron, longueur hors bord et en dedans, pale. */
export const OAR: OarSpec = { y: 1.1, outboard: 5, inboard: 0.8, blade: { length: 1, width: 0.24 } };
/** Rangée d'avirons (u de base) : 12 par bord, 2 de plus par allongement. */
const OAR_ROW = { from: -0.56, to: 0.51, count: 12, perExtension: 2 };
/**
 * Sabords réguliers (u de base), dans l'ordre d'achat (les 4 du milieu d'abord) : batterie dans le bordé et pièces du
 * pont dans le pavois, 6 par bord chacune, 1 de plus par allongement.
 */
const BATTERY_SPAN = { from: -0.53, to: 0.53, slots: 6, perExtension: 1, first: 4 };
const DECK_SPAN = { from: -0.44, to: 0.54, slots: 6, perExtension: 1, first: 4 };
/** Triples canons dans la face du château avant (écart de l'axe, m) et pièces légères sur son dessus (écart, recul de la face). */
const TRIPLES: readonly number[] = [0.8, -0.8];
const BOW_PIECES = { xs: [1.15, -1.15], back: 0.85 };
/** Haubans : pieds sur le plat-bord, derrière le mât, écartés de `spacing`, à `clearance` m au moins des sabords du pont. */
const SHROUD_FEET = { first: 0.4, spacing: 0.5, count: 3, clearance: 0.45 };

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
  /** Hauteur de la hune (0 = sans hune). */
  topPlatform: number;
}

/** Une voile latine : son mât, la hauteur où sa vergue le croise, sa forme dans le repère de son gréement. */
export interface Lateen {
  mast: Mast;
  yardY: number;
  sail: LateenSailShape;
}

/**
 * Plan d'une galéasse, de base ou allongée. Les positions le long de la coque sont en u de la coque ; `base(u)`
 * convertit une position pensée pour la galéasse de base (le milieu s'étire, les châteaux glissent).
 */
export interface GalleassLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  /** Station en u de la coque. */
  station(u: number): Station;
  /** Tonture (m) des sabords de batterie et des préceintes, en u de la coque. */
  sheer(u: number): number;
  /** Château de poupe (sous le tendelet) et château avant. */
  readonly sternDeck: Deck;
  readonly forecastle: Deck;
  readonly foreMast: Mast;
  readonly mainMast: Mast;
  readonly mizzenMast: Mast;
  /** Misaine, grand mât, artimon : trois voiles latines. */
  readonly lateens: readonly Lateen[];
  /** Éperon : du pied de l'étrave à sa pointe. */
  readonly spur: { base: THREE.Vector3; tip: THREE.Vector3 };
  readonly wheel: { y: number; z: number };
  readonly flag: { length: number; height: number; y: number };
  /** Sabords (u de la coque) : `…Ports` de l'arrière vers l'avant, `…Slots` dans l'ordre d'achat. */
  readonly batteryPorts: readonly number[];
  readonly batterySlots: readonly number[];
  readonly deckPorts: readonly number[];
  readonly deckSlots: readonly number[];
  /** Proue : z de la face du château avant, x des triples canons, place des pièces légères sur son dessus. */
  readonly bow: { z: number; triples: readonly number[]; pieces: readonly { x: number; z: number }[] };
  /** z des sabords d'aviron (de l'arrière vers l'avant). */
  readonly oarZs: readonly number[];
  /** z des pieds des haubans de chaque mât (misaine, grand mât, artimon). */
  readonly shroudFeet: readonly (readonly number[])[];
  readonly hatches: readonly { u: number; width: number; depth: number }[];
  /** Pont de l'équipage animé ; canons servis à découvert = les pièces des flancs, sur le pont. */
  readonly deck: DeckPlan;
}

/** `count` positions régulières de `from` à `to` (u de la coque, ou z). */
const spread = (from: number, to: number, count: number) => Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));

function createLayout(level: number): GalleassLayout {
  const added = (SHIP_TYPES.galleass.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
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
  // Chaque château s'arrête à la section haute de sa marche (là où ses flancs ont toute leur hauteur).
  const sternDeck = { y: 5, from: base(-0.99), to: base(-0.652) };
  const forecastle = { y: 5.45, from: base(0.655), to: base(0.99) };
  const foreMast = { z: at(0.57).z, base: DECK_Y, top: 15.8, topPlatform: 14 };
  const mainMast = { z: at(0.036).z, base: DECK_Y, top: 19.6, topPlatform: 17.2 };
  const mizzenMast = { z: at(-0.51).z, base: DECK_Y, top: 14.4, topPlatform: 0 };
  const stem = hull.stationAt(1);
  const batteryPorts = spread(base(BATTERY_SPAN.from), base(BATTERY_SPAN.to), BATTERY_SPAN.slots + BATTERY_SPAN.perExtension * level);
  const deckPorts = spread(base(DECK_SPAN.from), base(DECK_SPAN.to), DECK_SPAN.slots + DECK_SPAN.perExtension * level);
  const oars = OAR_ROW.count + OAR_ROW.perExtension * level;
  const sternFront = hull.stationAt(sternDeck.to).z;
  const foreBack = hull.stationAt(forecastle.from).z;
  const wheel = { y: sternDeck.y + 0.85, z: at(-0.8).z };
  const widthAt = (y: number) => (z: number) => hull.halfWidthAt(hull.stationAt(z / half), y);
  // Pieds des haubans : derrière chaque mât, sur le plat-bord du milieu, entre les sabords des pièces du pont.
  const portZs = deckPorts.map((u) => hull.stationAt(u).z);
  const shroudFeet = [foreMast, mainMast, mizzenMast].map((mast) => {
    const feet: number[] = [];
    for (let z = mast.z - SHROUD_FEET.first; feet.length < SHROUD_FEET.count && z > sternFront + SHROUD_FEET.clearance; z -= SHROUD_FEET.spacing) {
      if (portZs.every((p) => Math.abs(p - z) >= SHROUD_FEET.clearance)) feet.push(z);
    }
    return feet;
  });
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.galleass + DECK_CREW.handsPerExtension.galleass * level,
    helm: { x: 0, y: sternDeck.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: forecastle.y, z: at(0.8).z, facing: 0 },
    walks: [...deckWalks(DECK_Y, [1.2, -1.2], sternFront + 1.6, foreBack - 1.6), ...deckWalks(sternDeck.y, [0.8], at(-0.95).z, sternFront - 0.4)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z, mizzenMast.z], widthAt(DECK_Y)),
    // Les pièces du château avant tirent vers l'avant, par-dessus sa balustrade : personne derrière elles.
    isOpenGun: (mount) => mount.calibre === 'deck' && mount.angle !== 0,
  };
  return {
    length: GALLEASS_LENGTH + extra,
    hull,
    base,
    at,
    station: (u) => hull.stationAt(u),
    sheer: (u) => (u < 0 ? SHEER.aft : SHEER.fore) * Math.abs(u) ** SHEER.power,
    sternDeck,
    forecastle,
    foreMast,
    mainMast,
    mizzenMast,
    lateens: [
      {
        mast: foreMast,
        yardY: 13.2,
        sail: { tack: new THREE.Vector3(0, -4.4, 6), peak: new THREE.Vector3(0, 4.4, -6), clew: new THREE.Vector3(0, -6.6, -3.8), bulge: 0.55 },
      },
      {
        mast: mainMast,
        yardY: 13.5,
        sail: { tack: new THREE.Vector3(0, -6.3, 6.8), peak: new THREE.Vector3(0, 6.7, -8.2), clew: new THREE.Vector3(0, -7.9, -6.6), bulge: 0.6 },
      },
      {
        mast: mizzenMast,
        yardY: 10.3,
        // Le point d'écoute reste au-dessus du tendelet.
        sail: { tack: new THREE.Vector3(0, -2.7, 3), peak: new THREE.Vector3(0, 5.5, -6.2), clew: new THREE.Vector3(0, -2.3, -5.6), bulge: 0.5 },
      },
    ],
    spur: { base: new THREE.Vector3(0, 1.5, stem.z - 0.3), tip: new THREE.Vector3(0, 1.95, 19.5 + bowShift) },
    wheel,
    flag: { length: 2.2, height: 1.35, y: mainMast.top + 0.1 },
    batteryPorts,
    batterySlots: purchaseOrder(batteryPorts.length, BATTERY_SPAN.first).map((k) => batteryPorts[k]),
    deckPorts,
    deckSlots: purchaseOrder(deckPorts.length, DECK_SPAN.first).map((k) => deckPorts[k]),
    bow: { z: stem.z, triples: TRIPLES, pieces: BOW_PIECES.xs.map((x) => ({ x, z: stem.z - BOW_PIECES.back })) },
    oarZs: spread(at(OAR_ROW.from).z, at(OAR_ROW.to).z, oars),
    shroudFeet,
    hatches: [
      { u: base(0.3), width: 1.4, depth: 1.6 },
      { u: base(-0.25), width: 1.3, depth: 1.4 },
    ],
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1, 2). */
const LAYOUTS = [0, 1, 2].map(createLayout);

export const galleassLayout = (level: number): GalleassLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];

/**
 * Répartition des canons d'un bord (stats.cannonsPerSide) entre la batterie et les pièces du pont, selon l'ordre
 * d'achat (d'abord la batterie) : 8 = 4 + 4 au départ, 9 = 5 + 4, 10 = 5 + 5 … 16 = 8 + 8 (galéasse capitane).
 */
export function galleassArmament(perSide: number, layout: GalleassLayout): { battery: number; deck: number } {
  const battery = Math.ceil(perSide / 2);
  return { battery: Math.min(battery, layout.batterySlots.length), deck: Math.min(perSide - battery, layout.deckSlots.length) };
}
