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
 * font la marche), poupe en surplomb (quille qui remonte), tonture qui se relève un peu vers l'étrave fine (les canons
 * de chasse tirent par-dessus).
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.62, 2.4, -0.1],
  [-0.9, 0.8, 2.38, -0.5],
  [-0.72, 0.93, 2.35, -0.95],
  [-0.69, 0.94, 1.55, -1],
  [-0.35, 1, 1.5, -1.2],
  [0.15, 0.98, 1.5, -1.2],
  [0.5, 0.82, 1.6, -1.05],
  [0.75, 0.55, 1.7, -0.75],
  [0.92, 0.22, 1.78, -0.3],
  [1, 0.03, 1.82, 0.1],
];

// Hauteurs (identiques pour les deux longueurs ; repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.95;
/** Dunette : pont surélevé à l'arrière (étendue en u de base), avec sa balustrade au-dessus du pavois. */
export const POOP = { y: 1.95, from: -0.99, to: -0.69, railHeight: 0.5 };
/** Inclinaison des mâts vers l'avant (rad). */
export const RAKE = 0.1;
/**
 * Plateforme de proue (étendue en u de base) : un pont à peine surélevé où les canons de chasse, sur affût, tirent
 * par-dessus le pavois de l'étrave.
 */
export const BOW_PLATFORM = { y: DECK_Y + 0.67, from: 0.66, to: 0.98 };
/** Canons de chasse : écart de l'axe selon leur nombre, et place gardée entre l'affût et le bordé (m). */
const CHASE_XS: readonly (readonly number[])[] = [[], [0], [-0.4, 0.4], [-0.6, 0, 0.6]];
const CHASE_CLEARANCE = 0.45;
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
  /** Roue de gouvernail sur la dunette (centre de la roue) ; le barreur se tient derrière. */
  readonly wheel: { y: number; z: number };
  /** Canons de flanc, répartis régulièrement entre ces z. */
  readonly gunZone: { aft: number; fore: number };
  /** Affûts des canons de chasse sur la plateforme de proue, selon leur nombre (index = nombre de canons). */
  readonly chaseGuns: readonly (readonly { x: number; z: number }[])[];
  /** z des sabords d'aviron (de l'arrière vers l'avant). */
  readonly oarZs: readonly number[];
  /** Pont de l'équipage animé ; canons servis à découvert = ceux des flancs (les canons de chasse sont à l'étrave). */
  readonly deck: DeckPlan;
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
  // Canons de chasse : chaque affût aussi loin vers l'avant que la plateforme le laisse, la bouche au-dessus de l'étrave.
  const chaseGuns = CHASE_XS.map((xs) =>
    xs.map((x) => {
      let u = 1;
      while (u > 0.5 && hull.halfWidthAt(hull.stationAt(u), BOW_PLATFORM.y) < Math.abs(x) + CHASE_CLEARANCE) u -= 0.004;
      return { x, z: hull.stationAt(u).z };
    }),
  );
  const oars = OAR.count + OAR.perExtension * level;
  const [oarAft, oarFore] = [at(OAR.from).z, at(OAR.to).z];
  const poopFront = at(POOP.to).z;
  const wheel = { y: POOP.y + 0.85, z: at(-0.93).z + 0.55 };
  const deck: DeckPlan = {
    hands: DECK_CREW.hands.xebec + DECK_CREW.handsPerExtension.xebec * level,
    helm: { x: 0, y: POOP.y, z: wheel.z - 0.55, facing: 0 },
    lookout: { x: 0, y: BOW_PLATFORM.y, z: at(0.71).z, facing: 0 },
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
    wheel,
    gunZone: { aft: at(-0.48).z, fore: at(0.4).z },
    chaseGuns,
    oarZs: Array.from({ length: oars }, (_, i) => oarAft + ((oarFore - oarAft) * i) / (oars - 1)),
    deck,
  };
}

/** Un plan par nombre d'allongements (0, 1). */
const LAYOUTS = [0, 1].map(createLayout);

export const xebecLayout = (level: number): XebecLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
