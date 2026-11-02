import * as THREE from 'three';
import { DECK_CREW } from '../../config';
import { SHIP_TYPES } from '../../shipTypes';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { HullShape, type Station } from '../parts/hullShape';
import { hullStretch } from '../parts/hullStretch';
import type { GaffSailShape } from '../parts/sails';

/** Longueur du brûlot (m) : les positions écrites en « u de base » s'y rapportent. */
export const FIRESHIP_LENGTH = 13;
const BASE_HALF = FIRESHIP_LENGTH / 2;
/** Milieu (u de base) : c'est lui qui s'étire pour le grand brûlot. */
const WAIST = { from: -0.5, to: 0.4 };

/**
 * Gabarit de la coque (u de base) : vieux navire marchand, ventru, pont ras à peine relevé aux deux bouts ; tableau
 * arrière étroit, étrave ronde.
 */
const HULL_ROWS: [number, number, number, number][] = [
  [-1, 0.7, 2.2, -0.5],
  [-0.8, 0.88, 2.05, -1.1],
  [-0.5, 0.97, 1.95, -1.35],
  [0, 1, 1.9, -1.45],
  [0.4, 0.96, 1.95, -1.38],
  [0.7, 0.8, 2.05, -1.2],
  [0.88, 0.55, 2.2, -0.95],
  [0.97, 0.28, 2.35, -0.7],
  [1, 0.08, 2.45, -0.5],
];
const HALF_WIDTH = 2.2;

// Hauteurs (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 1.3;
/** Grand mât : hauteur de sa tête, de ses deux vergues (basse voile, hunier), largeur et hauteur des voiles (m). */
const MAIN = { top: 16, course: { y: 9.6, width: 8.4, height: 6.2 }, topsail: { y: 14.4, width: 6, height: 4.2 } };
/** Beaupré : pied sur le pont (u de base), pointe (hauteur, avancée devant l'étrave, m). */
const BOWSPRIT = { heel: 0.78, tipY: 3.8, reach: 4.6 };
/** Artimon du grand brûlot (u de base), sa tête, et la bôme de sa voile aurique au-dessus du pont (m). */
const MIZZEN = { u: -0.74, top: 11, boomAbove: 1.7 };

/** Une voile carrée : cote de son mât, hauteur de sa vergue, taille. */
export interface FireshipSquare {
  readonly mastZ: number;
  readonly yardY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Plan d'un brûlot (0) ou d'un grand brûlot (1, le milieu rallongé de 4 m, un petit artimon). `at(u)` : section à une
 * position pensée pour le brûlot de base.
 */
export interface FireshipLayout {
  readonly level: number;
  readonly length: number;
  readonly hull: HullShape;
  base(u: number): number;
  at(baseU: number): Station;
  readonly mainMast: { z: number; top: number };
  /** Basse voile et hunier du grand mât. */
  readonly squareSails: readonly FireshipSquare[];
  readonly bowsprit: { base: THREE.Vector3; tip: THREE.Vector3 };
  /** Foc : point d'amure (pointe du beaupré), têtière et point d'écoute. */
  readonly jib: { tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3 };
  /** Artimon et sa voile aurique (repère de son gréement, qui pivote à la hauteur `boomY`), grand brûlot seulement. */
  readonly mizzen: { z: number; top: number; boomY: number; sail: GaffSailShape } | null;
  /** La charge sur le pont : tas de tonneaux de poudre (centre, z), fagots (z), où couve le feu. */
  readonly kegs: readonly { x: number; z: number }[];
  readonly fagots: readonly number[];
  readonly deck: DeckPlan;
}

function createLayout(level: number): FireshipLayout {
  const added = (SHIP_TYPES.fireship.extensions ?? []).slice(0, level).reduce((sum, e) => sum + e.length, 0);
  const { half, zOf, base } = hullStretch(BASE_HALF, [{ ...WAIST, added }]);
  const hull = new HullShape(
    HULL_ROWS.map(([u, ...rest]) => [base(u), ...rest] as [number, number, number, number]),
    half,
    HALF_WIDTH,
  );
  const at = (u: number) => hull.stationAt(base(u));
  const mainZ = at(0.1).z;
  const tip = new THREE.Vector3(0, BOWSPRIT.tipY, zOf(BASE_HALF) + BOWSPRIT.reach);
  const bowsprit = { base: new THREE.Vector3(0, DECK_Y + 0.3, at(BOWSPRIT.heel).z), tip };
  const sternZ = hull.stationAt(-1).z;
  const mizzenZ = at(MIZZEN.u).z;
  const boomY = DECK_Y + MIZZEN.boomAbove;
  const width = (y: number) => (z: number) => hull.halfWidthAt(hull.stationAt(z / half), y);
  return {
    level,
    length: 2 * half,
    hull,
    base,
    at,
    mainMast: { z: mainZ, top: MAIN.top },
    squareSails: [
      { mastZ: mainZ, yardY: MAIN.course.y, width: MAIN.course.width, height: MAIN.course.height },
      { mastZ: mainZ, yardY: MAIN.topsail.y, width: MAIN.topsail.width, height: MAIN.topsail.height },
    ],
    bowsprit,
    jib: { tack: tip, head: new THREE.Vector3(0, MAIN.topsail.y - 1.2, mainZ + 0.2), clew: new THREE.Vector3(0, 3, mainZ + 3.4) },
    mizzen: level
      ? {
          z: mizzenZ,
          top: MIZZEN.top,
          boomY,
          sail: {
            tack: new THREE.Vector3(0, 0, -0.2),
            clew: new THREE.Vector3(0, 0, sternZ - mizzenZ - 1.2),
            throat: new THREE.Vector3(0, MIZZEN.top - boomY - 2.6, -0.2),
            peak: new THREE.Vector3(0, MIZZEN.top - boomY - 0.6, sternZ - mizzenZ - 0.4),
            bulge: 0.5,
          },
        }
      : null,
    kegs: [
      { x: 0.7, z: at(-0.62).z },
      { x: -0.6, z: at(-0.3).z },
      { x: 0.6, z: at(0.32).z },
      { x: -0.55, z: at(0.58).z },
      ...(level ? [{ x: 0.65, z: at(-0.05).z }, { x: -0.65, z: at(-0.78).z }] : []),
    ],
    fagots: [at(-0.45).z, at(0.45).z],
    deck: {
      hands: DECK_CREW.hands.fireship + DECK_CREW.handsPerExtension.fireship * level,
      helm: { x: 0, y: DECK_Y, z: at(-0.9).z, facing: 0 },
      lookout: { x: 0, y: DECK_Y, z: at(0.82).z, facing: 0 },
      walks: deckWalks(DECK_Y, [1, -1], at(-0.75).z, at(0.7).z),
      ropes: ropeSpots(DECK_Y, [mainZ], width(DECK_Y), 0.45),
      isOpenGun: () => false,
    },
  };
}

/** Un plan par nombre d'allongements (0 : brûlot, 1 : grand brûlot). */
const LAYOUTS = [0, 1].map(createLayout);

export const fireshipLayout = (level: number): FireshipLayout => LAYOUTS[Math.min(level, LAYOUTS.length - 1)];
