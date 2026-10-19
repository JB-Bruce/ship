import * as THREE from 'three';
import { LOOT } from '../config';
import type { Effects } from '../fx/effects';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { GeometryBatch, tf } from '../utils/geometryBatch';

/** Or et bois (réserve commune), rhum et épices (dans la cale du navire qui les ramasse). */
export type LootKind = 'gold' | 'wood' | 'rum' | 'spices';

export interface Crate {
  readonly mesh: THREE.Mesh;
  kind: LootKind;
  value: number;
  age: number;
  spin: number;
}

interface LootModel {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
}

const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));
const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/** Fusionne les pièces d'un GeometryBatch en une géométrie à plusieurs matériaux (groupes). */
function toLootModel(batch: GeometryBatch): LootModel {
  const parts = batch.build();
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  let start = 0;
  parts.forEach(({ geometry: g }, i) => {
    positions.push(...(g.attributes.position.array as Float32Array));
    normals.push(...(g.attributes.normal.array as Float32Array));
    geometry.addGroup(start, g.attributes.position.count, i);
    start += g.attributes.position.count;
  });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return { geometry, materials: parts.map((p) => p.material) };
}

/** Caisse de bois cerclée d'or. */
function buildCrate(): LootModel {
  const wood = std(0x7a5230);
  const gold = std(0xffc83d, { emissive: 0x6a4a00, roughness: 0.35, metalness: 0.7 });
  const batch = new GeometryBatch();
  batch.add(wood, new THREE.BoxGeometry(0.9, 0.6, 0.65), tf(0, 0.3, 0));
  for (const x of [-0.3, 0.3]) batch.add(gold, new THREE.BoxGeometry(0.08, 0.64, 0.69), tf(x, 0.3, 0));
  batch.add(gold, new THREE.BoxGeometry(0.2, 0.16, 0.05), tf(0, 0.45, 0.34));
  return toLootModel(batch);
}

/** Paquet de planches liées par une corde. */
function buildWoodBundle(): LootModel {
  const planks = std(0xa8763f);
  const rope = std(0xd8c08a);
  const batch = new GeometryBatch();
  [-0.22, 0, 0.22].forEach((x, i) => batch.add(planks, new THREE.BoxGeometry(0.2, 0.08, 1.6), tf(x, 0.12 + (i % 2) * 0.04, 0, 0, i * 0.05)));
  [-0.11, 0.11].forEach((x) => batch.add(planks, new THREE.BoxGeometry(0.2, 0.08, 1.4), tf(x, 0.22, 0.05, 0, -0.04)));
  for (const z of [-0.5, 0.5]) batch.add(rope, new THREE.BoxGeometry(0.72, 0.24, 0.06), tf(0, 0.16, z));
  return toLootModel(batch);
}

/** Tonneau de rhum cerclé de fer. */
function buildBarrel(): LootModel {
  const wood = std(0x8b4f2a);
  const iron = std(0x3b3f45, { roughness: 0.5, metalness: 0.6 });
  const batch = new GeometryBatch();
  batch.add(wood, new THREE.CylinderGeometry(0.34, 0.34, 0.9, 8), tf(0, 0.3, 0, Math.PI / 2));
  batch.add(wood, new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8), tf(0, 0.3, 0, Math.PI / 2));
  for (const z of [-0.3, 0.3]) batch.add(iron, new THREE.CylinderGeometry(0.38, 0.38, 0.06, 8), tf(0, 0.3, z, Math.PI / 2));
  return toLootModel(batch);
}

/** Caisse d'épices : bois clair, couvercle cloué et sacs de toile colorés qui dépassent. */
function buildSpiceCrate(): LootModel {
  const wood = std(0xc29a62);
  const cloth = std(0xc0522a);
  const batch = new GeometryBatch();
  batch.add(wood, new THREE.BoxGeometry(0.75, 0.5, 0.75), tf(0, 0.25, 0));
  batch.add(cloth, new THREE.DodecahedronGeometry(0.22), tf(-0.12, 0.55, 0.08));
  batch.add(cloth, new THREE.DodecahedronGeometry(0.17), tf(0.16, 0.52, -0.1));
  return toLootModel(batch);
}

/**
 * Qui ramasse le butin : appelé quand un navire de la flotte passe sur une caisse. Renvoie la quantité prise
 * (le rhum et les épices ne rentrent que s'il reste de la place dans sa cale).
 */
export type LootCollector = (ship: Ship, kind: LootKind, value: number) => number;

/** Butin laissé par les épaves (or, planches, parfois rhum et épices) : il flotte, on le ramasse en passant dessus. */
export class Loot {
  readonly crates: Crate[] = [];
  private readonly models: Record<LootKind, LootModel> = { gold: buildCrate(), wood: buildWoodBundle(), rum: buildBarrel(), spices: buildSpiceCrate() };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly effects: Effects,
    /** Range le butin ramassé (réserve commune ou cale) et l'annonce ; renvoie la quantité prise. */
    private readonly collect: LootCollector,
  ) {}

  /** Disperse caisses d'or et paquets de planches autour d'une épave. */
  spawnWreckLoot(x: number, z: number, factor = 1) {
    // Le multiplicateur (gros navire, ennemi amélioré) augmente surtout la valeur, un peu le nombre.
    const count = (range: readonly [number, number]) => Math.round(randInt(range) * Math.sqrt(factor));
    const value = (range: readonly [number, number]) => Math.round(randInt(range) * Math.sqrt(factor));
    const golds = count(LOOT.cratesPerWreck);
    const woods = count(LOOT.woodBundlesPerWreck);
    for (let i = 0; i < golds; i++) this.spawn('gold', x, z, value(LOOT.goldPerCrate));
    for (let i = 0; i < woods; i++) this.spawn('wood', x, z, value(LOOT.woodPerBundle));
    // Rhum et épices : rares, un peu moins rares dans les cales des gros navires.
    const rare = Math.pow(factor, LOOT.rareFactorExponent);
    if (Math.random() < LOOT.rumChance * rare) this.spawn('rum', x, z, randInt(LOOT.rumPerBarrel));
    if (Math.random() < LOOT.spicesChance * rare) this.spawn('spices', x, z, randInt(LOOT.spicesPerCrate));
  }

  /** Ajoute `count` caisses d'une marchandise autour d'une épave (butin garanti du boss). */
  spawnGoods(x: number, z: number, kind: 'rum' | 'spices', count: number) {
    const range = kind === 'rum' ? LOOT.rumPerBarrel : LOOT.spicesPerCrate;
    for (let i = 0; i < count; i++) this.spawn(kind, x, z, randInt(range));
  }

  /** Fait flotter le butin ; un bateau de la flotte qui passe dessus le ramasse (en partie si sa cale est pleine). */
  update(dt: number, ships: readonly Ship[], waves: Waves) {
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const crate = this.crates[i];
      const m = crate.mesh;
      crate.age += dt;
      // Le butin coule doucement à la fin de sa durée de vie.
      const sinking = Math.max(0, crate.age - LOOT.lifetime + 3);
      m.position.y = waves.heightAt(m.position.x, m.position.z) - 0.2 - sinking;
      m.rotation.y += crate.spin * dt;
      m.rotation.z = Math.sin(crate.age * 1.3 + i) * 0.12;

      if (crate.age > LOOT.lifetime) {
        this.removeAt(i);
        continue;
      }
      for (const ship of ships) {
        if (!this.reaches(ship, m.position)) continue;
        const taken = this.collect(ship, crate.kind, crate.value);
        if (taken <= 0) continue;
        crate.value -= taken;
        this.resize(crate);
        this.effects.sparkle(m.position, crate.kind === 'wood' ? 'wood' : 'gold');
        if (crate.value > 0) continue;
        this.removeAt(i);
        break;
      }
    }
  }

  /**
   * Un bateau non ennemi à flot passe-t-il sur la caisse ? La zone suit sa coque : une gélule de sa longueur et de sa
   * largeur (allongements compris), orientée selon son cap, plus LOOT.pickupMargin tout autour. Le collecteur décide qui
   * garde le butin (ta flotte, un pirate allié… ou personne).
   */
  private reaches(ship: Ship, p: THREE.Vector3): boolean {
    if (ship.faction === 'enemy' || !ship.alive) return false;
    const { length, width } = ship.stats;
    const dx = p.x - ship.position.x;
    const dz = p.z - ship.position.z;
    // Position le long de l'axe proue-poupe, ramenée sur le segment central de la gélule.
    const half = Math.max(0, (length - width) / 2);
    const along = Math.max(-half, Math.min(half, dx * Math.sin(ship.heading) + dz * Math.cos(ship.heading)));
    const ex = dx - Math.sin(ship.heading) * along;
    const ez = dz - Math.cos(ship.heading) * along;
    return Math.hypot(ex, ez) < width / 2 + LOOT.pickupMargin;
  }

  /**
   * Fait tomber du butin vers (x, z) : il rejoint une caisse du même genre toute proche (qui grossit), sinon une
   * nouvelle caisse apparaît. On évite ainsi des dizaines de petites caisses autour d'une épave.
   */
  private spawn(kind: LootKind, x: number, z: number, value: number) {
    const px = x + (Math.random() - 0.5) * 8;
    const pz = z + (Math.random() - 0.5) * 8;
    const near = this.crates.find((c) => c.kind === kind && c.age < LOOT.lifetime - 3 && Math.hypot(c.mesh.position.x - px, c.mesh.position.z - pz) < LOOT.merge.radius);
    if (near) {
      near.value += value;
      near.age = 0;
      this.resize(near);
      return;
    }
    const { geometry, materials } = this.models[kind];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(px, 0, pz);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    const crate: Crate = { mesh, kind, value, age: 0, spin: (Math.random() - 0.5) * 0.6 };
    this.resize(crate);
    this.crates.push(crate);
  }

  /** Taille d'une caisse selon son contenu. */
  private resize(crate: Crate) {
    const m = LOOT.merge;
    crate.mesh.scale.setScalar(Math.min(m.maxScale, Math.max(1, Math.cbrt(crate.value / m.base[crate.kind]))));
  }

  private removeAt(i: number) {
    this.scene.remove(this.crates[i].mesh);
    this.crates.splice(i, 1);
  }
}
