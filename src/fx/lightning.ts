import * as THREE from 'three';
import { AUDIO, LIGHTNING } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { land } from '../world/island';
import { sound } from '../audio/sound';

/** Points de l'éclair principal et de sa ramification. */
const MAIN_POINTS = 15;
const BRANCH_POINTS = 8;
const SEGMENTS = MAIN_POINTS - 1 + (BRANCH_POINTS - 1);

export interface LightningEvents {
  /** Un éclair vient de tomber, à `distance` mètres du bateau piloté. */
  bolt(distance: number): void;
  /** La foudre frappe le mât d'un bateau, au point `top`. */
  strike(ship: Ship, top: THREE.Vector3): void;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const points = Array.from({ length: MAIN_POINTS + BRANCH_POINTS }, () => new THREE.Vector3());
const side = new THREE.Vector3();
const top = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Scintillement d'un éclair : un premier trait, un court noir, un second trait, puis la lueur s'éteint. */
function flicker(t: number): number {
  if (t < 0.06) return 1;
  if (t < 0.11) return 0.15;
  if (t < 0.18) return 0.9;
  return 0.9 * Math.exp(-(t - 0.18) * 9);
}

/**
 * Éclairs d'orage : un trait en zigzag avec une ramification, tombé au hasard autour du joueur (surtout au loin).
 * Rarement, la foudre frappe le mât d'un bateau proche. La lueur (`flash`) est appliquée à la scène par la météo.
 */
export class Lightning {
  readonly mesh: THREE.Mesh;
  /** Lueur actuelle (0..1). */
  flash = 0;
  private timer = rand(LIGHTNING.interval[0], LIGHTNING.interval[1]);
  private age = Infinity;
  private peak = 0;
  private readonly positions = new Float32Array(SEGMENTS * 6 * 3);
  private readonly attribute: THREE.BufferAttribute;

  constructor(private readonly events: LightningEvents) {
    const geometry = new THREE.BufferGeometry();
    this.attribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.attribute);
    // Pas de brume : un éclair se voit de loin, même à travers la pluie.
    const material = new THREE.MeshBasicMaterial({ color: LIGHTNING.color, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * `level` : fréquence des éclairs (0 = aucun, 1 = plein orage, 2 = deux fois plus). `strikeFactor` multiplie la
   * chance de frapper un mât. `focus` : le bateau piloté.
   */
  update(dt: number, level: number, strikeFactor: number, camera: THREE.Camera, waves: Waves, ships: readonly Ship[], focus: Ship) {
    this.age += dt;
    const glow = this.age < LIGHTNING.duration ? flicker(this.age) : 0;
    this.flash = this.peak * glow;
    this.mesh.visible = glow > 0.35;
    if (level <= 0) return;
    this.timer -= dt * level;
    if (this.timer > 0) return;
    this.timer = rand(LIGHTNING.interval[0], LIGHTNING.interval[1]);
    this.strike(camera, waves, ships, focus, strikeFactor);
  }

  private strike(camera: THREE.Camera, waves: Waves, ships: readonly Ship[], focus: Ship, strikeFactor = 1) {
    const target = Math.random() < LIGHTNING.strikeChance * strikeFactor ? this.pickShip(ships, focus) : null;
    if (target) {
      top.set(target.position.x, target.position.y + target.stats.length * LIGHTNING.mastHeight, target.position.z);
    } else {
      // Surtout au loin, parfois tout près.
      const angle = Math.random() * Math.PI * 2;
      const [near, far] = LIGHTNING.distance;
      const d = near + (far - near) * Math.pow(Math.random(), 0.6);
      const x = focus.position.x + Math.sin(angle) * d;
      const z = focus.position.z + Math.cos(angle) * d;
      top.set(x, Math.max(waves.heightAt(x, z), land.heightAt(x, z)), z);
    }
    const distance = Math.hypot(top.x - focus.position.x, top.z - focus.position.z);
    this.build(top, camera);
    this.age = 0;
    this.peak = LIGHTNING.flash * THREE.MathUtils.clamp(1.15 - distance / 600, 0.35, 1);
    this.events.bolt(distance);
    // Le tonnerre roule après l'éclair, d'autant plus tard et plus sourd qu'il tombe loin.
    sound.play('ambience/thunder', { bus: 'ambience', delay: distance / AUDIO.soundSpeed, volume: THREE.MathUtils.clamp(1 - distance / AUDIO.thunderFade, 0.2, 1) });
    if (target) this.events.strike(target, top);
  }

  /**
   * La foudre tombe sur le mât de `ship` (tempête du bord du monde) : l'éclair, sa lueur et la secousse, sans l'événement
   * `strike` (ni message ni dégâts : l'appelant s'en charge). Renvoie le point frappé.
   */
  strikeShip(ship: Ship, camera: THREE.Camera, focus: Ship): THREE.Vector3 {
    top.set(ship.position.x, ship.position.y + ship.stats.length * LIGHTNING.mastHeight, ship.position.z);
    const distance = Math.hypot(top.x - focus.position.x, top.z - focus.position.z);
    this.build(top, camera);
    this.age = 0;
    this.peak = LIGHTNING.flash * THREE.MathUtils.clamp(1.15 - distance / 600, 0.35, 1);
    this.events.bolt(distance);
    return top;
  }

  /** Un bateau à flot au hasard, près du joueur, ou null. */
  private pickShip(ships: readonly Ship[], focus: Ship): Ship | null {
    const near = ships.filter((s) => s.alive && s.distanceTo(focus) < LIGHTNING.strikeRadius);
    return near.length ? near[Math.floor(Math.random() * near.length)] : null;
  }

  /** Construit le ruban de l'éclair, du nuage jusqu'à `end`, tourné face à la caméra. */
  private build(end: THREE.Vector3, camera: THREE.Camera) {
    const height = LIGHTNING.cloudHeight;
    const jitter = height * 0.07;
    const startX = end.x + rand(-30, 30);
    const startZ = end.z + rand(-30, 30);
    for (let i = 0; i < MAIN_POINTS; i++) {
      const t = i / (MAIN_POINTS - 1);
      // Zigzag nul aux deux bouts, plus marqué au milieu.
      const j = jitter * Math.sin(Math.PI * t);
      points[i].set(
        THREE.MathUtils.lerp(startX, end.x, t) + rand(-j, j),
        THREE.MathUtils.lerp(height, end.y, t),
        THREE.MathUtils.lerp(startZ, end.z, t) + rand(-j, j),
      );
    }
    // Ramification : part du tiers supérieur et s'éteint en l'air, sur le côté.
    const from = points[4 + Math.floor(Math.random() * 3)];
    const angle = Math.random() * Math.PI * 2;
    const reach = rand(18, 35);
    const drop = (from.y - end.y) * rand(0.25, 0.4);
    for (let i = 0; i < BRANCH_POINTS; i++) {
      const t = i / (BRANCH_POINTS - 1);
      const j = jitter * 0.4 * t;
      points[MAIN_POINTS + i].set(
        from.x + Math.sin(angle) * reach * t + rand(-j, j),
        from.y - drop * t,
        from.z + Math.cos(angle) * reach * t + rand(-j, j),
      );
    }

    // Le ruban s'élargit au loin pour rester visible ; le côté est horizontal, perpendiculaire à la vue.
    const width = Math.max(LIGHTNING.width, camera.position.distanceTo(end) * 0.005);
    side.subVectors(camera.position, end).cross(UP).setY(0).normalize();
    let k = 0;
    const quad = (a: THREE.Vector3, b: THREE.Vector3, wa: number, wb: number) => {
      const corners = [
        [a, -wa], [a, wa], [b, wb],
        [a, -wa], [b, wb], [b, -wb],
      ] as const;
      for (const [p, w] of corners) {
        this.positions[k++] = p.x + side.x * w * 0.5;
        this.positions[k++] = p.y;
        this.positions[k++] = p.z + side.z * w * 0.5;
      }
    };
    for (let i = 0; i < MAIN_POINTS - 1; i++) quad(points[i], points[i + 1], width, width);
    for (let i = 0; i < BRANCH_POINTS - 1; i++) {
      const t0 = i / (BRANCH_POINTS - 1);
      const t1 = (i + 1) / (BRANCH_POINTS - 1);
      quad(points[MAIN_POINTS + i], points[MAIN_POINTS + i + 1], width * 0.6 * (1 - t0), width * 0.6 * (1 - t1));
    }
    this.attribute.needsUpdate = true;
  }
}
