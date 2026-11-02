import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { HullShape } from '../parts/hullShape';
import { sailSegments } from '../parts/sails';
import { addBarrel, addCrate, addLantern, addRopeCoil, addSailor, buildCannonGeometry, type Palette } from '../parts/props';

/** Dimensions de référence du modèle (m). Il est ensuite mis à l'échelle selon ShipStats.length. */
export const LONGBOAT_LENGTH = 7.5;

/** Coque ouverte de la chaloupe : tableau arrière plat, étrave pointue. */
export const LONGBOAT_HULL = new HullShape(
  [
    [-1, 0.62, 0.78, -0.35],
    [-0.75, 0.85, 0.66, -0.42],
    [-0.45, 0.97, 0.58, -0.45],
    [-0.1, 1, 0.55, -0.45],
    [0.25, 0.97, 0.57, -0.45],
    [0.55, 0.82, 0.63, -0.42],
    [0.78, 0.58, 0.74, -0.35],
    [0.93, 0.3, 0.86, -0.2],
    [1, 0.02, 0.95, 0.1],
  ],
  LONGBOAT_LENGTH / 2,
  1.2,
);

// Agencement de la chaloupe (repère du modèle : proue +Z, bâbord +X, flottaison y = 0).
export const FLOOR_Y = 0.1;
export const MAST_U = 0.38;
export const SAIL = { width: 3, height: 3.6, yardY: 5, bulge: 0.45 };
export const FLAG = { length: 0.9, height: 0.6, y: 6.2 };
const MAST_TOP = 5.9;
const BENCHES_U = [-0.5, -0.15, 0.2, MAST_U];

/** Tout ce qui ne dépend que de la livrée : construit une fois, partagé par toutes les chaloupes de ce camp. */
export interface LongboatTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  sail: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  patches: { geometry: THREE.BufferGeometry; material: THREE.Material } | null;
  yard: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

const templates = new Map<Livery, LongboatTemplate>();

export function longboatTemplateFor(livery: Livery): LongboatTemplate {
  let template = templates.get(livery);
  if (!template) {
    template = buildTemplate(livery);
    templates.set(livery, template);
  }
  return template;
}

function buildTemplate(livery: Livery): LongboatTemplate {
  const hullShape = LONGBOAT_HULL;
  const at = (u: number) => hullShape.stationAt(u);
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque : la même géométrie vue de l'extérieur (couleur peinte) et de l'intérieur (bois brut).
  const hull = hullShape.buildHull();
  batch.add(p.hull, hull, identity);
  batch.add(p.hullInside, hull.clone(), identity);
  batch.add(p.floor, hullShape.buildFloor(FLOOR_Y, -0.97, 0.88, 0.9), identity);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hullShape.buildRail(side, 1, 0, 0.055), identity);
    batch.add(p.trim, hullShape.buildRail(side, 0.6, 0.02, 0.035), identity);
  }
  const stern = at(-1);
  const bowZ = at(1).z;
  batch.add(p.trim, box(2 * stern.halfWidth + 0.08, 0.08, 0.1), tf(0, stern.gunwale, stern.z));
  batch.add(p.trim, box(0.08, 1.4, 0.12), tf(0, 0.45, bowZ - 0.05, -0.2));

  // Bancs de nage, banc de barreur, tolets.
  for (const u of BENCHES_U) {
    const s = at(u);
    batch.add(p.wood, box(2 * s.halfWidth * 0.97, 0.06, u === MAST_U ? 0.34 : 0.26), tf(0, 0.35, s.z));
    if (u === MAST_U) continue;
    for (const side of [1, -1]) {
      batch.add(p.dark, new THREE.CylinderGeometry(0.025, 0.025, 0.16, 4), tf(side * (s.halfWidth - 0.03), s.gunwale + 0.08, s.z - 0.15));
    }
  }
  const sheets = at(-0.82);
  batch.add(p.wood, box(2 * sheets.halfWidth * 0.95, 0.06, 0.55), tf(0, 0.38, sheets.z));

  // Rames rangées sur les bancs, pelles vers l'arrière.
  for (const side of [1, -1]) {
    for (const x of [0.5, 0.68]) {
      batch.add(p.wood, new THREE.CylinderGeometry(0.028, 0.028, 3.6, 5), tf(side * x, 0.41, -0.8, Math.PI / 2));
      batch.add(p.wood, box(0.15, 0.025, 0.65), tf(side * x, 0.41, -2.45));
    }
  }

  // Mât, pomme et hampe du pavillon (la vergue est propre à chaque chaloupe : elle s'élargit avec la voilure).
  const mastZ = at(MAST_U).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.07, 0.1, MAST_TOP - FLOOR_Y, 7), tf(0, (MAST_TOP + FLOOR_Y) / 2, mastZ));
  batch.add(p.dark, new THREE.CylinderGeometry(0.1, 0.1, 0.06, 7), tf(0, MAST_TOP + 0.03, mastZ));
  batch.add(p.dark, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), tf(0, MAST_TOP + 0.3, mastZ));

  // Équipage : barreur à la barre, nageur au milieu, vigie debout à l'avant.
  addSailor(batch, p, tf(0.25, 0.42, sheets.z + 0.05), { pose: 'sit', shirt: p.shirt, headwear: 'tricorn' });
  addSailor(batch, p, tf(0, 0.4, at(-0.15).z), { pose: 'sit', shirt: p.shirtRed, headwear: 'bandana' });
  addSailor(batch, p, tf(0, FLOOR_Y, at(0.68).z), { pose: 'stand', shirt: p.shirt, headwear: 'tricorn' });

  // Cargaison.
  const barrelsZ = at(0.52).z;
  addBarrel(batch, p, tf(0.42, FLOOR_Y, barrelsZ));
  addBarrel(batch, p, tf(-0.42, FLOOR_Y, barrelsZ, 0, 0.8));
  addCrate(batch, p, tf(-0.1, FLOOR_Y, at(-0.32).z, 0, 0.3));
  addRopeCoil(batch, p, tf(0, FLOOR_Y, at(0.85).z));
  addLantern(batch, p, tf(-0.55, stern.gunwale, stern.z + 0.1));

  // Vergue couchée selon X, prête à être étirée en largeur.
  const yard = new THREE.CylinderGeometry(0.05, 0.05, SAIL.width + 0.4, 6);
  yard.rotateZ(Math.PI / 2);

  return {
    palette: p,
    statics: batch.build(),
    sail: buildSail(),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    patches: livery.sailPatch === null ? null : { geometry: buildPatches(), material: std(livery.sailPatch, { side: THREE.DoubleSide }) },
    yard,
    rudder: buildRudderGeometry(),
    cannon: buildCannonGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(mastZ),
    waterMask: hullShape.buildWaterMask(),
  };
}

const sailBulge = (x: number) => SAIL.bulge * (1 - ((2 * x) / SAIL.width) ** 2);

/** Voile carrée gonflée vers l'avant, ancrée en haut (y = 0) pour se carguer vers la vergue. */
function buildSail(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(SAIL.width, SAIL.height, sailSegments(SAIL.width), sailSegments(SAIL.height));
  geometry.translate(0, -SAIL.height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, sailBulge(pos.getX(i)));
  return geometry;
}

/** Pièces rapiécées, épousant la courbure de la voile côté arrière (celui qu'on voit en jouant). */
function buildPatches(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  for (const [x, y, w, h] of [[-0.7, -1.1, 0.55, 0.45], [0.6, -2.5, 0.5, 0.4], [0.2, -0.6, 0.35, 0.3]]) {
    const patch = new THREE.PlaneGeometry(w, h, 2, 2);
    patch.translate(x, y, 0);
    const pos = patch.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, sailBulge(pos.getX(i)) - 0.02);
    batch.add(key, patch, new THREE.Matrix4());
  }
  return batch.build()[0].geometry;
}

/** Haubans, étai et bras de vergue, en segments de ligne (un seul appel de rendu). */
function buildRigging(mastZ: number): THREE.BufferGeometry {
  const at = (u: number) => LONGBOAT_HULL.stationAt(u);
  const top = new THREE.Vector3(0, MAST_TOP - 0.2, mastZ);
  const points: THREE.Vector3[] = [top, new THREE.Vector3(0, 1.1, at(1).z - 0.05)];
  const aft = at(-0.92);
  for (const side of [1, -1]) {
    for (const u of [MAST_U - 0.1, MAST_U - 0.24]) {
      const s = at(u);
      points.push(top, new THREE.Vector3(side * s.halfWidth * 0.98, s.gunwale, s.z));
    }
    points.push(
      new THREE.Vector3(side * (SAIL.width / 2 + 0.1), SAIL.yardY, mastZ + 0.08),
      new THREE.Vector3(side * aft.halfWidth * 0.9, aft.gunwale, aft.z),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
