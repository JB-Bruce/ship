import * as THREE from 'three';
import { BLUEPRINTS } from '../config';
import type { FleetMember } from '../fleet/fleet';
import type { Effects } from '../fx/effects';
import type { Waves } from '../ocean/waves';
import { blueprints, fragmentNotice, unlockMessage } from '../progression/blueprints';
import type { Ship } from '../ship/ship';
import type { ShipType } from '../shipTypes';
import type { Enemy } from './enemySpawner';
import { passesOver } from './loot';

/** Un rouleau de plan qui flotte, en attendant qu'un navire de ta flotte passe dessus. */
interface PlanScroll {
  readonly type: ShipType;
  readonly position: THREE.Vector3;
  age: number;
  heading: number;
  spin: number;
  /** Décalage du roulis, propre à chaque rouleau. */
  phase: number;
}

/** Ce que les rouleaux annoncent : popup à côté des ressources, et grand message quand un plan est complet. */
export interface PlanScrollEvents {
  notice(text: string): void;
  message(text: string): void;
}

/** Peint une pièce d'une couleur unie (attribut `color`) et la place. */
function painted(geometry: THREE.BufferGeometry, hex: number, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.applyMatrix4(matrix);
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Fusionne des pièces peintes en une seule géométrie (position, normale, couleur). */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const array = new Float32Array(total * 3);
    let offset = 0;
    for (const g of parts) {
      array.set(g.attributes[name].array as Float32Array, offset);
      offset += g.attributes[name].count * 3;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  return out;
}

const place = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/**
 * Rouleau de parchemin couché sur l'eau, l'axe le long de x, posé sur y = 0 : bords roulés plus sombres, ruban rouge
 * noué au milieu avec un sceau doré, ses deux bouts qui traînent, et un pan de feuille à demi déroulé.
 */
function buildScrollGeometry(): THREE.BufferGeometry {
  const { length: l, radius: r, scale, paper, rim, ribbon, seal } = BLUEPRINTS.model;
  const across = Math.PI / 2;
  const parts = [
    painted(new THREE.CylinderGeometry(r, r, l, 10), paper, place(0, r, 0, 0, 0, across)),
    painted(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.1, 10), ribbon, place(0, r, 0, 0, 0, across)),
    painted(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8), seal, place(0, r, r * 1.08, across)),
    painted(new THREE.BoxGeometry(0.06, 0.014, 0.32), ribbon, place(-0.05, r * 0.45, r + 0.12, -0.5, 0.3)),
    painted(new THREE.BoxGeometry(0.06, 0.014, 0.28), ribbon, place(0.05, r * 0.45, r + 0.1, -0.5, -0.35)),
    painted(new THREE.BoxGeometry(l * 0.86, 0.016, 0.34), paper, place(0, r * 0.75, -(r + 0.13), 0.35)),
  ];
  for (const side of [-1, 1]) {
    parts.push(painted(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.07, 10), rim, place(side * (l / 2 - 0.035), r, 0, 0, 0, across)));
  }
  const geometry = merged(parts);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Bouts de plan de navires (voir progression/blueprints.ts) : un navire coulé par ta flotte dont le type t'est encore
 * inconnu en promet parfois un (`claim`) ; à la fin de son naufrage, un rouleau de parchemin remonte parmi le butin, flotte
 * et tourne doucement, puis coule au bout de BLUEPRINTS.lifetime. Un navire de ta flotte (pas en commerce) qui passe
 * dessus le ramasse. Tous les rouleaux sont dessinés en un seul lot (InstancedMesh).
 */
export class PlanScrolls {
  private readonly scrolls: PlanScroll[] = [];
  /** Position de chaque rouleau (mêmes vecteurs, même ordre) : pour les suiveurs qui vont les chercher, la carte et le radar. */
  readonly positions: THREE.Vector3[] = [];
  /** Épaves qui lâcheront un bout de leur plan à la fin de leur naufrage. */
  private readonly pending = new Map<Ship, ShipType>();
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(
    scene: THREE.Scene,
    private readonly effects: Effects,
    private readonly events: PlanScrollEvents,
  ) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, emissive: BLUEPRINTS.model.glow });
    this.mesh = new THREE.InstancedMesh(buildScrollGeometry(), material, BLUEPRINTS.maxScrolls);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    // Quelques rouleaux épars : pas de tri par la caméra (la sphère englobante ne suit pas les instances).
    this.mesh.frustumCulled = false;
    this.dummy.rotation.order = 'YXZ';
    scene.add(this.mesh);
  }

  /**
   * Un ennemi vient de recevoir le coup fatal. Coulé par ta flotte (`byFleet`), d'un type encore inconnu, il lâchera un
   * bout de son plan une fois sur deux (une élite toujours, un boss jamais), sauf si les bouts gagnés et ceux qui flottent
   * déjà suffisent à compléter ce plan.
   */
  claim(enemy: Enemy | undefined, byFleet: boolean) {
    if (!enemy || !byFleet || enemy.boss || this.pending.has(enemy.ship)) return;
    const type = enemy.ship.type;
    if (blueprints.isUnlocked(type) || blueprints.count(type) + this.inFlight(type) >= blueprints.needed(type)) return;
    if (this.scrolls.length + this.pending.size >= BLUEPRINTS.maxScrolls) return;
    if (Math.random() >= (enemy.elite ? BLUEPRINTS.eliteDropChance : BLUEPRINTS.dropChance)) return;
    this.pending.set(enemy.ship, type);
  }

  /** Bouts promis ou qui flottent encore pour ce type. */
  private inFlight(type: ShipType): number {
    let n = 0;
    for (const s of this.scrolls) if (s.type === type) n++;
    for (const t of this.pending.values()) if (t === type) n++;
    return n;
  }

  /**
   * Fait remonter les rouleaux promis (épave coulée, ou retirée du monde), flotter les autres ; un navire de ta flotte
   * (`hand` : pas ceux en commerce) qui passe dessus le ramasse.
   */
  update(dt: number, waves: Waves, ships: readonly Ship[], hand: readonly FleetMember[]) {
    if (this.pending.size) {
      for (const [ship, type] of this.pending) {
        if (!ship.sunk && ships.includes(ship)) continue;
        this.pending.delete(ship);
        this.spawn(type, ship.position.x, ship.position.z);
      }
    }
    const { lifetime, sinkTime, float } = BLUEPRINTS;
    for (let i = this.scrolls.length - 1; i >= 0; i--) {
      const s = this.scrolls[i];
      s.age += dt;
      if (s.age > lifetime) {
        this.removeAt(i);
        continue;
      }
      const p = s.position;
      p.y = waves.heightAt(p.x, p.z) - float.depth - Math.max(0, s.age - lifetime + sinkTime);
      s.heading += s.spin * dt;
      if (this.takenBy(p, hand)) this.collect(i);
    }
    this.draw();
  }

  /** Un navire de ta flotte, à flot, passe-t-il sur ce point ? */
  private takenBy(p: THREE.Vector3, hand: readonly FleetMember[]): boolean {
    for (const m of hand) if (m.inWorld && m.ship.alive && passesOver(m.ship, p)) return true;
    return false;
  }

  /** Le bout de plan rejoint ta collection : popup, et grand message s'il complète le plan (le nom du navire est révélé). */
  private collect(i: number) {
    const { type, position } = this.scrolls[i];
    this.effects.sparkle(position, 'gold');
    this.removeAt(i);
    if (blueprints.isUnlocked(type)) return;
    const progress = blueprints.addFragment(type);
    this.events.notice(fragmentNotice(progress));
    if (progress.completed) this.events.message(unlockMessage(type));
  }

  private spawn(type: ShipType, x: number, z: number) {
    if (this.scrolls.length >= BLUEPRINTS.maxScrolls) return;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * BLUEPRINTS.scatter;
    const position = new THREE.Vector3(x + Math.sin(a) * d, 0, z + Math.cos(a) * d);
    const spin = (Math.random() * 2 - 1) * BLUEPRINTS.float.spin;
    this.scrolls.push({ type, position, age: 0, heading: Math.random() * Math.PI * 2, spin, phase: Math.random() * Math.PI * 2 });
    this.positions.push(position);
  }

  private removeAt(i: number) {
    this.scrolls.splice(i, 1);
    this.positions.splice(i, 1);
  }

  /** Une place par rouleau dans le lot : position sur la vague, cap qui tourne, léger roulis. */
  private draw() {
    // Aucun rouleau : rien à poser ni à envoyer à la carte graphique.
    if (!this.scrolls.length && !this.mesh.visible) return;
    const { roll, rollSpeed } = BLUEPRINTS.float;
    const d = this.dummy;
    for (let i = 0; i < this.scrolls.length; i++) {
      const s = this.scrolls[i];
      const t = s.age * rollSpeed + s.phase;
      d.position.copy(s.position);
      d.rotation.set(Math.sin(t) * roll, s.heading, Math.sin(t * 0.7) * roll * 0.6);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.count = this.scrolls.length;
    this.mesh.visible = this.scrolls.length > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
