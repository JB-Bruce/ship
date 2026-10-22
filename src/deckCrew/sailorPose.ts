import * as THREE from 'three';
import type { SailorMeshes } from './sailorMeshes';

/** Hauteur de la hanche au-dessus des pieds (m), et des épaules au-dessus de la hanche. */
const HIP = 0.6;
const SHOULDER = 0.45;
const SHOULDER_X = 0.22;
const HIP_X = 0.09;
const NECK = 0.62;

/**
 * Pose d'un marin, dans le repère du navire : pieds en (x, y, z), tourné vers `facing` (0 = vers la proue, +π/2 = vers
 * bâbord). Angles en radians : buste penché en avant (`lean`) et de côté (`tilt`), tête tournée, bras levés vers
 * l'avant (`arm`) et écartés (`out`), jambes vers l'avant (`leg`), et culbute de tout le corps (`roll`, chute).
 */
export interface SailorPose {
  x: number;
  y: number;
  z: number;
  facing: number;
  bob: number;
  lean: number;
  tilt: number;
  headYaw: number;
  armL: number;
  armR: number;
  outL: number;
  outR: number;
  legL: number;
  legR: number;
  roll: number;
}

export function restPose(): SailorPose {
  return { x: 0, y: 0, z: 0, facing: 0, bob: 0, lean: 0, tilt: 0, headYaw: 0, armL: 0.1, armR: 0.1, outL: 0.08, outR: 0.08, legL: 0, legR: 0, roll: 0 };
}

// Temporaires (aucune allocation par image).
const base = new THREE.Matrix4();
const upper = new THREE.Matrix4();
const local = new THREE.Matrix4();
const part = new THREE.Matrix4();
const euler = new THREE.Euler();

/** out = parent × translation (x, y, z) × rotation (rx, ry, rz) dans l'ordre donné. */
function child(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, order: THREE.EulerOrder) {
  local.makeRotationFromEuler(euler.set(rx, ry, rz, order));
  local.setPosition(x, y, z);
  return out.multiplyMatrices(parent, local);
}

/** Place les parties d'un marin dans les lots de dessin. `ship` = matrice monde du navire. */
/** `tint` : teinte du reste du corps (blanc = sans effet ; gris pâle pour l'équipage d'un navire maudit). */
export function drawSailor(meshes: SailorMeshes, ship: THREE.Matrix4, p: SailorPose, shirt: THREE.Color, hat: 'tricorn' | 'bandana', tint: THREE.Color) {
  child(base, ship, p.x, p.y + p.bob, p.z, 0, p.facing, p.roll, 'YZX');
  child(upper, base, 0, HIP, 0, p.lean, 0, p.tilt, 'XZY');
  meshes.put('torso', upper, shirt);
  child(part, upper, 0, NECK, 0, 0, p.headYaw, 0, 'XYZ');
  meshes.put('head', part, tint);
  meshes.put(hat, part, tint);
  for (const side of [1, -1]) {
    const left = side === 1;
    child(part, upper, side * SHOULDER_X, SHOULDER, 0, -(left ? p.armL : p.armR), 0, side * (left ? p.outL : p.outR), 'XZY');
    meshes.put('arm', part, shirt);
    meshes.put('hand', part, tint);
    child(part, base, side * HIP_X, HIP, 0, -(left ? p.legL : p.legR), 0, 0, 'XYZ');
    meshes.put('leg', part, tint);
  }
}
