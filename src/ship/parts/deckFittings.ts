import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { HullShape, Station } from './hullShape';
import type { Palette } from './props';
import { cylinderBetween } from './sails';

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
/** Petits escaliers des châteaux : hauteur visée d'une marche (m) ; le nombre de marches s'en déduit. */
const CASTLE_STAIR_RISE = 0.36;

/**
 * Petit escalier plein contre la cloison d'un château, du pont `from` au pont `to`, en (x, z) au pied de la cloison ;
 * `facing` = 1 s'il monte vers l'arrière (cloison d'un château arrière), -1 vers l'avant (château avant).
 */
export function addCastleStairs(batch: GeometryBatch, p: Palette, x: number, z: number, from: number, to: number, facing: 1 | -1, width = 0.6) {
  const rise = to - from;
  addStairs(batch, p, tf(x, from, z, 0, facing === 1 ? 0 : Math.PI), rise, Math.max(2, Math.round(rise / CASTLE_STAIR_RISE)), width);
}

/** Échelles raides des châteaux : inclinaison (rad, depuis la verticale), largeur, écart des barreaux (m). */
const LADDER = { lean: 0.35, width: 0.55, rung: 0.32 };

/**
 * Échelle raide contre une cloison, du pont `from` au pont `to`, en (x, z) au pied de la cloison ; `facing` = 1 si
 * l'on monte vers l'arrière (cloison d'un château arrière), -1 vers l'avant.
 */
export function addLadder(batch: GeometryBatch, p: Palette, x: number, z: number, from: number, to: number, facing: 1 | -1) {
  const rise = to - from;
  const run = rise * Math.tan(LADDER.lean);
  const foot = (dx: number) => new THREE.Vector3(x + dx, from, z + facing * (run + 0.1));
  const head = (dx: number) => new THREE.Vector3(x + dx, to + 0.5, z + facing * 0.05 - facing * Math.tan(LADDER.lean) * 0.5);
  for (const dx of [-LADDER.width / 2, LADDER.width / 2]) batch.add(p.wood, cylinderBetween(foot(dx), head(dx), 0.045, 0.045, 4), new THREE.Matrix4());
  for (let y = LADDER.rung; y < rise; y += LADDER.rung) {
    const t = y / (rise + 0.5);
    const a = foot(-LADDER.width / 2).lerp(head(-LADDER.width / 2), t);
    batch.add(p.dark, cylinderBetween(a, a.clone().setX(x + LADDER.width / 2), 0.03, 0.03, 4), new THREE.Matrix4());
  }
}

/** Points de hauteur pris sur le bordé pour dessiner une cloison qui l'épouse. */
const BULKHEAD_STEPS = 6;

/**
 * Cloison d'un étage de château, de `from` à `to` (m), à la station `s` : elle épouse le bordé qui rentre (pas de jour
 * sur les côtés, rien qui dépasse) ; `facing` = 1 si elle regarde vers l'avant, -1 vers l'arrière. Renvoie de quoi
 * plaquer des portes et des fenêtres sur sa face.
 */
export function bulkhead(batch: GeometryBatch, p: Palette, hull: HullShape, s: Station, from: number, to: number, facing: 1 | -1) {
  const ys = Array.from({ length: BULKHEAD_STEPS + 1 }, (_, i) => from + ((to - from) * i) / BULKHEAD_STEPS);
  const shape = new THREE.Shape();
  ys.forEach((y, i) => (i === 0 ? shape.moveTo(hull.halfWidthAt(s, y) * 0.995, y) : shape.lineTo(hull.halfWidthAt(s, y) * 0.995, y)));
  for (const y of [...ys].reverse()) shape.lineTo(-hull.halfWidthAt(s, y) * 0.995, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
  geometry.translate(0, 0, s.z - 0.07);
  batch.add(p.wood, geometry, new THREE.Matrix4());
  return (x: number, y: number, w: number, h: number, m: THREE.Material) => batch.add(m, box(w, h, 0.04), tf(x, y, s.z + facing * 0.08));
}
