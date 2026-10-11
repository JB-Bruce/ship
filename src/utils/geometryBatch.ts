import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();

/** Matrice de placement : position, rotation (rad, ordre XYZ), échelle uniforme ou par axe. */
export function tf(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) {
  quaternion.setFromEuler(euler.set(rx, ry, rz));
  if (typeof s === 'number') scale.setScalar(s);
  else scale.set(...s);
  return new THREE.Matrix4().compose(position.set(x, y, z), quaternion, scale);
}

/**
 * Regroupe des pièces statiques par matériau : un modèle de 80 pièces devient
 * une poignée de maillages, donc très peu d'appels de rendu.
 */
export class GeometryBatch {
  private readonly groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Ajoute `geometry` placée par `matrix` (la géométrie est consommée). */
  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    g.applyMatrix4(matrix);
    const list = this.groups.get(material) ?? [];
    list.push(g);
    this.groups.set(material, list);
  }

  /** Fusionne chaque groupe en une seule géométrie. */
  build(): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
    return [...this.groups].map(([material, list]) => ({ geometry: mergeGeometries(list)!, material }));
  }
}
