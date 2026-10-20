import * as THREE from 'three';
import { HELM_VIEW } from '../config';
import type { Ship } from '../ship/ship';

const eye = new THREE.Vector3();
const shipTurn = new THREE.Quaternion();
const look = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * Vue à la première personne, à la place du barreur du bateau piloté (touche V) : la souris capturée tourne la tête
 * librement ; le regard reste où on l'a laissé et suit le roulis et le tangage du pont. Échap rend le curseur (un clic
 * dans la vue le reprend). Sur un navire sans plan de pont (barques), l'œil est à l'arrière, sur l'axe.
 */
export class HelmView {
  active = false;
  /** Tête tournée vers bâbord (rad), et levée (rad). */
  private yaw = 0;
  private pitch = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
  ) {
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * HELM_VIEW.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * HELM_VIEW.sensitivity, -HELM_VIEW.maxPitch, HELM_VIEW.maxPitch);
    });
  }

  /** La souris est-elle capturée par la vue ? */
  get locked(): boolean {
    return this.active && document.pointerLockElement === this.dom;
  }

  /** Entre dans la vue du barreur (regard vers la proue, souris capturée) ou en sort. */
  toggle() {
    this.active = !this.active;
    this.yaw = 0;
    this.pitch = HELM_VIEW.startPitch;
    this.camera.near = this.active ? HELM_VIEW.near : HELM_VIEW.chaseNear;
    this.camera.updateProjectionMatrix();
    if (this.active) this.capture();
    else this.release();
  }

  /** Capture la souris (il faut un geste du joueur : touche ou clic). */
  capture() {
    if (!this.active || this.locked) return;
    // Refusé hors d'un geste du joueur : sans conséquence, un clic la reprendra.
    this.dom.requestPointerLock()?.catch?.(() => {});
  }

  release() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  /** Place la caméra à l'œil du barreur de `ship`, dans le repère du navire (assiette comprise). */
  place(ship: Ship) {
    const root = ship.model.root;
    root.updateMatrixWorld();
    const helm = ship.model.deckPlan?.helm;
    if (helm) eye.set(helm.x, helm.y + HELM_VIEW.eyeHeight, helm.z - HELM_VIEW.behindWheel);
    else eye.set(0, HELM_VIEW.boatEye, -ship.stats.length * HELM_VIEW.boatStern);
    eye.applyMatrix4(root.matrixWorld);
    this.camera.position.copy(eye);
    // La caméra regarde vers -Z : un demi-tour pour regarder vers la proue (+Z du navire).
    root.getWorldQuaternion(shipTurn);
    look.setFromEuler(euler.set(this.pitch, Math.PI + (helm?.facing ?? 0) + this.yaw, 0));
    this.camera.quaternion.multiplyQuaternions(shipTurn, look);
  }
}
