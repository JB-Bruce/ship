import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { sideTf, std } from '../parts/common';
import { addLadder, bulkhead } from '../parts/deckFittings';
import { addLantern, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DECK_Y, TRIPLE_Y, WALES, type GalleassLayout } from './galleassLayout';

/** Bordé, le même pour tous les camps ; préceintes en bois sombre. */
export const HULL_WOOD = std(0x7a4e2c);
export const DARK_WOOD = std(0x4e3018);
/** Pavois au liseré du camp, sur le haut du bordé peint, le long du plat-bord du milieu : écartement, taille (m). */
const PAVISE = { spacing: 0.8, width: 0.52, height: 0.5, below: 0.36, portClearance: 0.5 };
/** Balustrades des châteaux : hauteur, écart des balustres, place laissée aux échelles et aux pièces du château avant (m). */
const BALUSTRADE = { height: 0.55, spacing: 0.5, clearance: 0.45 };
/** Échelles des châteaux (écart de l'axe, m). */
const LADDER_X = { stern: 1.5, fore: 1.6 };
/**
 * Tendelet du château de poupe, en bandes de toile aux couleurs du camp et claires : arceau entre ces sections (u de
 * base) sur des montants, retrait des bords par rapport au bordé, flèche de l'arceau (part du rayon), nombre de bandes.
 */
const AWNING = { aft: -0.96, fore: -0.7, posts: 1.15, inset: 0.4, rise: 0.42, stripes: 7 };
/** Étrave : sections (u de base) dont elle suit la quille, qui remonte en courbe jusque sous la face avant. */
const STEM_LINE = [0.8, 0.86, 0.91, 0.95, 0.98, 1];
/** Fenêtres de la chambre sous le château de poupe : hauteur, places sur les flancs (u de base) et sur le tableau (x, part de la largeur). */
const CABIN = { y: 4.1, sides: [-0.74, -0.86], stern: [-0.55, 0, 0.55] };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const identity = new THREE.Matrix4();

/**
 * Balustrade le long d'une suite de points (pieds des balustres, sur un plat-bord) : un balustre par point, la lisse
 * d'appui de l'un à l'autre ; `gap` laisse un passage (échelle, pièce qui tire par-dessus), sans balustre ni lisse.
 */
function addBalustrade(batch: GeometryBatch, p: Palette, feet: readonly THREE.Vector3[], gap: (foot: THREE.Vector3) => boolean = () => false) {
  const h = BALUSTRADE.height;
  const open = feet.map(gap);
  feet.forEach((foot, i) => {
    if (open[i]) return;
    batch.add(p.trim, box(0.07, h, 0.07), tf(foot.x, foot.y + h / 2, foot.z));
    const next = feet[i + 1];
    if (next && !open[i + 1]) batch.add(p.trim, cylinderBetween(foot.clone().setY(foot.y + h), next.clone().setY(next.y + h), 0.045), identity);
  });
}

/** Pieds de balustres sur le plat-bord d'un bord (`side`), de u = `from` à `to` (u de la coque). */
function gunwaleFeet(L: GalleassLayout, side: 1 | -1, from: number, to: number): THREE.Vector3[] {
  const { hull } = L;
  const n = Math.max(2, Math.round(((to - from) * hull.halfLength) / BALUSTRADE.spacing) + 1);
  return Array.from({ length: n }, (_, i) => {
    const s = hull.stationAt(from + ((to - from) * i) / (n - 1));
    return new THREE.Vector3(side * (hull.halfWidthAt(s, s.gunwale) - 0.04), s.gunwale, s.z);
  });
}

/** Pieds de balustres en travers du navire, sur le plat-bord de la station `u` (bord avant d'un château, poupe, proue). */
function acrossFeet(L: GalleassLayout, u: number, inset: number): THREE.Vector3[] {
  const s = L.station(u);
  const w = L.hull.halfWidthAt(s, s.gunwale) - 0.04;
  const n = Math.max(2, Math.round((2 * w) / BALUSTRADE.spacing) + 1);
  return Array.from({ length: n }, (_, i) => new THREE.Vector3(-w + (2 * w * i) / (n - 1), s.gunwale, s.z + inset));
}

/** La même toile vue de dessous : faces retournées. */
function flipped(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const [x, y, z] = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  g.deleteAttribute('normal');
  return g;
}

/**
 * Châteaux : cloisons (portes, fenêtres) et échelles du château de poupe et du château avant, balustrades, tendelet
 * aux couleurs du camp sur le château de poupe.
 */
export function addCastles(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const { hull, sternDeck, forecastle } = L;

  const sternFront = L.station(sternDeck.to);
  const sf = bulkhead(batch, p, hull, sternFront, DECK_Y, sternDeck.y, 1);
  sf(0, DECK_Y + 0.75, 0.85, 1.45, p.dark);
  for (const x of [-1.25, 1.25]) sf(x, DECK_Y + 1.35, 0.4, 0.34, p.window);
  for (const side of [1, -1]) addLadder(batch, p, side * LADDER_X.stern, sternFront.z, DECK_Y, sternDeck.y, 1);

  const foreBack = L.station(forecastle.from);
  const fb = bulkhead(batch, p, hull, foreBack, DECK_Y, forecastle.y, -1);
  fb(0, DECK_Y + 0.75, 0.85, 1.45, p.dark);
  for (const x of [-1.15, 1.15]) fb(x, DECK_Y + 1.5, 0.38, 0.34, p.window);
  for (const side of [1, -1]) addLadder(batch, p, side * LADDER_X.fore, foreBack.z, DECK_Y, forecastle.y, -1);

  // Balustrades : flancs des châteaux, poupe, bord avant du château de poupe et bord arrière du château avant (passage
  // aux échelles), face avant du château avant (les pièces légères tirent par-dessus le plat-bord, entre les balustres).
  const clear = BALUSTRADE.clearance;
  const ladderGap = (x: number) => (foot: THREE.Vector3) => Math.abs(Math.abs(foot.x) - x) < clear;
  for (const side of [1, -1] as const) {
    addBalustrade(batch, p, gunwaleFeet(L, side, sternDeck.from - 0.005, sternDeck.to));
    addBalustrade(batch, p, gunwaleFeet(L, side, forecastle.from, forecastle.to + 0.005));
  }
  addBalustrade(batch, p, acrossFeet(L, -1, 0.04));
  addBalustrade(batch, p, acrossFeet(L, sternDeck.to, 0), ladderGap(LADDER_X.stern));
  addBalustrade(batch, p, acrossFeet(L, forecastle.from, 0), ladderGap(LADDER_X.fore));
  addBalustrade(batch, p, acrossFeet(L, 1, -0.04), (foot) => L.bow.pieces.some((g) => Math.abs(foot.x - g.x) < clear));

  addAwning(batch, p, L);
}

/** Tendelet : arceau de toile rayée (vu dessus et dessous), montants, filières le long des bords. */
function addAwning(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const { hull, sternDeck } = L;
  const [aft, fore] = [L.at(AWNING.aft), L.at(AWNING.fore)];
  const eave = sternDeck.y + AWNING.posts;
  const radius = (s: typeof aft) => hull.halfWidthAt(s, eave) - AWNING.inset;
  const [rAft, rFore] = [radius(aft), radius(fore)];
  const length = fore.z - aft.z;
  // Demi-cylindre couché le long de Z (rayon de l'avant à l'arrière), aplati en arceau ; bandes de toile alternées.
  const stripe = Math.PI / AWNING.stripes;
  for (let i = 0; i < AWNING.stripes; i++) {
    const canvas = new THREE.CylinderGeometry(rAft, rFore, length, 2, 1, true, -Math.PI / 2 + i * stripe, stripe);
    canvas.rotateX(-Math.PI / 2);
    canvas.scale(1, AWNING.rise, 1);
    canvas.translate(0, eave, (aft.z + fore.z) / 2);
    const cloth = i % 2 === 0 ? p.hull : p.shirt;
    batch.add(cloth, flipped(canvas), identity);
    batch.add(cloth, canvas, identity);
  }
  for (const side of [1, -1]) {
    const ends = [
      new THREE.Vector3(side * rAft, eave, aft.z),
      new THREE.Vector3(side * rFore, eave, fore.z),
    ];
    batch.add(p.trim, cylinderBetween(ends[0], ends[1], 0.05), identity);
    for (const t of [0, 0.5, 1]) {
      const top = ends[0].clone().lerp(ends[1], t);
      batch.add(p.wood, cylinderBetween(top.clone().setY(sternDeck.y), top, 0.055), identity);
    }
  }
}

/** Pavois le long du plat-bord du milieu (pas devant les sabords des pièces du pont), au liseré du camp. */
export function addPavises(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const { hull } = L;
  const [from, to] = [L.base(-0.632), L.base(0.645)];
  const ports = L.deckPorts.map((u) => L.station(u).z);
  const n = Math.floor(((to - from) * hull.halfLength) / PAVISE.spacing);
  for (let i = 0; i < n; i++) {
    const s = hull.stationAt(from + ((to - from) * (i + 0.5)) / n);
    if (ports.some((z) => Math.abs(z - s.z) < PAVISE.portClearance)) continue;
    const y = s.gunwale - PAVISE.below;
    for (const side of [1, -1] as const) {
      batch.add(p.trim, box(0.05, PAVISE.height * 0.7, PAVISE.width), sideTf(hull, s, y + PAVISE.height * 0.15, side, 0.05));
      batch.add(p.trim, box(0.05, PAVISE.height * 0.35, PAVISE.width * 0.5), sideTf(hull, s, y - PAVISE.height * 0.3, side, 0.05));
    }
  }
}

/**
 * Haut du bordé peint aux couleurs du camp (comme sur les flancs), en travers de la poupe (`u` = -1) ou de la face
 * avant (1) : de la préceinte haute jusque sous le plat-bord, en trois bandes qui suivent la rentrée.
 */
function addPaintAcross(batch: GeometryBatch, p: Palette, L: GalleassLayout, u: 1 | -1, z: number) {
  const { hull } = L;
  const s = hull.stationAt(u);
  const top = WALES[0];
  const from = top.y + top.sheer * L.sheer(u) + top.height / 2;
  const to = s.gunwale - 0.08;
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const [a, b] = [from + ((to - from) * i) / rows, from + ((to - from) * (i + 1)) / rows];
    batch.add(p.hull, box(2 * hull.halfWidthAt(s, (a + b) / 2), b - a, 0.03), tf(0, (a + b) / 2, z));
  }
}

/** Poupe ronde : fenêtres de la chambre (tableau et flancs), préceintes en travers du tableau, trois fanaux sur la lisse. */
export function addStern(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const half = hull.halfWidthAt(stern, CABIN.y);
  for (const x of CABIN.stern) {
    batch.add(p.trim, box(0.48, 0.56, 0.04), tf(x * half, CABIN.y, stern.z - 0.015));
    batch.add(p.window, box(0.36, 0.44, 0.05), tf(x * half, CABIN.y, stern.z - 0.03));
  }
  for (const side of [1, -1] as const) {
    for (const u of CABIN.sides) {
      batch.add(p.trim, box(0.04, 0.5, 0.44), sideTf(hull, L.at(u), CABIN.y, side, 0.015));
      batch.add(p.window, box(0.05, 0.38, 0.32), sideTf(hull, L.at(u), CABIN.y, side, 0.03));
    }
  }
  for (const w of WALES) {
    const y = w.y + w.sheer * L.sheer(-1);
    batch.add(DARK_WOOD, box(2 * hull.halfWidthAt(stern, y), w.height, 0.06), tf(0, y, stern.z - 0.03));
  }
  addPaintAcross(batch, p, L, -1, stern.z - 0.015);
  // Fanaux : celui du milieu, plus grand, plus haut sur la lisse de couronnement.
  const top = stern.gunwale + BALUSTRADE.height;
  for (const x of [-0.9, 0, 0.9]) addLantern(batch, p, tf(x, top - (x === 0 ? 0 : 0.25), stern.z - 0.1, 0, 0, 0, x === 0 ? 1.15 : 0.85));
}

/**
 * Avant : face plate du château avant (sabords des deux triples canons, préceinte haute en travers, lisse au niveau de
 * son pont), étrave qui suit la quille arrondie puis monte au milieu de la face, éperon (long bec, et la jambe de force
 * dessous).
 */
export function addBow(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const { hull, forecastle, bow } = L;
  const stem = hull.stationAt(1);
  const z = stem.z + 0.03;
  for (const x of bow.triples) {
    batch.add(p.trim, box(1.02, 0.98, 0.05), tf(x, TRIPLE_Y, z));
    batch.add(p.dark, box(0.86, 0.82, 0.06), tf(x, TRIPLE_Y, z + 0.01));
  }
  for (const w of WALES) {
    if (w.bowEnd !== undefined) continue;
    const y = w.y + w.sheer * L.sheer(1);
    batch.add(DARK_WOOD, box(2 * hull.halfWidthAt(stem, y), w.height, 0.06), tf(0, y, z));
  }
  batch.add(p.trim, box(2 * hull.halfWidthAt(stem, forecastle.y), 0.12, 0.1), tf(0, forecastle.y, z));
  addPaintAcross(batch, p, L, 1, stem.z + 0.015);
  // Étrave : le long de la quille qui remonte, puis un montant dans l'axe de la face, entre les deux triples canons.
  const line = STEM_LINE.map((u) => L.at(u)).map((s) => new THREE.Vector3(0, s.keel, s.z));
  for (let i = 0; i < line.length - 1; i++) batch.add(DARK_WOOD, cylinderBetween(line[i], line[i + 1], 0.12, 0.12, 4), identity);
  batch.add(DARK_WOOD, box(0.22, stem.gunwale - stem.keel, 0.16), tf(0, (stem.gunwale + stem.keel) / 2, z + 0.04));
  const { base, tip, brace } = L.spur;
  batch.add(p.trim, cylinderBetween(base, tip, 0.28, 0.06), identity);
  batch.add(p.trim, cylinderBetween(brace, base.clone().lerp(tip, 0.45), 0.11, 0.07), identity);
}
