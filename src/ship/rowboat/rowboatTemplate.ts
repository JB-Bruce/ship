import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildRudderGeometry, flagMaterialFor, paletteFor } from '../parts/common';
import { HullShape } from '../parts/hullShape';
import { addBarrel, addSailor, buildCannonGeometry, type Palette } from '../parts/props';

/** Longueur de référence du modèle (m). */
export const ROWBOAT_LENGTH = 5;

/** Coque basse et ouverte de la barque. */
export const ROWBOAT_HULL = new HullShape(
  [
    [-1, 0.6, 0.55, -0.22],
    [-0.7, 0.88, 0.47, -0.28],
    [-0.3, 0.99, 0.43, -0.3],
    [0.1, 1, 0.43, -0.3],
    [0.45, 0.88, 0.47, -0.28],
    [0.75, 0.6, 0.55, -0.22],
    [0.93, 0.28, 0.66, -0.12],
    [1, 0.03, 0.72, 0.05],
  ],
  ROWBOAT_LENGTH / 2,
  0.85,
);

export const FLOOR_Y = 0.05;
/** Bancs des rameurs (deux rameurs par banc, un aviron chacun). */
export const ROWER_BENCHES_U = [-0.3, 0.15];
export const BOW_GUN_U = 0.8;
export const FLAG = { length: 0.7, height: 0.45, y: 2.1 };

export interface RowboatTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  oar: THREE.BufferGeometry;
  rudder: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  waterMask: THREE.BufferGeometry;
}

const templates = new Map<Livery, RowboatTemplate>();

export function rowboatTemplateFor(livery: Livery): RowboatTemplate {
  let template = templates.get(livery);
  if (!template) {
    template = buildTemplate(livery);
    templates.set(livery, template);
  }
  return template;
}

function buildTemplate(livery: Livery): RowboatTemplate {
  const hullShape = ROWBOAT_HULL;
  const at = (u: number) => hullShape.stationAt(u);
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  const hull = hullShape.buildHull();
  batch.add(p.hull, hull, identity);
  batch.add(p.hullInside, hull.clone(), identity);
  batch.add(p.floor, hullShape.buildFloor(FLOOR_Y, -0.95, 0.85, 0.88), identity);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hullShape.buildRail(side, 1, 0, 0.045), identity);
    batch.add(p.trim, hullShape.buildRail(side, 0.55, 0.015, 0.03), identity);
  }
  const stern = at(-1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.06, 0.06, 0.08), tf(0, stern.gunwale, stern.z));

  // Bancs : barreur à l'arrière, deux bancs de rameurs, et tolets pour chaque aviron.
  const sternSeat = at(-0.78);
  batch.add(p.wood, box(2 * sternSeat.halfWidth * 0.95, 0.05, 0.45), tf(0, 0.27, sternSeat.z));
  for (const u of ROWER_BENCHES_U) {
    const s = at(u);
    batch.add(p.wood, box(2 * s.halfWidth * 0.97, 0.05, 0.24), tf(0, 0.24, s.z));
    for (const side of [1, -1]) {
      batch.add(p.dark, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4), tf(side * (s.halfWidth - 0.02), s.gunwale + 0.06, s.z + 0.32));
      // Les rameurs tournent le dos à la proue.
      addSailor(batch, p, tf(side * 0.3, 0.29, s.z, 0, Math.PI), { pose: 'sit', shirt: side === 1 ? p.shirt : p.shirtRed, headwear: 'bandana' });
    }
  }
  addSailor(batch, p, tf(0.1, 0.32, sternSeat.z + 0.05), { pose: 'sit', shirt: p.shirt, headwear: 'tricorn' });
  addSailor(batch, p, tf(0, FLOOR_Y, at(0.55).z), { pose: 'stand', shirt: p.shirt, headwear: 'tricorn' });
  addBarrel(batch, p, tf(-0.3, FLOOR_Y, at(0.4).z, 0, 0, 0, 0.75));

  // Hampe du pavillon sur le tableau arrière.
  batch.add(p.dark, new THREE.CylinderGeometry(0.025, 0.03, FLAG.y + 0.3 - stern.gunwale, 5), tf(0, (FLAG.y + 0.3 + stern.gunwale) / 2, stern.z + 0.05));

  return {
    palette: p,
    statics: batch.build(),
    oar: buildOar(),
    rudder: buildRudderGeometry(0.7),
    cannon: buildCannonGeometry(),
    flagMaterial: flagMaterialFor(livery),
    waterMask: hullShape.buildWaterMask(),
  };
}

/** Aviron couché selon +X : poignée à l'intérieur (x < 0), pelle au bout (x ≈ 1,7). Origine au tolet. */
function buildOar(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.CylinderGeometry(0.025, 0.025, 2.3, 5), tf(0.4, 0, 0, 0, 0, Math.PI / 2));
  batch.add(key, new THREE.BoxGeometry(0.45, 0.025, 0.14), tf(1.45, 0, 0));
  return batch.build()[0].geometry;
}
