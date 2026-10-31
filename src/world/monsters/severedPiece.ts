import * as THREE from 'three';
import type { Waves } from '../../ocean/waves';

/** Profondeur (m) à laquelle un morceau qui coule disparaît. */
const GONE_DEPTH = 14;
/** Pesanteur (m/s²), et vitesse de chute une fois dans l'eau (m/s). */
const GRAVITY = 9.8;
const SINK = 1.6;
const down = new THREE.Vector3(0, -1, 0);
const turn = new THREE.Quaternion();

/**
 * Le bout d'une tentacule tranchée par un boulet : il est projeté, tourne sur lui-même, retombe dans une gerbe puis
 * coule lentement. Un solide : ses points gardent leur écart au centre, tourné peu à peu.
 */
export class SeveredPiece {
  readonly points: THREE.Vector3[];
  readonly belly = new THREE.Vector3();
  private readonly offsets: THREE.Vector3[];
  private readonly center = new THREE.Vector3();
  private readonly velocity: THREE.Vector3;
  private readonly axis: THREE.Vector3;
  private readonly spin: number;
  private age = 0;
  /** Il a touché l'eau (sa gerbe est faite). */
  splashed = false;

  /** `points` : la tentacule entière (monde) ; le morceau part du tronçon `from` ; `push` : sa vitesse de départ. */
  constructor(points: readonly THREE.Vector3[], readonly from: number, push: THREE.Vector3) {
    const part = points.slice(from);
    for (const p of part) this.center.add(p);
    this.center.divideScalar(part.length);
    this.offsets = part.map((p) => p.clone().sub(this.center));
    this.points = part.map((p) => p.clone());
    this.velocity = push.clone();
    this.axis = new THREE.Vector3(push.z, 0, -push.x).normalize();
    if (this.axis.lengthSq() < 0.5) this.axis.set(1, 0, 0);
    this.spin = 1.5 + Math.random() * 2;
  }

  /** Avance d'une image ; false quand il a coulé assez profond pour disparaître. `splash` : il touche l'eau en (x, y, z). */
  update(dt: number, waves: Waves, splash: (x: number, y: number, z: number) => void): boolean {
    this.age += dt;
    const water = waves.heightAt(this.center.x, this.center.z);
    if (this.center.y > water) this.velocity.y -= GRAVITY * dt;
    else {
      if (!this.splashed) {
        this.splashed = true;
        splash(this.center.x, water, this.center.z);
      }
      this.velocity.multiplyScalar(Math.exp(-3 * dt));
      this.velocity.y = Math.min(this.velocity.y, -SINK);
    }
    this.center.addScaledVector(this.velocity, dt);
    // Il tourne vite en l'air, à peine dans l'eau.
    turn.setFromAxisAngle(this.axis, this.spin * Math.min(this.age, 1.2 + this.age * 0.1));
    for (let i = 0; i < this.points.length; i++) this.points[i].copy(this.offsets[i]).applyQuaternion(turn).add(this.center);
    this.belly.copy(down).applyQuaternion(turn);
    return this.center.y > water - GONE_DEPTH;
  }
}
