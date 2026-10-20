import * as THREE from 'three';
import { CAMERA, SURF } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { wrapAngle } from '../utils/math';
import { FirstPersonView } from './firstPersonView';

const { clamp, damp } = THREE.MathUtils;
/** Écart de champ de vision (degrés) en deçà duquel on ne recalcule pas la projection. */
const FOV_EPSILON = 0.01;

/**
 * Caméra arrière qui suit le cap du bateau. Glisser la souris tourne autour, la molette zoome,
 * et la caméra revient seule derrière le bateau quand on lâche la souris. La vue à la première personne (`firstPerson` :
 * à la barre, où V bascule entre les deux, ou à pied sur le pont) la remplace ; secousses et champ de vision
 * s'appliquent aux deux.
 */
export class ChaseCamera {
  readonly firstPerson: FirstPersonView;
  private yawOffset = 0;
  private pitch = CAMERA.pitch;
  private distance = CAMERA.distance;
  private idleTime = 0;
  private dragging = false;
  private readonly target = new THREE.Vector3();
  private initialized = false;
  /** Intensité de la secousse en cours (0..1). */
  private trauma = 0;
  /** Zoom passager en cours (punch), ou null. */
  private zoom: { amount: number; duration: number; time: number } | null = null;
  /** Élargissement du champ de vision en glisse (part en plus, lissée). */
  private surfFov = 0;
  /** Appui en cours : déplacement cumulé (px) et heure de l'appui (ms), pour distinguer un clic d'un glisser. */
  private pressMoved = 0;
  private pressTime = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    /** Clic gauche dans la vue (appui court, sans glisser), en coordonnées de la fenêtre. */
    onClick: (x: number, y: number) => void = () => {},
  ) {
    this.firstPerson = new FirstPersonView(camera, dom);
    dom.addEventListener('pointerdown', (e) => {
      // Vue du barreur : un clic reprend la souris ; souris capturée, un clic vise le centre de l'écran.
      if (this.firstPerson.active) {
        if (!this.firstPerson.locked) this.firstPerson.capture();
        else if (e.button === 0) onClick(innerWidth / 2, innerHeight / 2);
        return;
      }
      this.dragging = true;
      this.pressMoved = 0;
      this.pressTime = performance.now();
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      dom.releasePointerCapture(e.pointerId);
      if (e.button === 0 && this.pressMoved <= CAMERA.clickSlop && performance.now() - this.pressTime <= CAMERA.clickTime) onClick(e.clientX, e.clientY);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.pressMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.yawOffset -= e.movementX * CAMERA.sensitivity;
      this.pitch = clamp(this.pitch + e.movementY * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
      this.idleTime = 0;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.firstPerson.active) return;
        this.distance = clamp(this.distance * (1 + e.deltaY * 0.001), CAMERA.minDistance, CAMERA.maxDistance);
      },
      { passive: false },
    );
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Léger zoom passager (champ de vision réduit de `amount`) sur `duration` s : montée rapide, retour lent. */
  punch(amount: number, duration: number) {
    this.zoom = { amount, duration, time: 0 };
  }

  /** Secoue la caméra (s'additionne aux secousses en cours, plafonné à 1). */
  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** `foot` : les yeux du joueur à pied sur le pont (repère du navire), ou null à la barre. */
  update(dt: number, ship: Ship, waves: Waves, foot: THREE.Vector3 | null = null) {
    if (this.firstPerson.active) {
      this.firstPerson.place(ship, foot);
      this.initialized = false;
    } else this.orbit(dt, ship, waves);
    this.lens(dt, ship);
  }

  /** Vue habituelle : derrière le bateau, à la distance et sous l'angle choisis à la souris. */
  private orbit(dt: number, ship: Ship, waves: Waves) {
    const p = ship.position;
    // Un grand navire est cadré de plus loin et de plus haut (racine : la différence reste modérée).
    const size = Math.sqrt(ship.stats.length / CAMERA.referenceLength);
    const targetHeight = CAMERA.targetHeight * size;
    const distance = this.distance * size;
    if (!this.initialized) {
      this.target.set(p.x, p.y + targetHeight, p.z);
      this.initialized = true;
    }
    // Suivi horizontal exact, vertical lissé : la caméra ne subit pas chaque vague (moins de mal de mer).
    // Après un changement de bateau, elle glisse jusqu'au nouveau au lieu de sauter.
    if (Math.hypot(p.x - this.target.x, p.z - this.target.z) > 6) {
      this.target.x = damp(this.target.x, p.x, 2.5, dt);
      this.target.z = damp(this.target.z, p.z, 2.5, dt);
    } else {
      this.target.x = p.x;
      this.target.z = p.z;
    }
    this.target.y = damp(this.target.y, p.y + targetHeight, 2, dt);

    this.idleTime += dt;
    if (!this.dragging && this.idleTime > CAMERA.recenterDelay) {
      this.yawOffset = damp(wrapAngle(this.yawOffset), 0, CAMERA.recenterSpeed, dt);
    }

    const yaw = ship.heading + Math.PI + this.yawOffset;
    const horizontal = Math.cos(this.pitch) * distance;
    const cam = this.camera.position;
    cam.set(
      this.target.x + Math.sin(yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * distance,
      this.target.z + Math.cos(yaw) * horizontal,
    );
    cam.y = Math.max(cam.y, waves.heightAt(cam.x, cam.z) + 1.5);
    this.camera.lookAt(this.target);
  }

  /** Champ de vision (glisse, zoom passager) et secousse. */
  private lens(dt: number, ship: Ship) {
    const cam = this.camera.position;
    // Champ de vision : un peu plus large en glisse sur la pente d'une vague, resserré par un zoom passager.
    this.surfFov = damp(this.surfFov, SURF.fovGain * ship.surfAmount, SURF.fovResponse, dt);
    let zoom = 0;
    if (this.zoom) {
      const z = this.zoom;
      z.time += dt;
      const t = Math.min(1, z.time / z.duration);
      const envelope = t < 0.2 ? Math.sin((t / 0.2) * (Math.PI / 2)) : 0.5 + 0.5 * Math.cos(((t - 0.2) / 0.8) * Math.PI);
      zoom = z.amount * envelope;
      if (t >= 1) this.zoom = null;
    }
    const fov = CAMERA.fov * (1 + this.surfFov) * (1 - zoom);
    if (Math.abs(fov - this.camera.fov) > FOV_EPSILON) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Secousse : décalage aléatoire proportionnel au carré du trauma (les petits chocs restent discrets).
    if (this.trauma > 0) {
      const offset = this.trauma * this.trauma * CAMERA.shakeOffset;
      cam.x += (Math.random() * 2 - 1) * offset;
      cam.y += (Math.random() * 2 - 1) * offset;
      cam.z += (Math.random() * 2 - 1) * offset;
      this.trauma = Math.max(0, this.trauma - CAMERA.shakeDecay * dt);
    }
  }
}
