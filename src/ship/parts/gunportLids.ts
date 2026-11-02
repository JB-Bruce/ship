import * as THREE from 'three';
import { GUNPORTS } from '../../config';

/** Un mantelet : sa charnière (repère posé sur le bordé, Y vers le haut le long du flanc) et son bord (+1 bâbord, -1 tribord). */
export interface LidPlace {
  hinge: THREE.Matrix4;
  side: 1 | -1;
}

const rotation = new THREE.Matrix4();
const matrix = new THREE.Matrix4();

/**
 * Mantelets des sabords d'une batterie (un `InstancedMesh` par géométrie : un appel de rendu quel que soit leur nombre) :
 * fermés en route, plaqués sur le bordé ; au combat, ils pivotent autour de leur charnière haute vers l'extérieur.
 * `open` va de 0 (fermés) à 1 (ouverts) à la vitesse GUNPORTS.time ; les matrices ne sont réécrites que pendant le
 * mouvement. La navigation du pont ignore les `InstancedMesh` : ils ne gênent personne.
 */
export class GunportLids {
  readonly group = new THREE.Group();
  /** Ouverture actuelle (0 à 1), lue aussi pour sortir les fûts. */
  open = 0;
  private target = 0;
  private readonly sets: { mesh: THREE.InstancedMesh; places: readonly LidPlace[] }[] = [];

  constructor(material: THREE.Material, batteries: readonly { geometry: THREE.BufferGeometry; places: readonly LidPlace[] }[]) {
    for (const { geometry, places } of batteries) {
      if (!places.length) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, places.length);
      mesh.frustumCulled = false;
      this.sets.push({ mesh, places });
      this.group.add(mesh);
    }
    this.write();
  }

  /** Branle-bas de combat (true) ou repos (false). */
  setTarget(open: boolean) {
    this.target = open ? 1 : 0;
  }

  /** Avance l'ouverture ; renvoie true si elle a changé (les fûts doivent alors suivre). */
  update(dt: number): boolean {
    if (this.open === this.target) return false;
    const step = dt / GUNPORTS.time;
    this.open = this.target > this.open ? Math.min(this.target, this.open + step) : Math.max(this.target, this.open - step);
    this.write();
    return true;
  }

  /** Remet tout d'un coup à un état (reconstruction du navire). */
  snap(open: number) {
    this.open = this.target = open;
    this.write();
  }

  dispose() {
    for (const { mesh } of this.sets) mesh.dispose();
  }

  private write() {
    // Une courbe douce : le volet part lentement, puis se relève.
    const angle = GUNPORTS.openAngle * (this.open * this.open * (3 - 2 * this.open));
    for (const { mesh, places } of this.sets) {
      places.forEach(({ hinge, side }, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(hinge, rotation.makeRotationZ(side * angle))));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
