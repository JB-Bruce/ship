import * as THREE from 'three';
import type { IslandId } from '../config';
import { std } from '../ship/parts/common';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Island } from './island';
import { CITADEL_SPOT, DAUPHIN_FORT_SPOT, FORT_SPOT, LIGHTHOUSE_SPOT, ROYAL_FORT_SPOT } from './landmarks';

/** Marge de la grille du terrain au-delà du rayon de l'île (m), et taille d'une case (m). */
const EXTENT_MARGIN = 80;
const CELL = 3.3;
/** Une ville garde sa plage sur cette largeur au bord de l'eau (m). */
const TOWN_SHORE = 12;

/**
 * Décor de chaque île : palmiers, pins (sur les hauteurs, au-dessus de `pineFrom` m), rochers, graine du tirage,
 * altitude max des palmiers et des pins (m), et rayon autour du port où rien ne pousse (village ou ville ; les
 * rochers et les pins s'en tiennent 10 m plus loin).
 */
const DECOR: Record<IslandId, { palms: number; pines: number; rocks: number; seed: number; palmHeight: number; pineFrom: number; pineHeight: number; clear: number }> = {
  tortuga: { palms: 34, pines: 0, rocks: 26, seed: 42, palmHeight: 9, pineFrom: 0, pineHeight: 0, clear: 50 },
  sabre: { palms: 12, pines: 0, rocks: 48, seed: 97, palmHeight: 22, pineFrom: 0, pineHeight: 0, clear: 50 },
  royale: { palms: 10, pines: 90, rocks: 40, seed: 131, palmHeight: 6, pineFrom: 6, pineHeight: 55, clear: 105 },
  dauphin: { palms: 16, pines: 5, rocks: 18, seed: 211, palmHeight: 12, pineFrom: 10, pineHeight: 24, clear: 50 },
};

const COLORS = {
  seabed: new THREE.Color(0xd8c89a),
  /** Terre battue des rues d'une ville (IslandShapeDef.town). */
  street: new THREE.Color(0xa39577),
  sand: new THREE.Color(0xe6d29c),
  rock: new THREE.Color(0x8d857a),
  highRock: new THREE.Color(0xa49d90),
};

/** Générateur déterministe : l'île est identique à chaque partie. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Terrain low-poly de l'île : chaque facette reçoit une seule couleur selon son altitude et sa pente
 * (sable au rivage, herbe, roche sur les pentes et les sommets). Le fond marin continue sous l'eau.
 */
export function buildTerrain(island: Island): THREE.Mesh {
  // Un rectangle le long des axes de l'île (un carré pour une île ronde).
  const { stretch } = island.frame;
  const across = island.def.radius / stretch + EXTENT_MARGIN;
  const along = island.def.radius * stretch + EXTENT_MARGIN;
  const plane = new THREE.PlaneGeometry(across * 2, along * 2, Math.round((across * 2) / CELL), Math.round((along * 2) / CELL));
  plane.rotateX(-Math.PI / 2);
  plane.rotateY(island.def.rotation ?? 0);
  plane.translate(island.cx, 0, island.cz);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, island.heightAt(pos.getX(i), pos.getZ(i)));
  const grass = new THREE.Color(island.def.grass);
  const darkGrass = new THREE.Color(island.def.darkGrass);
  const geometry = plane.toNonIndexed();
  geometry.computeVertexNormals();

  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const color = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    const h = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const flat = n.getY(f);
    if (h < -0.3) color.copy(COLORS.seabed);
    else if (inTown(island, cx, cz)) color.copy(COLORS.street);
    else if (h < 1.7) color.copy(COLORS.sand);
    else if (flat < 0.72) color.copy(COLORS.rock);
    else if (h > 30) color.copy(COLORS.highRock);
    else color.copy(grass).lerp(darkGrass, 0.5 + 0.5 * Math.sin(cx * 0.05) * Math.cos(cz * 0.045));
    // Légère variation par facette : le relief se lit mieux.
    color.multiplyScalar(0.94 + 0.12 * (0.5 + 0.5 * Math.sin(cx * 12.9898 + cz * 78.233)));
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (f + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  return new THREE.Mesh(geometry, material);
}

/** Dans le replat d'une ville, à plus de TOWN_SHORE m du rivage (le bord de mer garde sa plage). */
function inTown(island: Island, x: number, z: number): boolean {
  const town = island.def.town;
  if (!town || !island.town) return false;
  return Math.hypot(x - island.town.x, z - island.town.z) < town.radius[0] && island.sdf(x, z) < -TOWN_SHORE;
}

/** Palmier courbé, origine au pied du tronc ; `lean` = direction (rad) vers laquelle il penche. */
function addPalm(batch: GeometryBatch, m: Record<'trunk' | 'leaf' | 'nut', THREE.Material>, x: number, y: number, z: number, lean: number, rand: () => number) {
  const segments = 5;
  const segLength = 1.3 + rand() * 0.3;
  let px = x;
  let py = y;
  let pz = z;
  let tilt = 0.08;
  const dir = new THREE.Vector3();
  for (let i = 0; i < segments; i++) {
    tilt += 0.07;
    dir.set(Math.sin(lean) * Math.sin(tilt), Math.cos(tilt), Math.cos(lean) * Math.sin(tilt));
    const radius = 0.24 - i * 0.025;
    const seg = new THREE.CylinderGeometry(radius - 0.02, radius, segLength, 6);
    seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    seg.translate(px + (dir.x * segLength) / 2, py + (dir.y * segLength) / 2, pz + (dir.z * segLength) / 2);
    batch.add(m.trunk, seg, new THREE.Matrix4());
    px += dir.x * segLength;
    py += dir.y * segLength;
    pz += dir.z * segLength;
  }
  // Palmes : de longues lames qui retombent tout autour du sommet.
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rand() * 0.4;
    const frond = new THREE.BoxGeometry(0.55, 0.05, 3);
    frond.translate(0, 0, 1.5);
    // D'abord on la fait retomber (autour de son axe X), puis on l'oriente autour du tronc.
    const placement = new THREE.Matrix4()
      .makeTranslation(px, py, pz)
      .multiply(new THREE.Matrix4().makeRotationY(a))
      .multiply(new THREE.Matrix4().makeRotationX(0.45 + rand() * 0.25));
    batch.add(m.leaf, frond, placement);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    batch.add(m.nut, new THREE.IcosahedronGeometry(0.17, 0), tf(px + Math.sin(a) * 0.25, py - 0.25, pz + Math.cos(a) * 0.25));
  }
}

/** Lieux bâtis où rien ne pousse : [position, rayon laissé libre (m)]. */
const BUILT_UP = [
  [FORT_SPOT, 17],
  [LIGHTHOUSE_SPOT, 8],
  [CITADEL_SPOT, 22],
  [ROYAL_FORT_SPOT, 36],
  [DAUPHIN_FORT_SPOT, 17],
] as const;

/** Palmiers sur les plages et les basses terres, rochers au bord de l'eau, pour une île. */
export function buildVegetation(island: Island): THREE.Group {
  const decor = DECOR[island.id];
  const rand = seeded(decor.seed);
  const batch = new GeometryBatch();
  const m = { trunk: std(0x8a6a45), leaf: std(0x3f9a3a), nut: std(0x5a3d20) };
  const rock = std(0x8d857a, { roughness: 1 });
  const port = island.port;
  const spot = (spread: number) => island.pointInBox(rand() * 2 - 1, rand() * 2 - 1, spread);
  // Ni dans les forts, ni au pied du phare.
  const builtUp = (x: number, z: number) => BUILT_UP.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r);
  let palms = 0;
  for (let tries = 0; tries < 2000 && palms < decor.palms; tries++) {
    const { x, z } = spot(1.2);
    const h = island.heightAt(x, z);
    // Pas sur le quai ni au milieu du village (on en plante quelques-uns à la main là-bas).
    if (h < 1.2 || h > decor.palmHeight || Math.hypot(x - port.x, z - port.z) < decor.clear || builtUp(x, z)) continue;
    addPalm(batch, m, x, h - 0.2, z, rand() * Math.PI * 2, rand);
    palms++;
  }
  // Pins sur les hauteurs (Île Royale) : des bois sombres au-dessus des plages.
  const pine = { trunk: m.trunk, needles: std(0x2f5a35), dark: std(0x264a2c) };
  let pines = 0;
  for (let tries = 0; tries < 3000 && pines < decor.pines; tries++) {
    const { x, z } = spot(1.2);
    const h = island.heightAt(x, z);
    if (h < decor.pineFrom || h > decor.pineHeight || Math.hypot(x - port.x, z - port.z) < decor.clear + 10 || builtUp(x, z)) continue;
    addPine(batch, pine, x, h - 0.3, z, rand);
    pines++;
  }
  let rocks = 0;
  for (let tries = 0; tries < 3000 && rocks < decor.rocks; tries++) {
    const { x, z } = spot(1.3);
    const s = island.sdf(x, z);
    if (s < -6 || s > 4 || Math.hypot(x - port.x, z - port.z) < decor.clear + 10 || builtUp(x, z)) continue;
    const size = 0.8 + rand() * 2.2;
    batch.add(rock, new THREE.DodecahedronGeometry(size, 0), tf(x, island.heightAt(x, z) + size * 0.2, z, rand() * 3, rand() * 3, 0, [1, 0.7, 1.1]));
    rocks++;
  }
  const group = new THREE.Group();
  for (const { geometry, material } of batch.build()) group.add(new THREE.Mesh(geometry, material));
  return group;
}

/** Pin low-poly : tronc et trois étages de cônes, taille tirée au hasard ; origine au pied du tronc. */
function addPine(batch: GeometryBatch, m: Record<'trunk' | 'needles' | 'dark', THREE.Material>, x: number, y: number, z: number, rand: () => number) {
  const size = 0.8 + rand() * 0.6;
  batch.add(m.trunk, new THREE.CylinderGeometry(0.18 * size, 0.28 * size, 2.4 * size, 5), tf(x, y + 1.2 * size, z));
  const turn = rand() * Math.PI;
  for (let i = 0; i < 3; i++) {
    const r = (2.4 - i * 0.6) * size;
    const h = (3.2 - i * 0.5) * size;
    batch.add(i === 1 ? m.dark : m.needles, new THREE.ConeGeometry(r, h, 6), tf(x, y + (2 + i * 1.7) * size + h / 2, z, 0, turn + i));
  }
}

export { addPalm };
