import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Palette } from './props';

/** Le fût monte à 45° vers +X local (la direction de tir, comme les canons) ; son tourillon est à cette hauteur (m). */
const PIVOT = new THREE.Vector3(-0.05, 0.62, 0);
const TILT = Math.PI / 4;
/** Longueur du fût en arrière et en avant du tourillon (m), rayons de la culasse et de la bouche. */
const TUBE = { back: 0.3, front: 0.65, breech: 0.36, mouth: 0.3 };
const DIR = new THREE.Vector3(Math.cos(TILT), Math.sin(TILT), 0);

/** Bouche du mortier, dans le repère de son affût (là où l'obus part). */
export const MORTAR_MUZZLE = PIVOT.clone().addScaledVector(DIR, TUBE.front + 0.05);

/**
 * Mortier : un affût de bois massif (deux flasques sur une semelle) et un fût court et trapu, culasse arrondie,
 * pointé à 45° vers +X. Deux géométries (bois, métal), dans le repère de l'affût posé sur le pont ; l'ensemble pivote
 * autour de Y pour viser.
 */
export function buildMortarGeometry(): { bed: THREE.BufferGeometry; tube: THREE.BufferGeometry } {
  const key = new THREE.MeshBasicMaterial();
  const bed = new GeometryBatch();
  bed.add(key, new THREE.BoxGeometry(1.15, 0.28, 0.95), tf(0, 0.14, 0));
  for (const z of [-0.4, 0.4]) bed.add(key, new THREE.BoxGeometry(1, 0.42, 0.13), tf(-0.05, 0.47, z));

  const tube = new GeometryBatch();
  const along = (d: number) => PIVOT.clone().addScaledVector(DIR, d);
  const tilt = -(Math.PI / 2 - TILT);
  const length = TUBE.back + TUBE.front;
  const middle = along((TUBE.front - TUBE.back) / 2);
  tube.add(key, new THREE.CylinderGeometry(TUBE.mouth, TUBE.breech, length, 10), tf(middle.x, middle.y, 0, 0, 0, tilt));
  const mouth = along(TUBE.front);
  tube.add(key, new THREE.CylinderGeometry(TUBE.mouth + 0.06, TUBE.mouth + 0.06, 0.1, 10), tf(mouth.x, mouth.y, 0, 0, 0, tilt));
  const breech = along(-TUBE.back);
  tube.add(key, new THREE.SphereGeometry(TUBE.breech * 0.95, 10, 6), tf(breech.x, breech.y, 0));
  tube.add(key, new THREE.CylinderGeometry(0.09, 0.09, 0.95, 8), tf(PIVOT.x, PIVOT.y, 0, Math.PI / 2));
  return { bed: bed.build()[0].geometry, tube: tube.build()[0].geometry };
}

/** Plateforme tournante du mortier, posée sur le pont en `place` : un disque de bois cerclé de fer. */
export function addMortarPlatform(batch: GeometryBatch, p: Palette, place: THREE.Matrix4, radius: number) {
  const at = (local: THREE.Matrix4) => new THREE.Matrix4().multiplyMatrices(place, local);
  batch.add(p.dark, new THREE.CylinderGeometry(radius, radius, 0.06, 14), at(tf(0, 0.03, 0)));
  batch.add(p.wood, new THREE.CylinderGeometry(radius - 0.07, radius - 0.07, 0.1, 14), at(tf(0, 0.05, 0)));
}
