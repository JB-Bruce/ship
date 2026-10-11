import * as THREE from 'three';
import { CAMERA } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { wrapAngle } from '../utils/math';

const { clamp, damp } = THREE.MathUtils;

/**
 * Caméra arrière qui suit le cap du bateau. Glisser la souris tourne autour, la molette zoome,
 * et la caméra revient seule derrière le bateau quand on lâche la souris.
 */
export class ChaseCamera {
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

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', (e) => {
      this.dragging = false;
      dom.releasePointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yawOffset -= e.movementX * CAMERA.sensitivity;
      this.pitch = clamp(this.pitch + e.movementY * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);
      this.idleTime = 0;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
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

  update(dt: number, ship: Ship, waves: Waves) {
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

    if (this.zoom) {
      const z = this.zoom;
      z.time += dt;
      const t = Math.min(1, z.time / z.duration);
      const envelope = t < 0.2 ? Math.sin((t / 0.2) * (Math.PI / 2)) : 0.5 + 0.5 * Math.cos(((t - 0.2) / 0.8) * Math.PI);
      this.camera.fov = CAMERA.fov * (1 - z.amount * envelope);
      this.camera.updateProjectionMatrix();
      if (t >= 1) this.zoom = null;
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
