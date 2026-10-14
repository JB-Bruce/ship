import * as THREE from 'three';
import { COMBAT, MORTAR_FX, type ShellStats } from '../config';
import type { Effects } from '../fx/effects';
import type { Waves } from '../ocean/waves';
import { isHostile, type Combatant, type Ship } from '../ship/ship';
import { land } from '../world/island';

export interface Ball {
  readonly position: THREE.Vector3;
  readonly previous: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  /** Qui a tiré (bateau ou fort) : il ne peut pas se toucher lui-même ni toucher son camp. */
  owner: Combatant;
  damage: number;
  /** Obus de mortier (tir en cloche, explosion et souffle), ou null pour un boulet. */
  shell: ShellStats | null;
  trailTimer: number;
}

/** Fractions du déplacement testées à chaque image : évite qu'un boulet traverse une coque entre deux images. */
const HIT_SAMPLES = [0.5, 1];
const TRAIL_INTERVAL = 0.03;
const matrix = new THREE.Matrix4();
const sample = new THREE.Vector3();
const scale = new THREE.Vector3();
const noRotation = new THREE.Quaternion();

/** Ouvrage qu'un boulet peut toucher (citadelle assiégée). */
export interface Structure extends Combatant {
  readonly alive: boolean;
  containsPoint(x: number, y: number, z: number): boolean;
}

/**
 * Boulets et obus en vol : balistique, collisions avec les coques, les ouvrages assiégés, la terre et l'eau. Un obus
 * de mortier explose où il tombe, et son souffle touche les navires ennemis proches (voir ShellStats).
 */
export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private readonly balls: Ball[] = [];
  private readonly pool: Ball[] = [];

  constructor(private readonly capacity = 64) {
    const material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5, flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 1), material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  fire(from: THREE.Vector3, velocity: THREE.Vector3, owner: Combatant, damage: number, shell: ShellStats | null = null) {
    if (this.balls.length >= this.capacity) return;
    const ball = this.pool.pop() ?? { position: new THREE.Vector3(), previous: new THREE.Vector3(), velocity: new THREE.Vector3(), owner, damage, shell, trailTimer: 0 };
    ball.position.copy(from);
    ball.previous.copy(from);
    ball.velocity.copy(velocity);
    ball.owner = owner;
    ball.damage = damage;
    ball.shell = shell;
    ball.trailTimer = 0;
    this.balls.push(ball);
  }

  /**
   * Fait avancer les boulets. `onHit` est appelé quand un boulet touche une coque ennemie, `onStructureHit` quand il
   * touche un des `structures` (ouvrages assiégés) du camp adverse, `onBlast` pour chaque navire ennemi pris dans le
   * souffle d'un obus (avec ses dégâts).
   */
  update<S extends Structure>(
    dt: number,
    ships: readonly Ship[],
    waves: Waves,
    effects: Effects,
    onHit: (ship: Ship, ball: Ball) => void,
    structures: readonly S[] = [],
    onStructureHit: (structure: S, ball: Ball) => void = () => {},
    onBlast: (ship: Ship, ball: Ball, damage: number) => void = () => {},
  ) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.previous.copy(ball.position);
      ball.velocity.y -= COMBAT.gravity * (ball.shell?.gravityFactor ?? 1) * dt;
      ball.position.addScaledVector(ball.velocity, dt);

      ball.trailTimer -= dt;
      if (ball.trailTimer <= 0) {
        if (ball.shell) effects.shellTrail(ball.position);
        else effects.trail(ball.position);
        ball.trailTimer = ball.shell ? MORTAR_FX.trailInterval : TRAIL_INTERVAL;
      }

      const target = this.hitTest(ball, ships);
      if (target) {
        onHit(target, ball);
        this.detonate(ball, ships, target, onBlast, effects);
        this.removeAt(i);
        continue;
      }
      const structure = structures.find((s) => s.alive && isHostile(ball.owner, s) && s.containsPoint(ball.position.x, ball.position.y, ball.position.z));
      if (structure) {
        effects.groundHit(ball.position);
        onStructureHit(structure, ball);
        this.detonate(ball, ships, null, onBlast, effects);
        this.removeAt(i);
        continue;
      }
      const water = waves.heightAt(ball.position.x, ball.position.z);
      const ground = land.heightAt(ball.position.x, ball.position.z);
      if (ground > water && ball.position.y < ground) {
        effects.groundHit(ball.position);
        this.detonate(ball, ships, null, onBlast, effects);
        this.removeAt(i);
        continue;
      }
      if (ball.position.y < water) {
        if (ball.shell) effects.waterColumn(ball.position.x, water, ball.position.z);
        else effects.splash(ball.position.x, water, ball.position.z);
        this.detonate(ball, ships, null, onBlast, effects, false);
        this.removeAt(i);
      }
    }

    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      this.mesh.setMatrixAt(i, matrix.compose(ball.position, noRotation, scale.setScalar(ball.shell?.size ?? 1)));
    }
    this.mesh.count = this.balls.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Un obus explose (rien pour un boulet) : boule de feu (sauf dans l'eau, qui a sa gerbe), et souffle sur les navires
   * ennemis dont le bordé est assez proche, sauf celui qu'il a touché de plein fouet (`direct`).
   */
  private detonate(ball: Ball, ships: readonly Ship[], direct: Ship | null, onBlast: (ship: Ship, ball: Ball, damage: number) => void, effects: Effects, fire = true) {
    const shell = ball.shell;
    if (!shell) return;
    if (fire) effects.shellBlast(ball.position);
    const { x, z } = ball.position;
    for (const ship of ships) {
      if (ship === direct || ship === ball.owner || !ship.alive || !isHostile(ball.owner, ship)) continue;
      if (hullDistance(ship, x, z) <= shell.blastRadius) onBlast(ship, ball, ball.damage * shell.blastShare);
    }
  }

  private hitTest(ball: Ball, ships: readonly Ship[]): Ship | null {
    for (const ship of ships) {
      if (ship === ball.owner || !ship.alive || !isHostile(ball.owner, ship)) continue;
      for (const t of HIT_SAMPLES) {
        sample.lerpVectors(ball.previous, ball.position, t);
        if (ship.containsPoint(sample.x, sample.y, sample.z)) return ship;
      }
    }
    return null;
  }

  private removeAt(i: number) {
    this.pool.push(this.balls[i]);
    this.balls[i] = this.balls[this.balls.length - 1];
    this.balls.pop();
  }
}

/** Distance (m) d'un point au bordé d'un navire, vu de dessus (coque = segment le long du cap, élargi de sa demi-largeur). */
function hullDistance(ship: Ship, x: number, z: number): number {
  const fx = Math.sin(ship.heading);
  const fz = Math.cos(ship.heading);
  const dx = x - ship.position.x;
  const dz = z - ship.position.z;
  const half = ship.stats.length / 2;
  const along = THREE.MathUtils.clamp(dx * fx + dz * fz, -half, half);
  return Math.max(0, Math.hypot(dx - fx * along, dz - fz * along) - ship.stats.width / 2);
}
