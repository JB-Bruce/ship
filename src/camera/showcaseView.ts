import * as THREE from 'three';
import { SHOWCASE } from '../config';
import type { Ship } from '../ship/ship';
import { wrapAngle } from '../utils/math';

const { clamp, damp } = THREE.MathUtils;

/** Ce que regarde la vitrine : un point du navire (son repère) et l'angle, la hauteur et la distance d'où le voir. */
export interface ShowcaseFocus {
  /** Point visé, dans le repère du navire. */
  readonly point: THREE.Vector3;
  /** Côté d'où l'on regarde, comme un cap relatif au navire (0 = devant la proue, +π/2 = bâbord). */
  readonly yaw: number;
  /** Hauteur du regard (rad au-dessus de l'horizon). */
  readonly pitch: number;
  /** Distance, en longueurs de navire. */
  readonly distance: number;
}

const local = new THREE.Vector3();

/**
 * Vue « vitrine » du Chantier : la caméra tourne autour du navire à quai (le jeu est en pause, elle bouge quand même :
 * elle suit le temps réel) et glisse en douceur vers la partie choisie (voiles, canons, coque, cale). Sans choix, elle
 * tourne lentement toute seule. Glisser à la souris la fait tourner (`drag`). Réglages : SHOWCASE.
 */
export class ShowcaseView {
  active = false;
  private focus: ShowcaseFocus | null = null;
  /** Écart de cap et de hauteur ajouté à la souris, et la rotation lente. */
  private yawOffset = 0;
  private pitchOffset = 0;
  private spin = 0;
  private readonly target = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private distance = 0;
  private placed = false;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Ouvre (focus = vue d'ensemble) ou change ce qu'on regarde. */
  look(focus: ShowcaseFocus) {
    if (!this.active) {
      this.active = true;
      this.placed = false;
      this.yawOffset = this.pitchOffset = this.spin = 0;
    } else if (focus !== this.focus) {
      // Un nouveau choix : la souris n'impose plus son angle, la caméra glisse d'elle-même jusqu'à sa place.
      this.yawOffset = this.pitchOffset = this.spin = 0;
    }
    this.focus = focus;
  }

  close() {
    this.active = false;
    this.focus = null;
  }

  /** Glisser à la souris (px) : tourne autour du navire, monte ou descend. */
  drag(dx: number, dy: number) {
    this.yawOffset -= dx * SHOWCASE.sensitivity;
    this.pitchOffset = clamp(this.pitchOffset + dy * SHOWCASE.sensitivity, -SHOWCASE.pitchRange, SHOWCASE.pitchRange);
  }

  /** Pose la caméra (temps réel `dt`, même en pause). `turning` : la vue d'ensemble tourne lentement d'elle-même. */
  place(dt: number, ship: Ship, turning: boolean) {
    const f = this.focus;
    if (!f) return;
    if (turning) this.spin += SHOWCASE.spin * dt;
    const root = ship.model.root;
    root.updateMatrixWorld();
    const aim = local.copy(f.point).applyMatrix4(root.matrixWorld);
    const yaw = ship.heading + f.yaw + this.yawOffset + this.spin;
    const pitch = clamp(f.pitch + this.pitchOffset, SHOWCASE.minPitch, SHOWCASE.maxPitch);
    const distance = f.distance * ship.stats.length;
    if (!this.placed) {
      this.target.copy(aim);
      this.yaw = yaw;
      this.pitch = pitch;
      this.distance = distance;
      this.placed = true;
    }
    const k = SHOWCASE.glide;
    this.target.set(damp(this.target.x, aim.x, k, dt), damp(this.target.y, aim.y, k, dt), damp(this.target.z, aim.z, k, dt));
    this.yaw += wrapAngle(yaw - this.yaw) * (1 - Math.exp(-k * dt));
    this.pitch = damp(this.pitch, pitch, k, dt);
    this.distance = damp(this.distance, distance, k, dt);
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.y = Math.max(this.camera.position.y, SHOWCASE.minHeight);
    this.camera.lookAt(this.target);
  }
}
