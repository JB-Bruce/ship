import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { sideTf, std } from '../parts/common';
import { addCastleStairs, bulkhead } from '../parts/deckFittings';
import { addLantern, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DECK_Y, FORE_LOWER_Y, type CarrackLayout, type Deck } from './carrackLayout';

/** Bordé en chêne, le même pour tous les camps ; préceintes et lisses verticales en bois sombre. */
export const HULL_OAK = std(0x8a5a32);
export const DARK_OAK = std(0x5a381c);
/** Pavois peints (aux couleurs du camp) le long des plats-bords : écartement, taille (m). */
const PAVISE = { spacing: 0.78, width: 0.5, height: 0.5, below: 0.36, portClearance: 0.55 };
/** Fenêtres du tableau arrière : chambre sous le gaillard d'arrière, chambre de la dunette (hauteur du centre). */
const STERN_WINDOWS = [6.7, 8.8];
/** Étrave : sections (u de base) dont elle suit la quille, sous le château avant qui déborde. */
const STEM_LINE = [0.8, 0.88, 0.94, 0.98, 1];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * Châteaux : cloisons (portes, fenêtres) et petits escaliers du demi-pont, du gaillard d'arrière, de la dunette et du château
 * avant (deux étages, sabords de chasse dans sa face avant).
 */
export function addCastles(batch: GeometryBatch, p: Palette, L: CarrackLayout) {
  const { hull, halfDeck, quarterdeck, poop, forecastle } = L;
  const front = (d: Deck) => L.station(d.to);

  const hd = bulkhead(batch, p, hull, front(halfDeck), DECK_Y, halfDeck.y, 1);
  hd(0, DECK_Y + 0.7, 0.85, 1.4, p.dark);
  for (const x of [-1.4, 1.4]) hd(x, DECK_Y + 1.6, 0.42, 0.36, p.window);
  for (const side of [1, -1]) addCastleStairs(batch, p, side * 2, front(halfDeck).z, DECK_Y, halfDeck.y, 1);

  const qd = bulkhead(batch, p, hull, front(quarterdeck), halfDeck.y, quarterdeck.y, 1);
  qd(0.3, halfDeck.y + 0.7, 0.8, 1.35, p.dark);
  for (const x of [-1.3, 1.6]) qd(x, halfDeck.y + 1.3, 0.38, 0.34, p.window);
  addCastleStairs(batch, p, -1.4, front(quarterdeck).z, halfDeck.y, quarterdeck.y, 1);

  const pp = bulkhead(batch, p, hull, front(poop), quarterdeck.y, poop.y, 1);
  pp(-0.3, quarterdeck.y + 0.7, 0.75, 1.35, p.dark);
  for (const x of [-1.3, 1.1]) pp(x, quarterdeck.y + 1.3, 0.34, 0.32, p.window);
  addCastleStairs(batch, p, 1.2, front(poop).z, quarterdeck.y, poop.y, 1);

  // Château avant : cloison sur deux étages (portes en bas, fenêtres en haut), escaliers depuis le milieu.
  const fcBack = L.station(forecastle.from);
  const fc = bulkhead(batch, p, hull, fcBack, DECK_Y, forecastle.y, -1);
  fc(0, DECK_Y + 0.7, 0.8, 1.4, p.dark);
  for (const x of [-1.2, 0, 1.2]) fc(x, FORE_LOWER_Y + 1.1, 0.36, 0.34, p.window);
  batch.add(p.trim, box(2 * hull.halfWidthAt(fcBack, FORE_LOWER_Y) * 0.98, 0.12, 0.2), tf(0, FORE_LOWER_Y, fcBack.z - 0.1));
  for (const side of [1, -1]) addCastleStairs(batch, p, side * 1.8, fcBack.z, DECK_Y, forecastle.y, -1);
}

/** Pavois peints le long des plats-bords, du milieu et des châteaux (pas sur les marches ni devant les sabords), aux couleurs du camp. */
export function addPavises(batch: GeometryBatch, p: Palette, L: CarrackLayout) {
  const { hull } = L;
  const runs = [
    [L.base(-0.99), L.base(-0.725)],
    [L.base(-0.705), L.base(-0.49)],
    [L.base(-0.47), L.base(-0.215)],
    [L.base(-0.195), L.base(0.54)],
    [L.base(0.565), L.base(0.99)],
  ];
  const half = hull.halfLength;
  // Pas de pavois devant un sabord des pièces des châteaux.
  const ports = L.castleSlots.map((c) => L.station(c.u).z);
  for (const [from, to] of runs) {
    const n = Math.max(1, Math.floor(((to - from) * half) / PAVISE.spacing));
    for (let i = 0; i < n; i++) {
      const s = hull.stationAt(from + ((to - from) * (i + 0.5)) / n);
      if (ports.some((z) => Math.abs(z - s.z) < PAVISE.portClearance)) continue;
      const y = s.gunwale - PAVISE.below;
      for (const side of [1, -1] as const) {
        batch.add(p.hull, box(0.05, PAVISE.height * 0.7, PAVISE.width), sideTf(hull, s, y + PAVISE.height * 0.15, side, 0.05));
        batch.add(p.hull, box(0.05, PAVISE.height * 0.35, PAVISE.width * 0.5), sideTf(hull, s, y - PAVISE.height * 0.3, side, 0.05));
      }
    }
  }
}

/** Lisses verticales qui renforcent le bordé, entre les sabords de la batterie, du bouchain au plat-bord du milieu. */
export function addRiders(batch: GeometryBatch, L: CarrackLayout) {
  const { hull, batteryPorts } = L;
  for (let k = 0; k < batteryPorts.length - 1; k++) {
    const s = L.station((batteryPorts[k] + batteryPorts[k + 1]) / 2);
    const top = Math.min(s.gunwale, DECK_Y + 0.9) - 0.35;
    for (const side of [1, -1]) {
      const points = [0.4, (0.4 + top) / 2, top].map((y) => new THREE.Vector2(side * (hull.halfWidthAt(s, y) + 0.04), y));
      for (let i = 0; i < 2; i++) {
        const [a, b] = [points[i], points[i + 1]];
        batch.add(DARK_OAK, box(0.1, a.distanceTo(b) + 0.06, 0.14), tf((a.x + b.x) / 2, (a.y + b.y) / 2, s.z, 0, 0, Math.atan2(a.x - b.x, b.y - a.y)));
      }
    }
  }
}

/** Poupe haute : tableau à deux rangées de fenêtres entre des moulures, bande peinte aux couleurs du camp sous le couronnement, trois fanaux sur la lisse. */
export function addStern(batch: GeometryBatch, p: Palette, L: CarrackLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const z = stern.z - 0.02;
  STERN_WINDOWS.forEach((y, row) => {
    const half = hull.halfWidthAt(stern, y);
    const xs = row === 0 ? [-1, -1 / 3, 1 / 3, 1] : [-0.75, 0, 0.75];
    for (const x of xs) batch.add(p.window, box(0.38, 0.46, 0.05), tf(x * (half - 0.45), y, z));
    for (const dy of [-0.36, 0.36]) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y + dy) - 0.08, 0.09, 0.06), tf(0, y + dy, z - 0.01));
  });
  const bandY = stern.gunwale - 0.45;
  batch.add(p.hull, box(2 * hull.halfWidthAt(stern, bandY + 0.25) - 0.1, 0.5, 0.05), tf(0, bandY, z - 0.01));
  batch.add(p.trim, box(2 * hull.halfWidthAt(stern, stern.gunwale) + 0.14, 0.16, 0.24), tf(0, stern.gunwale, stern.z + 0.08));
  for (const x of [-1, 0, 1]) addLantern(batch, p, tf(x * 0.9, stern.gunwale + 0.08, stern.z + 0.25, 0, 0, 0, x === 0 ? 1.2 : 0.9));
}

/** Avant : étrave sous le château qui déborde, sabords de chasse dans sa face avant, bossoirs, beaupré et civadière. */
export function addBow(batch: GeometryBatch, p: Palette, L: CarrackLayout) {
  const { hull, forecastle } = L;
  const stem = hull.stationAt(1);
  const line = STEM_LINE.map((u) => hull.stationAt(L.base(u))).map((s) => new THREE.Vector3(0, s.keel, s.z));
  for (let i = 0; i < line.length - 1; i++) batch.add(p.trim, cylinderBetween(line[i], line[i + 1], 0.13, 0.13, 4), new THREE.Matrix4());
  for (const { x, y } of L.chase.guns) batch.add(p.dark, box(0.5, 0.48, 0.06), tf(x, y, stem.z + 0.02));
  batch.add(p.trim, box(2 * hull.halfWidthAt(stem, FORE_LOWER_Y) - 0.1, 0.12, 0.12), tf(0, FORE_LOWER_Y, stem.z + 0.04));
  const cat = L.at(0.94);
  for (const side of [1, -1]) batch.add(p.wood, box(1, 0.18, 0.18), tf(side * (hull.halfWidthAt(cat, forecastle.y + 0.5) + 0.25), forecastle.y + 0.5, cat.z));
  const { base, tip } = L.bowsprit;
  batch.add(p.wood, cylinderBetween(base.clone().add(new THREE.Vector3(0, -0.4, -1.4)), tip, 0.24, 0.11), new THREE.Matrix4());
  const sprit = L.spritsail;
  batch.add(p.wood, cylinderBetween(sprit.yard.clone().setX(-sprit.width / 2 - 0.2), sprit.yard.clone().setX(sprit.width / 2 + 0.2), 0.08), new THREE.Matrix4());
}
