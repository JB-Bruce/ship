import * as THREE from 'three';
import { SAIL_BILLOW, WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { HullShape } from '../parts/hullShape';
import { sailSegments } from '../parts/sails';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';

/** Longueur de référence du modèle (m). */
export const SLOOP_LENGTH = 12;

/** Coque pontée du sloop, avec pavois (bordage montant au-dessus du pont). */
export const SLOOP_HULL = new HullShape(
  [
    [-1, 0.72, 1.45, -0.6],
    [-0.75, 0.9, 1.3, -0.9],
    [-0.4, 0.99, 1.22, -1.05],
    [0, 1, 1.2, -1.1],
    [0.35, 0.94, 1.24, -1.05],
    [0.62, 0.76, 1.32, -0.9],
    [0.82, 0.5, 1.45, -0.6],
    [0.95, 0.22, 1.58, -0.2],
    [1, 0.02, 1.65, 0.3],
  ],
  SLOOP_LENGTH / 2,
  1.9,
);

// Agencement (repère : proue +Z, bâbord +X, flottaison y = 0).
export const DECK_Y = 0.8;
export const MAST_Z = SLOOP_HULL.stationAt(0.12).z;
export const MAST_TOP = 12.6;
/** Hauteur de la bôme ; le gréement aurique pivote autour du mât à cette hauteur. */
export const BOOM_Y = DECK_Y + 1.7;
/** Grand-voile aurique, dans le repère du gréement (plan x = 0, vers l'arrière) : amure, point d'écoute, pic, gorge. */
const MAIN = {
  tack: new THREE.Vector3(0, 0, -0.25),
  clew: new THREE.Vector3(0, 0, -6),
  peak: new THREE.Vector3(0, 8.7, -4.4),
  throat: new THREE.Vector3(0, 6.9, -0.25),
  bulge: 0.7,
};
export const BOWSPRIT_TIP = new THREE.Vector3(0, 2.35, 9);
/** Foc, relatif à son point d'amure (le bout du beaupré). */
const JIB = { head: new THREE.Vector3(0, 11.3, MAST_Z + 0.2), clew: new THREE.Vector3(0, 2.1, 3.4), bulge: 0.5 };
export const FLAG = { length: 1.4, height: 0.9, y: MAST_TOP + 0.1 };

export interface SloopTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  mainSail: THREE.BufferGeometry;
  patches: THREE.BufferGeometry;
  jib: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  patchMaterial: THREE.Material | null;
  boom: THREE.BufferGeometry;
  gaff: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  gunport: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  rigLines: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

const templates = new Map<Livery, SloopTemplate>();

export function sloopTemplateFor(livery: Livery): SloopTemplate {
  let template = templates.get(livery);
  if (!template) {
    template = buildTemplate(livery);
    templates.set(livery, template);
  }
  return template;
}

/** Cylindre tendu entre deux points. */
function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segments = 6): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(r1, r0, dir.length(), segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

function buildTemplate(livery: Livery): SloopTemplate {
  const hullShape = SLOOP_HULL;
  const at = (u: number) => hullShape.stationAt(u);
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont et lisses.
  const hull = hullShape.buildHull();
  batch.add(p.hull, hull, identity);
  batch.add(p.hullInside, hull.clone(), identity);
  batch.add(p.floor, hullShape.buildFloor(DECK_Y, -0.985, 0.97, 0.97), identity);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hullShape.buildRail(side, 1, 0, 0.07), identity);
    batch.add(p.trim, hullShape.buildRail(side, 0.62, 0.02, 0.05), identity);
    batch.add(p.trim, hullShape.buildRail(side, 0.4, 0.02, 0.035), identity);
  }
  addDeckSeams(batch, p.dark, hullShape, DECK_Y, -0.98, 0.96);
  const stern = at(-1);
  const bow = at(1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.1, 0.1, 0.12), tf(0, stern.gunwale, stern.z));
  for (const x of [-0.45, 0.45]) batch.add(p.window, box(0.35, 0.28, 0.04), tf(x, stern.gunwale - 0.45, stern.z - 0.03));
  batch.add(p.trim, box(0.12, bow.gunwale - bow.keel + 0.3, 0.16), tf(0, (bow.gunwale + bow.keel) / 2, bow.z - 0.05, -0.2));

  // Cabine arrière et écoutille.
  batch.add(p.wood, box(1.7, 0.55, 1.8), tf(0, DECK_Y + 0.275, -3.5));
  batch.add(p.trim, box(1.85, 0.08, 1.95), tf(0, DECK_Y + 0.59, -3.5));
  for (const side of [1, -1]) batch.add(p.window, box(0.04, 0.2, 0.4), tf(side * 0.86, DECK_Y + 0.33, -3.5));
  batch.add(p.dark, box(1.1, 0.12, 1.0), tf(0, DECK_Y + 0.06, -1.2));
  batch.add(p.trim, box(1.2, 0.08, 1.1), tf(0, DECK_Y + 0.02, -1.2));

  // Mât, pomme, hampe et beaupré.
  batch.add(p.wood, new THREE.CylinderGeometry(0.12, 0.17, MAST_TOP - DECK_Y, 8), tf(0, (MAST_TOP + DECK_Y) / 2, MAST_Z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), tf(0, MAST_TOP + 0.04, MAST_Z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.03, 0.03, 1, 4), tf(0, MAST_TOP + 0.5, MAST_Z));
  for (const y of [BOOM_Y - 0.25, BOOM_Y + MAIN.throat.y]) batch.add(p.dark, new THREE.CylinderGeometry(0.19, 0.19, 0.1, 8), tf(0, y, MAST_Z));
  batch.add(p.wood, cylinderBetween(new THREE.Vector3(0, 1.45, 5.4), BOWSPRIT_TIP, 0.12, 0.07), identity);


  // Cargaison et accastillage, au centre du pont : les flancs restent libres pour les canons (z de -3 à 1,8).
  addBarrel(batch, p, tf(0.55, DECK_Y, 2.75));
  addBarrel(batch, p, tf(-0.55, DECK_Y, 2.75, 0, 0.6));
  addBarrel(batch, p, tf(0, DECK_Y, 3.35, 0, 1.2));
  addCrate(batch, p, tf(0.45, DECK_Y, -2.15, 0, 0.2));
  addCrate(batch, p, tf(-0.45, DECK_Y, -2.2, 0, -0.3));
  addRopeCoil(batch, p, tf(0.4, DECK_Y, 4.9));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, MAST_Z - 0.6));
  addLantern(batch, p, tf(-0.9, stern.gunwale, stern.z + 0.15));

  return {
    palette: p,
    statics: batch.build(),
    mainSail: buildMainSail(),
    patches: buildMainPatches(),
    jib: buildJib(),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    patchMaterial: livery.sailPatch === null ? null : std(livery.sailPatch, { side: THREE.DoubleSide }),
    boom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, MAIN.clew.z - 0.3), 0.09, 0.07),
    gaff: cylinderBetween(MAIN.throat, MAIN.peak, 0.07, 0.05),
    rudder: buildRudderGeometry(1.5),
    cannon: buildCarriageGunGeometry(),
    gunport: new THREE.BoxGeometry(0.05, 0.42, 0.5),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(),
    rigLines: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, MAST_TOP - 0.6 - BOOM_Y, 0), new THREE.Vector3(0, 0, MAIN.clew.z)]),
    waterMask: hullShape.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Grille qui épouse un quadrilatère (s le long de la bordure, t vers le haut), avec un léger creux sur X. */
function quadSail(
  s0: number,
  s1: number,
  t0: number,
  t1: number,
  n: number,
  offset: number,
): THREE.BufferGeometry {
  const { tack, clew, peak, throat, bulge } = MAIN;
  const point = (s: number, t: number) => {
    const bottom = new THREE.Vector3().lerpVectors(tack, clew, s);
    const top = new THREE.Vector3().lerpVectors(throat, peak, s);
    const p = bottom.lerp(top, t);
    p.x = bulge * 16 * s * (1 - s) * t * (1 - t) + offset;
    return p;
  };
  const positions: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const p = point(THREE.MathUtils.lerp(s0, s1, i / n), THREE.MathUtils.lerp(t0, t1, j / n));
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      index.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function buildMainSail(): THREE.BufferGeometry {
  return quadSail(0, 1, 0, 1, sailSegments(Math.max(MAIN.tack.distanceTo(MAIN.clew), MAIN.tack.distanceTo(MAIN.throat))), 0);
}

/** Pièces rapiécées, posées juste à côté de la toile. */
function buildMainPatches(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  for (const [s, t, ds, dt] of [[0.25, 0.3, 0.12, 0.1], [0.6, 0.62, 0.1, 0.08], [0.45, 0.12, 0.08, 0.07]]) {
    batch.add(key, quadSail(s, s + ds, t, t + dt, 2, 0.02), new THREE.Matrix4());
  }
  return batch.build()[0].geometry;
}

/** Foc triangulaire, origine au point d'amure (bout du beaupré). */
function buildJib(): THREE.BufferGeometry {
  const head = JIB.head.clone().sub(BOWSPRIT_TIP);
  const clew = JIB.clew.clone().sub(BOWSPRIT_TIP);
  const n = sailSegments(Math.max(head.length(), clew.length()), SAIL_BILLOW.triangleFacet);
  const positions: number[] = [];
  const index: number[] = [];
  const ids: number[][] = [];
  for (let i = 0; i <= n; i++) {
    ids.push([]);
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const w = 1 - u - v;
      const p = head.clone().multiplyScalar(u).add(clew.clone().multiplyScalar(v));
      p.x = JIB.bulge * 27 * u * v * w;
      ids[i].push(positions.length / 3);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      index.push(ids[i][j], ids[i + 1][j], ids[i][j + 1]);
      if (j < n - i - 1) index.push(ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Haubans, étai de foc et sous-barbe, en segments de ligne. */
function buildRigging(): THREE.BufferGeometry {
  const masthead = new THREE.Vector3(0, MAST_TOP - 0.6, MAST_Z);
  const points: THREE.Vector3[] = [masthead, BOWSPRIT_TIP, BOWSPRIT_TIP, new THREE.Vector3(0, 0.35, SLOOP_HULL.stationAt(1).z - 0.1)];
  for (const side of [1, -1]) {
    for (const u of [0.04, -0.06, -0.16]) {
      const s = SLOOP_HULL.stationAt(u);
      points.push(masthead, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
