import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, sideTf, std } from '../parts/common';
import { addBarrel, addLantern, addRopeCoil, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { DECK_Y, type FireshipLayout } from './fireshipLayout';

/** Planches arrachées le long du bordé (u, hauteur, longueur, m), des deux bords. */
const MISSING_PLANKS: readonly (readonly [number, number, number])[] = [
  [-0.55, 1.2, 0.9],
  [-0.1, 0.75, 0.6],
  [0.3, 1.45, 0.8],
  [0.62, 0.95, 0.5],
];
/** Grappin : longueur de sa chaîne sous ce qui le porte, taille de ses crocs (m). */
const GRAPNEL = { drop: 1.1, hook: 0.22 };
export const FLAG = { length: 1.4, height: 0.9 };

export interface FireshipTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Basse voile et hunier (dans l'ordre de FireshipLayout.squareSails), leurs vergues. */
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  jib: THREE.BufferGeometry;
  /** Voile aurique d'artimon (repère de son gréement), sa bôme et sa corne ; grand brûlot seulement. */
  spanker: THREE.BufferGeometry | null;
  boom: THREE.BufferGeometry | null;
  gaff: THREE.BufferGeometry | null;
  sailMaterial: THREE.Material;
  /** Une flamme (pied à l'origine) : le feu qui couve sur les tonneaux. */
  flame: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (brûlot, grand brûlot) et par livrée. */
const templates = new Map<FireshipLayout, Map<Livery, FireshipTemplate>>();

export function fireshipTemplateFor(layout: FireshipLayout, livery: Livery): FireshipTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

function buildTemplate(L: FireshipLayout, livery: Livery): FireshipTemplate {
  const { hull } = L;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();

  // Coque, pont ras, lisses ; planches arrachées (trous sombres) ; tableau étroit, étrave.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.985, 0.97, 0.96), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, -0.98, 0.95);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.07), identity);
    batch.add(p.dark, hull.buildRail(side, 0.62, 0.02, 0.05), identity);
    for (const [u, y, length] of MISSING_PLANKS) batch.add(p.dark, box(0.05, 0.16, length), sideTf(hull, L.at(u), y, side, 0.02));
  }
  const stern = hull.stationAt(-1);
  const bow = hull.stationAt(1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.1, 0.1, 0.12), tf(0, stern.gunwale, stern.z));
  batch.add(p.trim, box(0.14, bow.gunwale - bow.keel + 0.3, 0.18), tf(0, (bow.gunwale + bow.keel) / 2, bow.z - 0.05, -0.05));
  addLantern(batch, p, tf(0, stern.gunwale, stern.z + 0.15));

  // La charge : tas de tonneaux de poudre (deux en bas, un dessus), fagots en travers, traînées de poudre entre eux.
  for (const keg of L.kegs) {
    addBarrel(batch, p, tf(keg.x - 0.22, DECK_Y, keg.z));
    addBarrel(batch, p, tf(keg.x + 0.22, DECK_Y, keg.z + 0.08, 0, 0.6));
    addBarrel(batch, p, tf(keg.x, DECK_Y + 0.5, keg.z + 0.04, 0, 1.2));
  }
  for (const z of L.fagots) {
    for (const [dx, dy] of [[-0.18, 0.12], [0.18, 0.12], [0, 0.34]] as const) {
      const bundle = new THREE.CylinderGeometry(0.16, 0.16, 1.9, 6);
      bundle.rotateZ(Math.PI / 2);
      batch.add(p.wood, bundle, tf(0, DECK_Y + dy, z + dx));
    }
    for (const x of [-0.6, 0.6]) batch.add(p.rope, new THREE.CylinderGeometry(0.18, 0.18, 0.06, 6), tf(x, DECK_Y + 0.22, z, 0, 0, Math.PI / 2));
  }
  const kegs = [...L.kegs].sort((a, b) => a.z - b.z);
  for (let i = 0; i < kegs.length - 1; i++) {
    const a = new THREE.Vector3(kegs[i].x, DECK_Y + 0.02, kegs[i].z);
    const b = new THREE.Vector3(kegs[i + 1].x, DECK_Y + 0.02, kegs[i + 1].z);
    batch.add(p.dark, cylinderBetween(a, b, 0.04, 0.04, 4), identity);
  }
  addRopeCoil(batch, p, tf(0.5, DECK_Y, L.mainMast.z - 0.8));

  // Grand mât, chouque et hune légère ; artimon du grand brûlot ; beaupré.
  const main = L.mainMast;
  batch.add(p.wood, new THREE.CylinderGeometry(0.12, 0.22, main.top - DECK_Y, 8), tf(0, (main.top + DECK_Y) / 2, main.z));
  batch.add(p.wood, box(1.4, 0.12, 1.1), tf(0, L.squareSails[0].yardY + 1.1, main.z - 0.1));
  batch.add(p.dark, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), tf(0, main.top + 0.05, main.z));
  if (L.mizzen) batch.add(p.wood, new THREE.CylinderGeometry(0.08, 0.15, L.mizzen.top - DECK_Y, 8), tf(0, (L.mizzen.top + DECK_Y) / 2, L.mizzen.z));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.14, 0.08), identity);

  // Grappins au bout de la grande vergue et du beaupré : il s'accroche à sa proie.
  const course = L.squareSails[0];
  for (const x of [-course.width / 2 - 0.2, course.width / 2 + 0.2]) addGrapnel(batch, p, new THREE.Vector3(x, course.yardY, course.mastZ + 0.13));
  addGrapnel(batch, p, L.bowsprit.tip);

  const yard = (width: number) => {
    const g = new THREE.CylinderGeometry(0.07, 0.07, width + 0.5, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  // Flamme en goutte : large en bas, effilée en haut (un icosaèdre étiré, la pointe vers le ciel).
  const flame = new THREE.IcosahedronGeometry(0.26, 0);
  const pos = flame.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const narrow = y > 0 ? 1 - y / 0.26 * 0.75 : 1;
    pos.setXYZ(i, pos.getX(i) * narrow, (y + 0.26) * 1.9, pos.getZ(i) * narrow);
  }
  flame.computeVertexNormals();
  const mz = L.mizzen;
  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.55)),
    yards: L.squareSails.map((s) => yard(s.width)),
    jib: buildTriangleSail(L.jib.head.clone().sub(L.jib.tack), L.jib.clew.clone().sub(L.jib.tack), 0.4),
    spanker: mz ? buildGaffSail(mz.sail) : null,
    boom: mz ? cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, mz.sail.clew.z - 0.2), 0.08, 0.06) : null,
    gaff: mz ? cylinderBetween(mz.sail.throat, mz.sail.peak, 0.07, 0.05) : null,
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    flame,
    rudder: buildRudderGeometry(1.7),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Un grappin pendu à sa chaîne sous `at` : tige et quatre crocs. */
function addGrapnel(batch: GeometryBatch, p: Palette, at: THREE.Vector3) {
  const foot = at.clone().setY(at.y - GRAPNEL.drop);
  batch.add(p.dark, cylinderBetween(at, foot, 0.02, 0.02, 4), new THREE.Matrix4());
  batch.add(p.metal, new THREE.CylinderGeometry(0.03, 0.03, 0.35, 5), tf(foot.x, foot.y - 0.17, foot.z));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const hook = new THREE.Vector3(foot.x + Math.cos(a) * GRAPNEL.hook, foot.y - 0.2, foot.z + Math.sin(a) * GRAPNEL.hook);
    batch.add(p.metal, cylinderBetween(new THREE.Vector3(foot.x, foot.y - 0.34, foot.z), hook, 0.025, 0.02, 4), new THREE.Matrix4());
  }
}

/** Haubans du grand mât (et de l'artimon), étais vers le beaupré et l'artimon, étai du foc, sous-barbe. */
function buildRigging(L: FireshipLayout): THREE.BufferGeometry {
  const { hull } = L;
  const station = (z: number) => hull.stationAt(z / hull.halfLength);
  const main = L.mainMast;
  const head = new THREE.Vector3(0, main.top - 0.6, main.z);
  const top = new THREE.Vector3(0, L.squareSails[0].yardY + 1.1, main.z);
  const bow = hull.stationAt(1);
  const points: THREE.Vector3[] = [L.jib.head, L.jib.tack, top, L.bowsprit.base.clone().lerp(L.bowsprit.tip, 0.4), L.bowsprit.tip, new THREE.Vector3(0, 0.4, bow.z - 0.05)];
  if (L.mizzen) points.push(new THREE.Vector3(0, L.mizzen.top - 0.4, L.mizzen.z), new THREE.Vector3(0, main.top - 4, main.z));
  for (const side of [1, -1]) {
    for (const dz of [-0.3, -0.9, -1.5]) {
      const s = station(main.z + dz);
      points.push(top, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
    }
    const back = station(main.z - 2.2);
    points.push(head, new THREE.Vector3(side * back.halfWidth * 0.98, back.gunwale, back.z));
    if (L.mizzen) {
      for (const dz of [-0.3, -0.9]) {
        const s = station(L.mizzen.z + dz);
        points.push(new THREE.Vector3(0, L.mizzen.top - 1, L.mizzen.z), new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
