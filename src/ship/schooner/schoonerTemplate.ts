import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween, type GaffSailShape } from '../parts/sails';
import { alongMast, DECK_Y, FORE_MAST_LENGTH, MAIN_MAST_LENGTH, RAKE, type SchoonerLayout } from './schoonerLayout';

/** Hauteur de la bôme au-dessus du pont, le long du mât : chaque gréement aurique pivote autour de son mât à cette hauteur. */
export const BOOM_HEIGHT = 1.6;

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
/** Hunier de la goélette à hunier : voile carrée en tête du mât de misaine (`along` : hauteur de sa vergue le long du mât). */
export const TOPSAIL = { along: 11.4, width: 4.2, height: 2.6 };
export const FLAG = { length: 1.4, height: 0.9 };

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

/** Un gabarit par plan (de base, à hunier) et par livrée. */
const templates = new Map<SchoonerLayout, Map<Livery, SchoonerTemplate>>();

export function schoonerTemplateFor(layout: SchoonerLayout, livery: Livery): SchoonerTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: SchoonerLayout, livery: Livery): SchoonerTemplate {
  const { hull } = L;
  const at = (u: number) => hull.stationAt(u);
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
  const cabin = L.z(-4.6);
  batch.add(p.wood, box(1.5, 0.45, 1.6), tf(0, DECK_Y + 0.225, cabin));
  batch.add(p.trim, box(1.62, 0.08, 1.72), tf(0, DECK_Y + 0.49, cabin));
  for (const side of [1, -1]) batch.add(p.window, box(0.04, 0.18, 0.36), tf(side * 0.76, DECK_Y + 0.27, cabin));
  batch.add(p.dark, box(1.1, 0.12, 1), tf(0, DECK_Y + 0.06, L.z(0.3)));
  batch.add(p.trim, box(1.2, 0.08, 1.1), tf(0, DECK_Y + 0.02, L.z(0.3)));

  // Mâts inclinés vers l'arrière (pommes, hampe du pavillon au grand mât), beaupré.
  for (const [mastZ, length] of [[L.foreMastZ, FORE_MAST_LENGTH], [L.mainMastZ, MAIN_MAST_LENGTH]] as const) {
    const mid = alongMast(mastZ, length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(0.12, 0.17, length, 8), tf(0, mid.y, mid.z, -RAKE));
    const top = alongMast(mastZ, length);
    batch.add(p.dark, new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8), tf(0, top.y + 0.04, top.z, -RAKE));
    const ring = alongMast(mastZ, BOOM_HEIGHT - 0.25);
    batch.add(p.dark, new THREE.CylinderGeometry(0.19, 0.19, 0.1, 8), tf(0, ring.y, ring.z, -RAKE));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.03, 0.03, 1, 4), tf(0, L.mainTop.y + 0.5, L.mainTop.z));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.13, 0.07), identity);

  // Cargaison et accastillage, au centre du pont : les flancs restent libres pour les canons.
  addBarrel(batch, p, tf(0.5, DECK_Y, L.z(4.9)));
  addBarrel(batch, p, tf(-0.5, DECK_Y, L.z(4.9), 0, 0.6));
  addCrate(batch, p, tf(0.4, DECK_Y, L.z(-2.9), 0, 0.2));
  addCrate(batch, p, tf(-0.42, DECK_Y, L.z(-3), 0, -0.3));
  addRopeCoil(batch, p, tf(0.45, DECK_Y, L.foreMastZ - 0.6));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, L.mainMastZ - 0.6));
  addLantern(batch, p, tf(-0.9, stern.gunwale, stern.z + 0.15));

  const topsailYard = new THREE.CylinderGeometry(0.06, 0.06, TOPSAIL.width + 0.4, 6);
  topsailYard.rotateZ(Math.PI / 2);
  return {
    palette: p,
    statics: batch.build(),
    mainSail: buildGaffSail(MAIN_SAIL),
    foreSail: buildGaffSail(FORE_SAIL),
    mainTopsail: buildTriangleSail(MAIN_TOPSAIL.head.clone().sub(MAIN_TOPSAIL.tack), MAIN_TOPSAIL.clew.clone().sub(MAIN_TOPSAIL.tack), MAIN_TOPSAIL.bulge),
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), j.bulge)),
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
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Haubans des deux mâts, étai de foc vers le beaupré, étai entre les mâts, sous-barbe. */
function buildRigging(L: SchoonerLayout): THREE.BufferGeometry {
  const { hull } = L;
  const foreHead = alongMast(L.foreMastZ, FORE_MAST_LENGTH - 0.6);
  const mainHead = alongMast(L.mainMastZ, MAIN_MAST_LENGTH - 0.6);
  const points: THREE.Vector3[] = [
    foreHead, L.bowsprit.tip,
    mainHead, alongMast(L.foreMastZ, FORE_MAST_LENGTH - 1.5),
    L.bowsprit.tip, new THREE.Vector3(0, 0.35, hull.stationAt(1).z - 0.1),
  ];
  for (const side of [1, -1]) {
    for (const [head, mastZ] of [[foreHead, L.foreMastZ], [mainHead, L.mainMastZ]] as const) {
      for (const dz of [-0.3, -0.9, -1.5]) {
        const s = hull.stationAt((mastZ + dz) / hull.halfLength);
        points.push(head, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
