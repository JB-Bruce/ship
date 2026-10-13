import * as THREE from 'three';
import { DECK_CREW, WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { HullShape } from '../parts/hullShape';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween, type GaffSailShape } from '../parts/sails';

/** Longueur du modèle (m). */
export const SCHOONER_LENGTH = 15;

/** Coque longue, fine et basse sur l'eau, pont ras ; la tonture remonte vers l'étrave. */
export const SCHOONER_HULL = new HullShape(
  [
    [-1, 0.7, 1.55, -0.7],
    [-0.75, 0.88, 1.38, -1.05],
    [-0.4, 0.98, 1.3, -1.25],
    [0, 1, 1.28, -1.3],
    [0.35, 0.93, 1.33, -1.2],
    [0.62, 0.74, 1.42, -1],
    [0.82, 0.48, 1.56, -0.65],
    [0.95, 0.2, 1.7, -0.2],
    [1, 0.02, 1.78, 0.3],
  ],
  SCHOONER_LENGTH / 2,
  1.9,
);

const at = (u: number) => SCHOONER_HULL.stationAt(u);

// Agencement (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.85;
/** Inclinaison des mâts vers l'arrière (rad). */
export const RAKE = 0.08;
/** Mâts : pied sur le pont (z) et hauteur de la tête au-dessus du pont, le long du mât. */
export const FORE_MAST = { z: at(0.3).z, length: 12 };
export const MAIN_MAST = { z: at(-0.22).z, length: 12.8 };
/** Hauteur de la bôme au-dessus du pont, le long du mât : chaque gréement aurique pivote autour de son mât à cette hauteur. */
export const BOOM_HEIGHT = 1.6;

/** Point le long d'un mât incliné, à `along` m de son pied. */
export function alongMast(mastZ: number, along: number): THREE.Vector3 {
  return new THREE.Vector3(0, DECK_Y + along * Math.cos(RAKE), mastZ - along * Math.sin(RAKE));
}

/** Voiles auriques, dans le repère de leur gréement (plan x = 0, vers l'arrière, origine au mât à la hauteur de la bôme). */
const MAIN_SAIL: GaffSailShape = {
  tack: new THREE.Vector3(0, 0, -0.25),
  clew: new THREE.Vector3(0, 0, -6.6),
  throat: new THREE.Vector3(0, 7.6, -0.25),
  peak: new THREE.Vector3(0, 9.4, -4.4),
  bulge: 0.7,
};
const FORE_SAIL: GaffSailShape = {
  tack: new THREE.Vector3(0, 0, -0.25),
  clew: new THREE.Vector3(0, 0, -3.3),
  throat: new THREE.Vector3(0, 6, -0.25),
  peak: new THREE.Vector3(0, 7.4, -3),
  bulge: 0.55,
};
/** Flèche : voile triangulaire entre la corne de la grand-voile et la tête du grand mât (même repère). */
export const MAIN_TOPSAIL = { tack: new THREE.Vector3(0, 7.9, -0.3), head: new THREE.Vector3(0, 10.9, -0.2), clew: new THREE.Vector3(0, 9.3, -4.1), bulge: 0.35 };
/** Hunier de la goélette à hunier : voile carrée en tête du mât de misaine. */
export const TOPSAIL = { along: 11.4, width: 4.2, height: 2.6 };

export const BOWSPRIT = { base: new THREE.Vector3(0, 1.5, 6.4), tip: new THREE.Vector3(0, 2.7, 11.6) };
/** Focs : point d'amure, têtière et point d'écoute (repère du navire). */
const JIBS = [
  { tack: BOWSPRIT.tip, head: alongMast(FORE_MAST.z, 11.2), clew: new THREE.Vector3(0, 2.5, 6.1), bulge: 0.5 },
  { tack: new THREE.Vector3(0, 1.95, 7.35), head: alongMast(FORE_MAST.z, 8.6), clew: new THREE.Vector3(0, 2.1, 3.7), bulge: 0.45 },
] as const;
export const JIB_TACKS = JIBS.map((j) => j.tack);

export const MAIN_TOP = alongMast(MAIN_MAST.z, MAIN_MAST.length);
export const FORE_TOP = alongMast(FORE_MAST.z, FORE_MAST.length);
export const FLAG = { length: 1.4, height: 0.9 };

/** Canons sur affût, répartis régulièrement le long du pont entre ces z (de l'arrière vers l'avant). */
export const GUN_ZONE = { aft: -5, fore: 3.4 };

/** Pont de l'équipage animé (le hunier embarque un matelot de plus) : barreur à la barre franche, vigie à l'avant. */
export function schoonerDeck(extension: number): DeckPlan {
  return {
    hands: DECK_CREW.hands.schooner + DECK_CREW.handsPerExtension.schooner * extension,
    helm: { x: 0.35, y: DECK_Y, z: at(-0.9).z, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: at(0.8).z, facing: 0 },
    walks: deckWalks(DECK_Y, [0.6, -0.6], -4.6, 4.6),
    ropes: ropeSpots(DECK_Y, [FORE_MAST.z, MAIN_MAST.z], (z) => SCHOONER_HULL.stationAt(z / SCHOONER_HULL.halfLength).halfWidth),
    isOpenGun: () => true,
  };
}

export interface SchoonerTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  mainSail: THREE.BufferGeometry;
  foreSail: THREE.BufferGeometry;
  mainTopsail: THREE.BufferGeometry;
  jibs: THREE.BufferGeometry[];
  topsail: THREE.BufferGeometry;
  topsailYard: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  mainBoom: THREE.BufferGeometry;
  mainGaff: THREE.BufferGeometry;
  foreBoom: THREE.BufferGeometry;
  foreGaff: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  gunport: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

const templates = new Map<Livery, SchoonerTemplate>();

export function schoonerTemplateFor(livery: Livery): SchoonerTemplate {
  let template = templates.get(livery);
  if (!template) {
    template = buildTemplate(livery);
    templates.set(livery, template);
  }
  return template;
}

function buildTemplate(livery: Livery): SchoonerTemplate {
  const hull = SCHOONER_HULL;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont ras et lisses ; tableau arrière, étrave.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.985, 0.97, 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, -0.98, 0.96);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.07), identity);
    batch.add(p.trim, hull.buildRail(side, 0.62, 0.02, 0.05), identity);
    batch.add(p.trim, hull.buildRail(side, 0.35, 0.02, 0.035), identity);
  }
  const stern = at(-1);
  const bow = at(1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.1, 0.1, 0.12), tf(0, stern.gunwale, stern.z));
  for (const x of [-0.5, 0.5]) batch.add(p.window, box(0.36, 0.26, 0.04), tf(x, stern.gunwale - 0.45, stern.z - 0.03));
  batch.add(p.trim, box(0.12, bow.gunwale - bow.keel + 0.3, 0.16), tf(0, (bow.gunwale + bow.keel) / 2, bow.z - 0.05, -0.2));

  // Rouf bas à l'arrière (claire-voie), écoutille au milieu.
  batch.add(p.wood, box(1.5, 0.45, 1.6), tf(0, DECK_Y + 0.225, -4.6));
  batch.add(p.trim, box(1.62, 0.08, 1.72), tf(0, DECK_Y + 0.49, -4.6));
  for (const side of [1, -1]) batch.add(p.window, box(0.04, 0.18, 0.36), tf(side * 0.76, DECK_Y + 0.27, -4.6));
  batch.add(p.dark, box(1.1, 0.12, 1), tf(0, DECK_Y + 0.06, 0.3));
  batch.add(p.trim, box(1.2, 0.08, 1.1), tf(0, DECK_Y + 0.02, 0.3));

  // Mâts inclinés vers l'arrière (pommes, hampe du pavillon au grand mât), beaupré.
  for (const mast of [FORE_MAST, MAIN_MAST]) {
    const mid = alongMast(mast.z, mast.length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(0.12, 0.17, mast.length, 8), tf(0, mid.y, mid.z, -RAKE));
    const top = alongMast(mast.z, mast.length);
    batch.add(p.dark, new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8), tf(0, top.y + 0.04, top.z, -RAKE));
    const ring = alongMast(mast.z, BOOM_HEIGHT - 0.25);
    batch.add(p.dark, new THREE.CylinderGeometry(0.19, 0.19, 0.1, 8), tf(0, ring.y, ring.z, -RAKE));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.03, 0.03, 1, 4), tf(0, MAIN_TOP.y + 0.5, MAIN_TOP.z));
  batch.add(p.wood, cylinderBetween(BOWSPRIT.base, BOWSPRIT.tip, 0.13, 0.07), identity);

  // Cargaison et accastillage, au centre du pont : les flancs restent libres pour les canons.
  addBarrel(batch, p, tf(0.5, DECK_Y, 4.9));
  addBarrel(batch, p, tf(-0.5, DECK_Y, 4.9, 0, 0.6));
  addCrate(batch, p, tf(0.4, DECK_Y, -2.9, 0, 0.2));
  addCrate(batch, p, tf(-0.42, DECK_Y, -3, 0, -0.3));
  addRopeCoil(batch, p, tf(0.45, DECK_Y, FORE_MAST.z - 0.6));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, MAIN_MAST.z - 0.6));
  addLantern(batch, p, tf(-0.9, stern.gunwale, stern.z + 0.15));

  const topsailYard = new THREE.CylinderGeometry(0.06, 0.06, TOPSAIL.width + 0.4, 6);
  topsailYard.rotateZ(Math.PI / 2);
  return {
    palette: p,
    statics: batch.build(),
    mainSail: buildGaffSail(MAIN_SAIL),
    foreSail: buildGaffSail(FORE_SAIL),
    mainTopsail: buildTriangleSail(MAIN_TOPSAIL.head.clone().sub(MAIN_TOPSAIL.tack), MAIN_TOPSAIL.clew.clone().sub(MAIN_TOPSAIL.tack), MAIN_TOPSAIL.bulge),
    jibs: JIBS.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), j.bulge)),
    topsail: buildSquareSail(TOPSAIL.width, TOPSAIL.height, 0.35),
    topsailYard,
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    mainBoom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, MAIN_SAIL.clew.z - 0.3), 0.09, 0.07),
    mainGaff: cylinderBetween(MAIN_SAIL.throat, MAIN_SAIL.peak, 0.07, 0.05),
    foreBoom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, FORE_SAIL.clew.z - 0.25), 0.08, 0.06),
    foreGaff: cylinderBetween(FORE_SAIL.throat, FORE_SAIL.peak, 0.06, 0.045),
    rudder: buildRudderGeometry(1.6),
    cannon: buildCarriageGunGeometry(),
    gunport: new THREE.BoxGeometry(0.05, 0.36, 0.46),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Haubans des deux mâts, étai de foc vers le beaupré, étai entre les mâts, sous-barbe. */
function buildRigging(): THREE.BufferGeometry {
  const hull = SCHOONER_HULL;
  const foreHead = alongMast(FORE_MAST.z, FORE_MAST.length - 0.6);
  const mainHead = alongMast(MAIN_MAST.z, MAIN_MAST.length - 0.6);
  const points: THREE.Vector3[] = [
    foreHead, BOWSPRIT.tip,
    mainHead, alongMast(FORE_MAST.z, FORE_MAST.length - 1.5),
    BOWSPRIT.tip, new THREE.Vector3(0, 0.35, hull.stationAt(1).z - 0.1),
  ];
  for (const side of [1, -1]) {
    for (const [head, mastZ] of [[foreHead, FORE_MAST.z], [mainHead, MAIN_MAST.z]] as const) {
      for (const dz of [-0.3, -0.9, -1.5]) {
        const s = hull.stationAt((mastZ + dz) / hull.halfLength);
        points.push(head, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
