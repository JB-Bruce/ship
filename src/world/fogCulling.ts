import * as THREE from 'three';
import type { Ship } from '../ship/ship';

/** Marge (m) au-delà de la brume totale avant de cacher un objet. */
const MARGIN = 15;
const box = new THREE.Box3();
const sphere = new THREE.Sphere();
const forward = new THREE.Vector3();
const offset = new THREE.Vector3();

interface Culled {
  readonly object: THREE.Object3D;
  readonly center: THREE.Vector3;
  readonly radius: number;
}

/**
 * Ce qui est entièrement noyé dans la brume n'est pas dessiné : décor des îles (terrain, végétation, village, forts) et
 * navires au-delà de la brume totale. La brume compte la profondeur dans l'axe de la caméra, pas la distance : on fait
 * de même, sinon un objet sur le bord de l'écran, encore visible, disparaîtrait. Rien ne change à l'écran ; par mauvais
 * temps, beaucoup moins de sommets à traiter. (Les faisceaux du phare, eux, percent la brume : jamais ajoutés ici.)
 */
export class FogCulling {
  private readonly statics: Culled[] = [];

  /** Un objet fixe du décor (sa sphère englobante est calculée une fois). */
  add(object: THREE.Object3D) {
    box.setFromObject(object);
    box.getBoundingSphere(sphere);
    this.statics.push({ object, center: sphere.center.clone(), radius: sphere.radius });
  }

  update(camera: THREE.Camera, fogFar: number, ships: readonly Ship[]) {
    camera.getWorldDirection(forward);
    const limit = fogFar + MARGIN;
    const depth = (p: THREE.Vector3) => offset.subVectors(p, camera.position).dot(forward);
    for (const s of this.statics) s.object.visible = depth(s.center) - s.radius < limit;
    for (const ship of ships) ship.model.root.visible = depth(ship.position) - ship.stats.length < limit;
  }
}
