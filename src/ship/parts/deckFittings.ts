import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Palette } from './props';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const at = (parent: THREE.Matrix4, local: THREE.Matrix4) => parent.clone().multiply(local);

/**
 * Escalier plein posé sur le pont, au pied d'une cloison. `place` : pied de la cloison, au niveau du pont,
 * +Z local vers le pont (l'escalier monte vers la cloison, en -Z). Chaque marche descend jusqu'au plancher,
 * et la plus haute mord de 2 cm dans la cloison (aucun jour visible).
 */
export function addStairs(batch: GeometryBatch, p: Palette, place: THREE.Matrix4, rise: number, steps: number, width = 0.6) {
  const depth = 0.29;
  const stepRise = rise / (steps + 0.3);
  for (let i = 0; i < steps; i++) {
    const top = stepRise * (i + 1);
    const z = 0.04 + depth * (steps - i - 0.5);
    batch.add(p.wood, box(width, top, depth), at(place, tf(0, top / 2, z)));
    batch.add(p.dark, box(width + 0.02, 0.02, 0.02), at(place, tf(0, top + 0.005, z + depth / 2)));
  }
}

/**
 * Écoutille vers la batterie, au niveau du pont (`place`) : hiloire (cadre surélevé) puis, au choix,
 * un caillebotis (grille de lattes qui laisse passer la lumière et la fumée des canons) ou une trappe ouverte
 * — trou sombre, haut de l'échelle qui descend, panneau relevé contre la hiloire.
 */
export function addHatch(batch: GeometryBatch, p: Palette, place: THREE.Matrix4, width: number, length: number, kind: 'grating' | 'open') {
  const add = (m: THREE.Material, g: THREE.BufferGeometry, local: THREE.Matrix4) => batch.add(m, g, at(place, local));
  const coaming = 0.18;
  const rim = 0.1;
  add(p.trim, box(width + 2 * rim, coaming, rim), tf(0, coaming / 2, length / 2 + rim / 2));
  add(p.trim, box(width + 2 * rim, coaming, rim), tf(0, coaming / 2, -length / 2 - rim / 2));
  add(p.trim, box(rim, coaming, length), tf(width / 2 + rim / 2, coaming / 2, 0));
  add(p.trim, box(rim, coaming, length), tf(-width / 2 - rim / 2, coaming / 2, 0));
  // Le fond : l'obscurité de l'entrepont.
  add(p.dark, box(width, 0.02, length), tf(0, 0.02, 0));
  if (kind === 'grating') {
    const pitch = 0.19;
    for (let x = -width / 2 + pitch / 2; x < width / 2; x += pitch) add(p.wood, box(0.05, 0.05, length), tf(x, coaming - 0.04, 0));
    for (let z = -length / 2 + pitch / 2; z < length / 2; z += pitch) add(p.wood, box(width, 0.04, 0.05), tf(0, coaming - 0.07, z));
    return;
  }
  // Échelle : deux montants qui sortent du trou côté avant, et leurs échelons.
  for (const x of [-0.22, 0.22]) add(p.wood, box(0.06, 1.2, 0.06), tf(x, -0.3, length / 2 - 0.12, -0.35));
  for (let i = 0; i < 3; i++) add(p.wood, box(0.44, 0.04, 0.05), tf(0, -0.65 + i * 0.32, length / 2 - 0.25 + i * 0.11));
  // Panneau relevé, appuyé en arrière contre la hiloire.
  add(p.wood, box(width + 0.1, 0.07, length + 0.1), tf(0, coaming + length / 2 - 0.02, -length / 2 - rim - 0.16, 1.35));
}
