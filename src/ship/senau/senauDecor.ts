import * as THREE from 'three';
import { std } from '../parts/common';
import { addStairs } from '../parts/deckFittings';
import { HullShape } from '../parts/hullShape';
import { addLantern, type Palette } from '../parts/props';
import type { GeometryBatch } from '../../utils/geometryBatch';
import { tf } from '../../utils/geometryBatch';
import { DECK_Y, QUARTERDECK, type SenauLayout } from './senauLayout';

/** Figure de proue : un ocre doré, le même pour tous les camps. */
const gilt = std(0xd8a23a);
/** Fenêtres de la chambre (tableau et galerie) : hauteur de leur centre (m). */
const CABIN_WINDOW_Y = (DECK_Y + QUARTERDECK.y) / 2 + 0.15;
/** Galerie de poupe : balcon qui court le long du tableau, sous les fenêtres (profondeur, hauteur de la lisse, pas des balustres, m). */
const GALLERY = { depth: 0.6, rail: 0.75, post: 0.42 };
/** Chaloupe posée sur le pont : demi-longueur, demi-largeur (m), et hauteur de ses chantiers. */
const BOAT = { half: 2.4, width: 0.8, chocks: 0.3 };
const BOAT_HULL = new HullShape(
  [
    [-1, 0.62, 0.55, -0.2],
    [-0.5, 0.92, 0.5, -0.34],
    [0.2, 1, 0.5, -0.36],
    [0.7, 0.72, 0.55, -0.26],
    [1, 0.05, 0.62, -0.05],
  ],
  BOAT.half,
  BOAT.width,
);

/** Cloison du gaillard d'arrière (porte, fenêtres), escaliers du pont, fenêtres de la chambre sur les flancs. */
export function addQuarterdeck(batch: GeometryBatch, p: Palette, L: SenauLayout) {
  const { hull, at } = L;
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const front = at(QUARTERDECK.to);
  const rise = QUARTERDECK.y - DECK_Y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(front, DECK_Y + rise / 2) * 0.98, rise, 0.12), tf(0, DECK_Y + rise / 2, L.bulkhead));
  batch.add(p.dark, box(0.75, 0.9, 0.04), tf(0, DECK_Y + 0.45, L.bulkhead + 0.07));
  for (const x of [-1.4, 1.4]) batch.add(p.window, box(0.38, 0.26, 0.04), tf(x, DECK_Y + 0.62, L.bulkhead + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 2, DECK_Y, L.bulkhead), rise, 3);
  for (const side of [1, -1]) {
    for (const u of [-0.92, -0.8, -0.68]) {
      const s = at(u);
      batch.add(p.window, box(0.05, 0.3, 0.38), tf(side * (hull.halfWidthAt(s, CABIN_WINDOW_Y) + 0.03), CABIN_WINDOW_Y, s.z));
    }
  }
}

/**
 * Poupe à galerie : fenêtres de la chambre sur le tableau, balcon qui court devant elles (plancher, balustres, lisse),
 * moulures, couronnement et fanal sur la hanche (la bôme passe au-dessus).
 */
export function addStern(batch: GeometryBatch, p: Palette, L: SenauLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const half = hull.halfWidthAt(stern, CABIN_WINDOW_Y);
  for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) batch.add(p.window, box(0.3, 0.42, 0.05), tf(x * half, CABIN_WINDOW_Y, stern.z - 0.02));
  batch.add(p.trim, box(2 * hull.halfWidthAt(stern, CABIN_WINDOW_Y + 0.36) - 0.1, 0.08, 0.06), tf(0, CABIN_WINDOW_Y + 0.36, stern.z - 0.03));
  // Balcon : plancher sous les fenêtres, balustres, lisse.
  const floor = CABIN_WINDOW_Y - 0.4;
  const width = 2 * hull.halfWidthAt(stern, floor) - 0.2;
  const z = stern.z - GALLERY.depth / 2;
  batch.add(p.trim, box(width, 0.1, GALLERY.depth), tf(0, floor, z));
  batch.add(p.trim, box(width, 0.07, 0.08), tf(0, floor + GALLERY.rail, stern.z - GALLERY.depth + 0.04));
  for (let x = -width / 2 + 0.05; x <= width / 2; x += GALLERY.post) {
    batch.add(p.wood, box(0.05, GALLERY.rail, 0.05), tf(x, floor + GALLERY.rail / 2, stern.z - GALLERY.depth + 0.04));
  }
  for (const side of [1, -1]) batch.add(p.trim, box(0.08, GALLERY.rail, GALLERY.depth), tf(side * width / 2, floor + GALLERY.rail / 2, z));
  batch.add(p.trim, box(2 * stern.halfWidth + 0.14, 0.15, 0.24), tf(0, stern.gunwale, stern.z + 0.04));
  addLantern(batch, p, tf(stern.halfWidth * 0.75, stern.gunwale + 0.08, stern.z + 0.25, 0, 0, 0, 0.85));
}

/** Étrave, figure de proue dorée sous le beaupré, beaupré et bout-dehors. */
export function addBow(batch: GeometryBatch, p: Palette, L: SenauLayout, cylinderBetween: (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => THREE.BufferGeometry) {
  const stem = L.hull.stationAt(1);
  batch.add(p.trim, new THREE.BoxGeometry(0.15, stem.gunwale - stem.keel + 0.2, 0.18), tf(0, (stem.gunwale + stem.keel) / 2, stem.z - 0.05, -0.2));
  const { base, tip } = L.bowsprit;
  const joint = base.clone().lerp(tip, 0.55);
  batch.add(p.wood, cylinderBetween(base, joint, 0.19, 0.13), new THREE.Matrix4());
  batch.add(p.wood, cylinderBetween(joint.clone().add(new THREE.Vector3(0, 0.13, -0.6)), tip, 0.1, 0.05), new THREE.Matrix4());
  batch.add(p.dark, new THREE.BoxGeometry(0.32, 0.32, 0.32), tf(0, joint.y + 0.06, joint.z));
  batch.add(gilt, new THREE.BoxGeometry(0.24, 0.8, 0.34), tf(0, 2.4, stem.z - 0.08, 0.5));
  batch.add(gilt, new THREE.SphereGeometry(0.16, 6, 4), tf(0, 2.85, stem.z + 0.12));
}

/** Chaloupe retournée à l'endroit sur ses chantiers, au milieu du pont, avec ses bancs. */
export function addBoat(batch: GeometryBatch, p: Palette, L: SenauLayout) {
  const y = DECK_Y + BOAT.chocks + 0.36;
  const place = tf(0, y, L.boatZ);
  const shell = BOAT_HULL.buildHull();
  batch.add(p.hull, shell, place);
  batch.add(p.hullInside, shell.clone(), place);
  for (const u of [-0.45, 0.05, 0.5]) {
    const s = BOAT_HULL.stationAt(u);
    batch.add(p.wood, new THREE.BoxGeometry(2 * s.halfWidth * 0.92, 0.05, 0.22), tf(0, y + 0.3, L.boatZ + s.z));
  }
  for (const dz of [-1.3, 1.3]) batch.add(p.wood, new THREE.BoxGeometry(1.4, BOAT.chocks, 0.2), tf(0, DECK_Y + BOAT.chocks / 2, L.boatZ + dz));
}
