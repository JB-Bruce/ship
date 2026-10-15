import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { sideTf, std } from '../parts/common';
import { addLadder, bulkhead } from '../parts/deckFittings';
import type { Palette } from '../parts/props';
import { DECK_Y, type Deck, type GalleonLayout } from './galleonLayout';

/** Bordé, le même pour tous les camps ; préceintes en bois sombre ; dorures (moulures, pavois, galeries, lion de proue). */
export const HULL_WOOD = std(0x8a5a32);
export const DARK_WOOD = std(0x4e3018);
export const GILT = std(0xc9a227, { metalness: 0.45, roughness: 0.45 });
/** Pavois dorés le long des plats-bords, sur les hauts peints : écartement, taille (m). */
const PAVISE = { spacing: 0.8, width: 0.5, height: 0.5, below: 0.36, portClearance: 0.55 };
/** Moulures dorées le long des châteaux, à hauteur de leurs ponts : longueur des segments, section (m). */
const MOULDING = { segment: 0.9, height: 0.1, depth: 0.06 };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * Châteaux : cloisons (portes, fenêtres) et échelles du demi-pont, du gaillard, de la dunette et du château avant
 * (cloison arrière vers le milieu, cloison avant vers le petit pont de l'avant et la poulaine).
 */
export function addCastles(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull, halfDeck, quarterdeck, poop, forecastle } = L;
  const front = (d: Deck) => L.station(d.to);

  const hd = bulkhead(batch, p, hull, front(halfDeck), DECK_Y, halfDeck.y, 1);
  hd(0, DECK_Y + 0.75, 0.9, 1.5, p.dark);
  for (const x of [-1.6, 1.6]) hd(x, DECK_Y + 1.65, 0.44, 0.38, p.window);
  for (const side of [1, -1]) addLadder(batch, p, side * 2.3, front(halfDeck).z, DECK_Y, halfDeck.y, 1);

  const qd = bulkhead(batch, p, hull, front(quarterdeck), halfDeck.y, quarterdeck.y, 1);
  qd(0.4, halfDeck.y + 0.72, 0.8, 1.4, p.dark);
  for (const x of [-1.4, 1.7]) qd(x, halfDeck.y + 1.3, 0.4, 0.36, p.window);
  addLadder(batch, p, -1.5, front(quarterdeck).z, halfDeck.y, quarterdeck.y, 1);

  const pp = bulkhead(batch, p, hull, front(poop), quarterdeck.y, poop.y, 1);
  pp(-0.3, quarterdeck.y + 0.72, 0.75, 1.4, p.dark);
  for (const x of [-1.3, 1.1]) pp(x, quarterdeck.y + 1.3, 0.36, 0.34, p.window);
  addLadder(batch, p, 1.2, front(poop).z, quarterdeck.y, poop.y, 1);

  const fcBack = L.station(forecastle.from);
  const fb = bulkhead(batch, p, hull, fcBack, DECK_Y, forecastle.y, -1);
  fb(0, DECK_Y + 0.75, 0.85, 1.5, p.dark);
  for (const x of [-1.4, 1.4]) fb(x, DECK_Y + 1.7, 0.4, 0.36, p.window);
  for (const side of [1, -1]) addLadder(batch, p, side * 2, fcBack.z, DECK_Y, forecastle.y, -1);
  const ff = bulkhead(batch, p, hull, L.station(forecastle.to), DECK_Y, forecastle.y, 1);
  ff(0, DECK_Y + 0.7, 0.7, 1.4, p.dark);
  for (const x of [-0.95, 0.95]) ff(x, DECK_Y + 1.7, 0.34, 0.32, p.window);
}

/** Pavois dorés le long des plats-bords du milieu et des châteaux (pas sur les marches ni devant les sabords des pièces légères). */
export function addPavises(batch: GeometryBatch, L: GalleonLayout) {
  const { hull } = L;
  const runs = [
    [L.base(-0.99), L.base(-0.71)],
    [L.base(-0.688), L.base(-0.46)],
    [L.base(-0.438), L.base(-0.238)],
    [L.base(-0.216), L.base(0.595)],
    [L.base(0.617), L.base(0.92)],
  ];
  const half = hull.halfLength;
  const ports = L.pieceSlots.map((c) => L.station(c.u).z);
  for (const [from, to] of runs) {
    const n = Math.max(1, Math.floor(((to - from) * half) / PAVISE.spacing));
    for (let i = 0; i < n; i++) {
      const s = hull.stationAt(from + ((to - from) * (i + 0.5)) / n);
      if (ports.some((z) => Math.abs(z - s.z) < PAVISE.portClearance)) continue;
      const y = s.gunwale - PAVISE.below;
      for (const side of [1, -1] as const) {
        batch.add(GILT, box(0.05, PAVISE.height * 0.7, PAVISE.width), sideTf(hull, s, y + PAVISE.height * 0.15, side, 0.05));
        batch.add(GILT, box(0.05, PAVISE.height * 0.35, PAVISE.width * 0.5), sideTf(hull, s, y - PAVISE.height * 0.3, side, 0.05));
      }
    }
  }
}

/**
 * Moulures dorées le long des flancs des châteaux, à la hauteur de chacun de leurs ponts : de courts segments qui
 * suivent le bordé (il rentre et se resserre vers la poupe), sur les deux bords.
 */
export function addMouldings(batch: GeometryBatch, L: GalleonLayout) {
  const { hull, halfDeck, quarterdeck, poop, forecastle } = L;
  const runs: [number, number, number][] = [
    [halfDeck.y, -1, halfDeck.to],
    [quarterdeck.y, -1, quarterdeck.to],
    [poop.y, -1, poop.to],
    [forecastle.y, forecastle.from, forecastle.to],
  ];
  for (const [y, from, to] of runs) {
    const n = Math.max(1, Math.round(((to - from) * hull.halfLength) / MOULDING.segment));
    for (const side of [1, -1]) {
      const points = Array.from({ length: n + 1 }, (_, i) => {
        const s = hull.stationAt(from + ((to - from) * i) / n);
        return new THREE.Vector3(side * (hull.halfWidthAt(s, y) + MOULDING.depth / 2), y, s.z);
      });
      for (let i = 0; i < n; i++) {
        const [a, b] = [points[i], points[i + 1]];
        batch.add(GILT, box(MOULDING.depth, MOULDING.height, a.distanceTo(b) + 0.02), tf((a.x + b.x) / 2, y, (a.z + b.z) / 2, 0, Math.atan2(b.x - a.x, b.z - a.z)));
      }
    }
  }
}
