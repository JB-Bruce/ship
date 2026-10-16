import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Livery } from '../../config';

/** Matériaux partagés par toutes les pièces d'une chaloupe. */
export interface Palette {
  hull: THREE.Material;
  hullInside: THREE.Material;
  trim: THREE.Material;
  wood: THREE.Material;
  floor: THREE.Material;
  dark: THREE.Material;
  metal: THREE.Material;
  rope: THREE.Material;
  skin: THREE.Material;
  shirt: THREE.Material;
  shirtRed: THREE.Material;
  pants: THREE.Material;
  bandana: THREE.Material;
  glow: THREE.Material;
  /** Fenêtres (éclairées la nuit : parts/nightGlow.ts). */
  window: THREE.Material;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const at = (parent: THREE.Matrix4, local: THREE.Matrix4) => parent.clone().multiply(local);

export interface SailorOptions {
  pose: 'sit' | 'stand';
  shirt: THREE.Material;
  headwear: 'tricorn' | 'bandana';
}

/**
 * Marin low-poly, tourné vers +Z.
 * Assis : origine au niveau des hanches. Debout : origine sous les pieds.
 */
export function addSailor(batch: GeometryBatch, p: Palette, place: THREE.Matrix4, o: SailorOptions) {
  const add = (m: THREE.Material, g: THREE.BufferGeometry, local: THREE.Matrix4) => batch.add(m, g, at(place, local));
  const sit = o.pose === 'sit';
  const hip = sit ? 0 : 0.6;

  add(o.shirt, box(0.34, 0.44, 0.2), tf(0, hip + 0.26, -0.02));
  add(p.dark, box(0.35, 0.06, 0.21), tf(0, hip + 0.06, -0.02));
  add(p.skin, new THREE.IcosahedronGeometry(0.13, 1), tf(0, hip + 0.62, 0));
  for (const x of [-1, 1]) {
    // Bras légèrement tendus vers l'avant, mains au bout.
    add(o.shirt, box(0.09, 0.38, 0.1), tf(x * 0.22, hip + 0.26, 0.06, -0.5));
    add(p.skin, box(0.08, 0.08, 0.08), tf(x * 0.22, hip + 0.06, 0.18));
    if (sit) {
      add(p.pants, box(0.13, 0.12, 0.38), tf(x * 0.09, 0, 0.17));
      add(p.pants, box(0.12, 0.38, 0.12), tf(x * 0.09, -0.2, 0.36));
      add(p.dark, box(0.13, 0.08, 0.2), tf(x * 0.09, -0.4, 0.4));
    } else {
      add(p.pants, box(0.13, 0.55, 0.13), tf(x * 0.09, 0.32, 0));
      add(p.dark, box(0.14, 0.1, 0.2), tf(x * 0.09, 0.05, 0.03));
    }
  }
  if (o.headwear === 'tricorn') {
    // Un cône à 3 côtés aplati fait un tricorne convaincant, pointe vers l'avant.
    add(p.dark, new THREE.ConeGeometry(0.22, 0.1, 3), tf(0, hip + 0.76, 0));
    add(p.dark, new THREE.CylinderGeometry(0.09, 0.11, 0.1, 6), tf(0, hip + 0.8, 0));
  } else {
    add(p.bandana, new THREE.CylinderGeometry(0.135, 0.135, 0.09, 6), tf(0, hip + 0.68, 0));
    add(p.bandana, box(0.08, 0.08, 0.1), tf(0, hip + 0.66, -0.15));
  }
}

/** Tonneau debout, origine au centre du fond. */
export function addBarrel(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  const profile = [
    [0, 0],
    [0.17, 0],
    [0.21, 0.3],
    [0.17, 0.6],
    [0, 0.6],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  batch.add(p.wood, new THREE.LatheGeometry(profile, 8), place);
  for (const y of [0.13, 0.47]) batch.add(p.metal, new THREE.CylinderGeometry(0.197, 0.197, 0.035, 8), at(place, tf(0, y, 0)));
}

/** Caisse cerclée, origine au centre du fond. */
export function addCrate(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  batch.add(p.wood, box(0.5, 0.42, 0.42), at(place, tf(0, 0.21, 0)));
  for (const y of [0.07, 0.35]) batch.add(p.dark, box(0.52, 0.05, 0.44), at(place, tf(0, y, 0)));
}

/** Rouleau de cordage posé à plat. */
export function addRopeCoil(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  batch.add(p.rope, new THREE.TorusGeometry(0.17, 0.045, 4, 12), at(place, tf(0, 0.045, 0, Math.PI / 2)));
  batch.add(p.rope, new THREE.TorusGeometry(0.11, 0.04, 4, 10), at(place, tf(0, 0.12, 0, Math.PI / 2)));
}

/** Lanterne sur perche, origine au pied de la perche. */
export function addLantern(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  batch.add(p.dark, new THREE.CylinderGeometry(0.03, 0.035, 0.9, 5), at(place, tf(0, 0.45, 0)));
  batch.add(p.dark, box(0.18, 0.03, 0.18), at(place, tf(0, 0.92, 0)));
  batch.add(p.glow, box(0.13, 0.17, 0.13), at(place, tf(0, 1.02, 0)));
  batch.add(p.dark, new THREE.ConeGeometry(0.13, 0.1, 4), at(place, tf(0, 1.16, 0, 0, Math.PI / 4)));
}

/** Pierrier sur chandelier (petit canon pivotant), canon pointé vers +X. Origine sur le plat-bord. */
export function buildCannonGeometry(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const metal = new THREE.MeshBasicMaterial(); // simple clé de regroupement : tout est fusionné en une pièce
  const alongX = -Math.PI / 2;
  batch.add(metal, new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), tf(0, -0.12, 0));
  batch.add(metal, box(0.06, 0.16, 0.24), tf(0, 0.02, 0));
  batch.add(metal, new THREE.CylinderGeometry(0.065, 0.095, 0.95, 8), tf(0.25, 0.1, 0, 0, 0, alongX));
  batch.add(metal, new THREE.CylinderGeometry(0.08, 0.08, 0.07, 8), tf(0.69, 0.1, 0, 0, 0, alongX));
  batch.add(metal, new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), tf(-0.1, 0.1, 0, 0, 0, alongX));
  batch.add(metal, new THREE.IcosahedronGeometry(0.06, 0), tf(-0.27, 0.1, 0));
  return batch.build()[0].geometry;
}

/** Canon de pont sur affût à roues (sloop), fût pointé vers +X. Origine sous l'affût, sur le pont. */
export function buildCarriageGunGeometry(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  const alongX = -Math.PI / 2;
  batch.add(key, box(0.75, 0.22, 0.5), tf(0.05, 0.18, 0));
  for (const x of [-0.22, 0.32]) for (const z of [-0.27, 0.27]) {
    batch.add(key, new THREE.CylinderGeometry(0.12, 0.12, 0.07, 8), tf(x, 0.12, z, Math.PI / 2));
  }
  batch.add(key, new THREE.CylinderGeometry(0.085, 0.13, 1.3, 8), tf(0.35, 0.38, 0, 0, 0, alongX));
  batch.add(key, new THREE.CylinderGeometry(0.105, 0.105, 0.08, 8), tf(0.96, 0.38, 0, 0, 0, alongX));
  batch.add(key, new THREE.IcosahedronGeometry(0.08, 0), tf(-0.34, 0.38, 0));
  return batch.build()[0].geometry;
}

/** Pavillon dessiné sur un canvas : tête de mort (pirates) ou couronne (marine royale). */
export function buildFlagTexture(kind: Livery['flag']): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 84;
  const g = canvas.getContext('2d')!;
  const disc = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  if (kind !== 'crown') {
    // Fond noir (gris délavé pour le pavillon fantôme), os croisés et crâne.
    const background = kind === 'ghostSkull' ? '#262b2c' : '#121212';
    g.fillStyle = background;
    g.fillRect(0, 0, 128, 84);
    g.fillStyle = kind === 'skull' ? '#ece6d6' : kind === 'redSkull' ? '#b3201a' : '#a9d6b8';
    for (const angle of [0.55, -0.55]) {
      g.save();
      g.translate(64, 52);
      g.rotate(angle);
      g.fillRect(-36, -4, 72, 8);
      for (const x of [-36, 36]) for (const y of [-4, 4]) disc(x, y, 5);
      g.restore();
    }
    disc(64, 34, 17);
    g.fillRect(55, 40, 18, 13);
    g.fillStyle = background;
    disc(57, 33, 5);
    disc(71, 33, 5);
    g.fillRect(58, 47, 2, 6);
    g.fillRect(63, 47, 2, 6);
    g.fillRect(68, 47, 2, 6);
  } else {
    g.fillStyle = '#a3222a';
    g.fillRect(0, 0, 128, 84);
    g.fillStyle = '#e8c34a';
    g.fillRect(44, 48, 40, 10);
    g.beginPath();
    g.moveTo(44, 48);
    for (const [x, y] of [[44, 26], [54, 38], [64, 22], [74, 38], [84, 26], [84, 48]]) g.lineTo(x, y);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
