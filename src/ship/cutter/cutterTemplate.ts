import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { cutterLamps } from './cutterLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCannonGeometry, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween, type GaffSailShape } from '../parts/sails';
import { alongMast, CUTTER_LENGTH, DECK_Y, MAST_LENGTH, RAKE, type CutterLayout } from './cutterLayout';

/** Hauteur de la bôme au-dessus du pont, le long du mât : le gréement aurique pivote autour du mât à cette hauteur. */
export const BOOM_HEIGHT = 1.85;

/**
 * Grand-voile aurique, dans le repère du gréement (plan x = 0, vers l'arrière, origine au mât à la hauteur de la bôme) :
 * immense, à corne très apiquée ; sa bôme déborde largement de la poupe.
 */
const MAIN_SAIL: GaffSailShape = {
  tack: new THREE.Vector3(0, 0, -0.25),
  clew: new THREE.Vector3(0, 0, -8.6),
  throat: new THREE.Vector3(0, 7.6, -0.25),
  peak: new THREE.Vector3(0, 11.2, -6.7),
  bulge: 0.8,
};
/** Flèche : voile triangulaire entre la corne et la tête du mât de flèche (même repère). */
export const GAFF_TOPSAIL = { tack: new THREE.Vector3(0, 7.9, -0.3), head: new THREE.Vector3(0, 12.6, -0.2), clew: new THREE.Vector3(0, 11, -6.3), bulge: 0.35 };
/** Hunier volant du cotre armé : voile carrée devant le mât (`along` : hauteur de sa vergue le long du mât). */
export const FLYING_TOPSAIL = { along: 12.3, width: 5.6, height: 3.3 };
export const FLAG = { length: 1.3, height: 0.85 };

export interface CutterTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  mainSail: THREE.BufferGeometry;
  gaffTopsail: THREE.BufferGeometry;
  headsails: THREE.BufferGeometry[];
  topsail: THREE.BufferGeometry;
  topsailYard: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  boom: THREE.BufferGeometry;
  gaff: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  swivel: THREE.BufferGeometry;
  gunport: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, armé) et par livrée. */
const templates = new Map<CutterLayout, Map<Livery, CutterTemplate>>();

export function cutterTemplateFor(layout: CutterLayout, livery: Livery): CutterTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

/** Longueur des voiles et de la bôme du cotre armé, par rapport au cotre de base (sa coque est plus longue). */
export const rigStretch = (L: CutterLayout) => 1 + ((L.length - CUTTER_LENGTH) / CUTTER_LENGTH) * 0.7;

function buildTemplate(L: CutterLayout, livery: Livery): CutterTemplate {
  const { hull } = L;
  const at = (u: number) => hull.stationAt(u);
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont ras et lisses ; tableau arrière, étrave droite.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.985, 0.97, 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, -0.98, 0.96);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.07), identity);
    batch.add(p.trim, hull.buildRail(side, 0.6, 0.02, 0.05), identity);
  }
  const stern = at(-1);
  const bow = at(1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.1, 0.1, 0.12), tf(0, stern.gunwale, stern.z));
  batch.add(p.window, box(0.34, 0.22, 0.04), tf(0, stern.gunwale - 0.42, stern.z - 0.03));
  batch.add(p.trim, box(0.13, bow.gunwale - bow.keel + 0.25, 0.16), tf(0, (bow.gunwale + bow.keel) / 2, bow.z - 0.04, -0.04));

  // Claire-voie à l'arrière, écoutille devant elle, capot de descente au pied du mât.
  const skylight = L.z(-2.7);
  batch.add(p.wood, box(0.9, 0.32, 1.1), tf(0, DECK_Y + 0.16, skylight));
  batch.add(p.window, box(0.7, 0.05, 0.9), tf(0, DECK_Y + 0.34, skylight, 0, 0, 0.12));
  batch.add(p.dark, box(1, 0.1, 0.9), tf(0, DECK_Y + 0.05, L.z(-0.9)));
  batch.add(p.trim, box(1.1, 0.07, 1), tf(0, DECK_Y + 0.02, L.z(-0.9)));
  batch.add(p.wood, box(0.6, 0.4, 0.6), tf(0, DECK_Y + 0.2, L.mastZ - 0.75));

  // Mât (pomme, hampe du pavillon), bittes du beaupré, beaupré horizontal très long.
  const mid = alongMast(L.mastZ, MAST_LENGTH / 2);
  batch.add(p.wood, new THREE.CylinderGeometry(0.11, 0.19, MAST_LENGTH, 8), tf(0, mid.y, mid.z, -RAKE));
  batch.add(p.dark, new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), tf(0, L.mastTop.y + 0.04, L.mastTop.z, -RAKE));
  const cap = alongMast(L.mastZ, 10.6);
  batch.add(p.dark, box(0.36, 0.12, 0.5), tf(0, cap.y, cap.z, -RAKE));
  const ring = alongMast(L.mastZ, BOOM_HEIGHT - 0.25);
  batch.add(p.dark, new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8), tf(0, ring.y, ring.z, -RAKE));
  const heel = L.bowsprit.base;
  for (const x of [-0.24, 0.24]) batch.add(p.wood, box(0.16, 0.5, 0.16), tf(x, DECK_Y + 0.25, heel.z - 0.15));
  batch.add(p.wood, box(0.7, 0.12, 0.16), tf(0, DECK_Y + 0.42, heel.z - 0.15));
  batch.add(p.wood, cylinderBetween(heel, L.bowsprit.tip, 0.13, 0.07), identity);

  // Un peu de cargaison, au centre et à l'avant : les flancs restent libres pour les canons.
  addBarrel(batch, p, tf(0.55, DECK_Y, L.z(3.2)));
  addBarrel(batch, p, tf(-0.55, DECK_Y, L.z(3.3), 0, 0.5));
  addCrate(batch, p, tf(0, DECK_Y, L.z(-1.9), 0, 0.15));
  addRopeCoil(batch, p, tf(0.45, DECK_Y, L.mastZ - 0.1));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, L.mastZ + 0.3));
  addLantern(batch, p, tf(-0.8, stern.gunwale, stern.z + 0.15));

  const topsailYard = new THREE.CylinderGeometry(0.06, 0.06, FLYING_TOPSAIL.width + 0.5, 6);
  topsailYard.rotateZ(Math.PI / 2);
  addLampFixtures(batch, p, cutterLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    mainSail: buildGaffSail(MAIN_SAIL),
    gaffTopsail: buildTriangleSail(GAFF_TOPSAIL.head.clone().sub(GAFF_TOPSAIL.tack), GAFF_TOPSAIL.clew.clone().sub(GAFF_TOPSAIL.tack), GAFF_TOPSAIL.bulge),
    headsails: L.headsails.map((s) => buildTriangleSail(s.head.clone().sub(s.tack), s.clew.clone().sub(s.tack), s.bulge)),
    topsail: buildSquareSail(FLYING_TOPSAIL.width, FLYING_TOPSAIL.height, 0.45),
    topsailYard,
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    boom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, MAIN_SAIL.clew.z - 0.3), 0.1, 0.07),
    gaff: cylinderBetween(MAIN_SAIL.throat, MAIN_SAIL.peak, 0.07, 0.05),
    rudder: buildRudderGeometry(1.5),
    cannon: buildCarriageGunGeometry(),
    swivel: buildCannonGeometry(),
    gunport: new THREE.BoxGeometry(0.05, 0.32, 0.42),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Haubans, étais des trois voiles d'avant, bastaques, sous-barbe et haubans de beaupré. */
function buildRigging(L: CutterLayout): THREE.BufferGeometry {
  const { hull } = L;
  const station = (z: number) => hull.stationAt(z / hull.halfLength);
  const head = alongMast(L.mastZ, 10.4);
  const bow = hull.stationAt(1);
  const points: THREE.Vector3[] = [];
  for (const s of L.headsails) points.push(s.head, s.tack);
  points.push(L.bowsprit.tip, new THREE.Vector3(0, 0.3, bow.z - 0.05));
  for (const side of [1, -1]) {
    for (const dz of [-0.2, -0.8, -1.4]) {
      const s = station(L.mastZ + dz);
      points.push(head, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
    }
    // Bastaques : de la tête du mât de flèche au plat-bord, loin derrière.
    const back = station(L.z(-2.6));
    points.push(alongMast(L.mastZ, 13.2), new THREE.Vector3(side * back.halfWidth * 0.98, back.gunwale, back.z));
    const fore = station(bow.z - 0.9);
    points.push(L.bowsprit.tip, new THREE.Vector3(side * fore.halfWidth, fore.gunwale - 0.3, fore.z));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
