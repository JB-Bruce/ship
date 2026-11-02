import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { sideTf, std } from '../parts/common';
import { addStairs } from '../parts/deckFittings';
import type { HullShape } from '../parts/hullShape';
import { addLantern, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DECK_Y, type FluytLayout } from './fluytLayout';

/** Bordé en bois clair verni, le même pour tous les camps : la couleur du camp passe sur les préceintes et le pavois. */
export const HULL_WOOD = std(0xbc8a52);
/** Lion de proue doré. */
const GILT = std(0xc8962e);
/** Balustrades de la dunette et du gaillard d'avant : hauteur, nombre de balustres par bord. */
const BALUSTRADE = { height: 0.45, posts: 7 };
/** Fenêtres du tableau arrière : grand-chambre (sous le gaillard d'arrière) et chambre de la dunette (hauteur du centre). */
const STERN_WINDOWS = [3.95, 5];
/** Étrave : sections (u de base) dont elle suit la quille, avant de monter droit au plat-bord. */
const STEM_LINE = [0.8, 0.88, 0.94, 0.98, 1];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);


/**
 * Cloisons et escaliers : gaillard d'arrière (porte et fenêtres de la grand-chambre), dunette (fenêtres de la chambre
 * du capitaine), gaillard d'avant ; balustrades de la dunette et du gaillard d'avant.
 */
export function addCastles(batch: GeometryBatch, p: Palette, L: FluytLayout) {
  const { hull, quarterdeck: qd, poop, forecastle: fc } = L;
  const qdFront = L.station(qd.to);
  const qdHeight = qd.y - DECK_Y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(qdFront, qd.y) * 0.98, qdHeight, 0.12), tf(0, DECK_Y + qdHeight / 2, qdFront.z));
  batch.add(p.dark, box(0.75, 1.25, 0.04), tf(0, DECK_Y + 0.63, qdFront.z + 0.07));
  for (const x of [-0.75, 0.75]) batch.add(p.window, box(0.36, 0.3, 0.04), tf(x, DECK_Y + 1.05, qdFront.z + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.45, DECK_Y, qdFront.z), qdHeight, 5, 0.55);

  const poopFront = L.station(poop.to);
  const poopHeight = poop.y - qd.y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(poopFront, poop.y) * 0.98, poopHeight, 0.12), tf(0, qd.y + poopHeight / 2, poopFront.z));
  for (const x of [-0.55, 0.55]) batch.add(p.window, box(0.32, 0.26, 0.04), tf(x, qd.y + 0.5, poopFront.z + 0.07));
  addStairs(batch, p, tf(-1, qd.y, poopFront.z), poopHeight, 4, 0.45);

  const fcFront = L.station(fc.from);
  const fcHeight = fc.y - DECK_Y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(fcFront, fc.y) * 0.97, fcHeight, 0.12), tf(0, DECK_Y + fcHeight / 2, fcFront.z));
  batch.add(p.dark, box(0.6, 0.85, 0.04), tf(0, DECK_Y + 0.43, fcFront.z - 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.15, DECK_Y, fcFront.z, 0, Math.PI), fcHeight, 4, 0.5);

  addBalustrade(batch, p, hull, poop.from, poop.to - 0.004, true);
  addBalustrade(batch, p, hull, fc.from + 0.004, fc.to, false);
}

/** Balustres sur le plat-bord et lisse d'appui, sur les deux bords (et en travers de la poupe si `stern`). */
function addBalustrade(batch: GeometryBatch, p: Palette, hull: HullShape, from: number, to: number, stern: boolean) {
  const { height, posts } = BALUSTRADE;
  for (const side of [1, -1]) {
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i < posts; i++) {
      const s = hull.stationAt(from + ((to - from) * i) / (posts - 1));
      const x = side * (hull.halfWidthAt(s, s.gunwale) - 0.04);
      batch.add(p.trim, box(0.07, height, 0.07), tf(x, s.gunwale + height / 2, s.z));
      rail.push(new THREE.Vector3(x, s.gunwale + height, s.z));
    }
    for (let i = 0; i < rail.length - 1; i++) batch.add(p.trim, cylinderBetween(rail[i], rail[i + 1], 0.05), new THREE.Matrix4());
  }
  if (!stern) return;
  const back = hull.stationAt(from);
  const half = hull.halfWidthAt(back, back.gunwale) - 0.04;
  for (const x of [-0.5, 0, 0.5]) batch.add(p.trim, box(0.07, height, 0.07), tf(x * half, back.gunwale + height / 2, back.z));
  batch.add(p.trim, box(2 * half + 0.1, 0.1, 0.12), tf(0, back.gunwale + height, back.z));
}

/**
 * Poupe haute et étroite : tableau plat à deux rangées de fenêtres, panneau peint aux couleurs du camp sous le
 * couronnement, fenêtres de la chambre sur les hanches, grand fanal sur la lisse de couronnement.
 */
export function addStern(batch: GeometryBatch, p: Palette, L: FluytLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const z = stern.z - 0.02;
  STERN_WINDOWS.forEach((y, row) => {
    const half = hull.halfWidthAt(stern, y);
    const xs = row === 0 ? [-1, -1 / 3, 1 / 3, 1] : [-0.8, 0, 0.8];
    for (const x of xs) batch.add(p.window, box(0.34, 0.42, 0.05), tf(x * (half - 0.35), y, z));
    for (const dy of [-0.32, 0.32]) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y + dy) - 0.06, 0.08, 0.06), tf(0, y + dy, z - 0.01));
  });
  // Panneau peint sous le couronnement, dans un cadre.
  const panelY = (STERN_WINDOWS[1] + 0.32 + stern.gunwale) / 2;
  const panelHeight = stern.gunwale - STERN_WINDOWS[1] - 0.5;
  const panelHalf = hull.halfWidthAt(stern, panelY + panelHeight / 2) - 0.12;
  batch.add(p.hull, box(2 * panelHalf, panelHeight, 0.05), tf(0, panelY, z - 0.01));
  batch.add(p.trim, box(2 * panelHalf + 0.14, panelHeight + 0.14, 0.03), tf(0, panelY, z + 0.005));
  batch.add(GILT, new THREE.SphereGeometry(0.22, 6, 4), tf(0, panelY, z - 0.05, 0, 0, 0, [1, 1, 0.4]));
  batch.add(p.trim, box(2 * hull.halfWidthAt(stern, stern.gunwale) + 0.14, 0.14, 0.22), tf(0, stern.gunwale, stern.z + 0.07));
  for (const side of [1, -1] as const) {
    for (const u of [-0.95, -0.88]) batch.add(p.window, box(0.05, 0.36, 0.3), sideTf(hull, hull.stationAt(L.base(u)), STERN_WINDOWS[1], side, 0.02));
  }
  addLantern(batch, p, tf(0, stern.gunwale + 0.07, stern.z + 0.2, 0, 0, 0, 1.4));
}

/** Avant : étrave, beaupré très relevé et vergue de civadière, bossoirs, lion de proue doré. */
export function addBow(batch: GeometryBatch, p: Palette, L: FluytLayout) {
  const { hull, forecastle: fc } = L;
  const stem = hull.stationAt(1);
  // Étrave : elle suit l'avant arrondi, du fond jusqu'au plat-bord.
  const line = [...STEM_LINE.map((u) => hull.stationAt(L.base(u))).map((s) => new THREE.Vector3(0, s.keel, s.z)), new THREE.Vector3(0, stem.gunwale + 0.1, stem.z)];
  for (let i = 0; i < line.length - 1; i++) batch.add(p.trim, cylinderBetween(line[i], line[i + 1], 0.11, 0.11, 4), new THREE.Matrix4());
  const { base, tip } = L.bowsprit;
  batch.add(p.wood, cylinderBetween(base.clone().add(new THREE.Vector3(0, -0.5, -1.2)), tip, 0.2, 0.09), new THREE.Matrix4());
  const sprit = L.spritsail;
  batch.add(p.wood, cylinderBetween(sprit.yard.clone().setX(-sprit.width / 2 - 0.2), sprit.yard.clone().setX(sprit.width / 2 + 0.2), 0.07), new THREE.Matrix4());
  // Bossoirs : deux poutres qui débordent du gaillard d'avant, pour les ancres.
  const cat = L.at(0.9);
  for (const side of [1, -1]) batch.add(p.wood, box(0.9, 0.16, 0.16), tf(side * (hull.halfWidthAt(cat, fc.y + 0.55) + 0.2), fc.y + 0.55, cat.z));
  // Lion de proue, couché sur l'éperon sous le beaupré.
  batch.add(GILT, box(0.26, 0.5, 0.75), tf(0, 2.75, stem.z + 0.05, 0.6));
  batch.add(GILT, new THREE.SphereGeometry(0.2, 6, 4), tf(0, 3.1, stem.z + 0.38));
}
