import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch } from '../parts/hullStretch';
import type { LateenSailShape } from '../parts/sails';

/** Longueur du chébec de base (m) : les positions écrites en « u de base » s'y rapportent. */
export const XEBEC_LENGTH = 21;
const BASE_HALF = XEBEC_LENGTH / 2;
/** Partie droite du milieu (u de base) : c'est elle qui s'étire quand le chébec est allongé. */
const WAIST = { from: -0.42, to: 0.38 };

/**
 * Gabarit de la coque (u de base) : longue, basse et étroite. Dunette basse à l'arrière (deux sections très proches
 * font la marche), poupe en surplomb (quille qui remonte), tonture qui se relève vers l'étrave fine.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.62, 2.4, -0.1],
  [-0.9, 0.8, 2.38, -0.5],
  [-0.72, 0.93, 2.35, -0.95],
  [-0.69, 0.94, 1.55, -1],
  [-0.35, 1, 1.5, -1.2],
  [0.15, 0.98, 1.5, -1.2],
  [0.5, 0.82, 1.62, -1.05],
  [0.75, 0.55, 1.85, -0.75],
  [0.92, 0.22, 2.1, -0.3],
  [1, 0.03, 2.25, 0.1],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.95;
/** Dunette : pont surélevé à l'arrière (étendue en u de base), avec sa balustrade au-dessus du pavois. */
export const POOP = { y: 1.95, from: -0.99, to: -0.69, railHeight: 0.5 };
/** Inclinaison des mâts vers l'avant (rad). */
export const RAKE = 0.1;
/** Hauteur des sabords de chasse (bouche des fûts), et leur écart de l'axe selon le nombre de canons de chasse. */
export const CHASE_Y = DECK_Y + 0.42;
const CHASE_SLOTS: readonly (readonly number[])[] = [[], [0], [-0.45, 0.45], [-0.45, 0, 0.45]];
/** Rames : hauteur des sabords d'aviron (sous le pont), longueur hors bord ; une paire de plus par allongement. */
export const OAR = { y: 0.62, outboard: 4.4, inboard: 0.6, from: -0.6, to: 0.52, count: 9, perExtension: 2 };

/** Point le long d'un mât incliné vers l'avant dont le pied est en `mastZ`, à `along` m de son pied. */
export function alongMast(mastZ: number, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, DECK_Y + along * Math.cos(RAKE), mastZ + along * Math.sin(RAKE));
}

/** Un mât : pied, et longueur le long du mât. */
export interface XebecMast {
  z: number;
  length: number;
}

/**
 * Une voile latine de chébec : son mât, la hauteur (le long du mât) où sa vergue le croise, et sa forme dans le repère
 * de son gréement (voir LateenSailShape).
 */
export interface XebecLateen {
  mast: XebecMast;
  along: number;
  sail: LateenSailShape;
}

/** Une voile carrée du grand mât : hauteur de sa vergue le long du mât, largeur et hauteur. */
export interface XebecSquareSail {
  along: number;
  width: number;
  height: number;
}

/**
 * Plan d'un chébec, de base ou allongé. Les positions le long de la coque sont en u de la coque ; `base(u)` convertit
 * une position pensée pour le chébec de base (le milieu s'étire, la dunette et l'avant glissent).
 */
export interface XebecLayout {
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  /** Station de la coque en u de base. */
  at(baseU: number): Station;
  readonly foreMast: XebecMast;
  readonly mainMast: XebecMast;
  readonly mizzenMast: XebecMast;
  /** Latines de misaine et d'artimon. */
  readonly fore: XebecLateen;
  readonly mizzen: XebecLateen;
  /** Basse voile et hunier du grand mât. */
  readonly course: XebecSquareSail;
  readonly topsail: XebecSquareSail;
  /** Hune du grand mât (le long du mât). */
  readonly topPlatform: number;
  /** Éperon : du pied de l'étrave à sa pointe. */
  readonly spur: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Canons de flanc, répartis régulièrement entre ces z. */
  readonly gunZone: { aft: number; fore: number };
  /** Sabords de chasse : écart de l'axe et z de la face du bordé (au centre : z de la face avant du coffre d'étrave). */
  readonly chasePorts: readonly { x: number; z: number }[];
  /** z des sabords d'aviron (de l'arrière vers l'avant). */
  readonly oarZs: readonly number[];
  /** Pont de l'équipage animé ; canons servis à découvert = ceux des flancs (les canons de chasse sont à l'étrave). */
  readonly deck: DeckPlan;
}

/** Canons de chasse : sabords à utiliser (index dans `chasePorts`) selon leur nombre. */
export function chaseSlots(count: number): readonly number[] {
  const xs = CHASE_SLOTS[Math.min(count, CHASE_SLOTS.length - 1)];
  return xs.map((x) => CHASE_SLOTS[CHASE_SLOTS.length - 1].indexOf(x));
}

function createLayout(level: number): XebecLayout {
  const added = (SHIP_TYPES.xebec.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, extra, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    2.3,
    0.75,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const bowShift = zOf(BASE_HALF) - BASE_HALF;
  const foreMast = { z: at(0.6).z, length: 11.5 };
  const mainMast = { z: at(0).z, length: 15 };
  const mizzenMast = { z: at(-0.6).z, length: 10.5 };
  const stem = at(1);
  // Sabords de chasse : le fût sort du bordé de l'étrave là où il est juste assez large ; au centre, par un coffre sur l'étrave.
  const chasePorts = CHASE_SLOTS[CHASE_SLOTS.length - 1].map((x) => {
    if (x === 0) return { x, z: stem.z + 0.1 };
    let u = 1;
    while (u > 0.5 && hull.halfWidthAt(hull.stationAt(u), CHASE_Y) < Math.abs(x) + 0.14) u -= 0.004;
    return { x, z: hull.stationAt(u).z };
  });
  const oars = OAR.count + OAR.perExtension * level;
  const [oarAft, oarFore] = [at(OAR.from).z, at(OAR.to).z];
  const poopFront = at(POOP.to).z;
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.xebec + DECK_CREW.handsPerExtension.xebec * level,
    helm: { x: 0, y: POOP.y, z: at(-0.88).z, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: at(0.72).z, facing: 0 },
    walks: [...deckWalks(DECK_Y, [0.6, -0.6], poopFront + 1.2, at(0.55).z), ...deckWalks(POOP.y, [0.7], at(-0.92).z, poopFront - 0.4)],
    ropes: ropeSpots(DECK_Y, [foreMast.z, mainMast.z, mizzenMast.z], (z) => hull.stationAt(z / half).halfWidth),
    isOpenGun: (mount) => mount.calibre === 'main',
  };
  return {
    length: XEBEC_LENGTH + extra,
    hull,
    base,
    at,
    foreMast,
    mainMast,
    mizzenMast,
    fore: {
      mast: foreMast,
      along: 7,
      sail: { tack: new THREE.Vector3(0, -4, 5.6), peak: new THREE.Vector3(0, 5.4, -4.4), clew: new THREE.Vector3(0, -4.9, -1.8), bulge: 0.6 },
    },
    mizzen: {
      mast: mizzenMast,
      along: 6,
      sail: { tack: new THREE.Vector3(0, -3.2, 4), peak: new THREE.Vector3(0, 5, -4.6), clew: new THREE.Vector3(0, -3.6, -2.9), bulge: 0.5 },
    },
    course: { along: 8.4, width: 8.2, height: 5.8 },
    topsail: { along: 13, width: 6, height: 3.9 },
    topPlatform: 9.2,
    spur: { base: new THREE.Vector3(0, 1.05, stem.z - 0.3), tip: new THREE.Vector3(0, 1.85, 13.3 + bowShift) },
    gunZone: { aft: at(-0.48).z, fore: at(0.4).z },
    chasePorts,
    oarZs: Array.from({ length: oars }, (_, i) => oarAft + ((oarFore - oarAft) * i) / (oars - 1)),
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const xebecLayout = (level: number): XebecLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
