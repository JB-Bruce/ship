import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { buildWheel } from '../corvette/corvetteTemplate';
import { addStairs } from '../parts/deckFittings';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, buildSquareSail, cylinderBetween } from '../parts/sails';
import { alongMast, BOW_PLATFORM, DECK_Y, OAR, POOP, RAKE, type XebecLateen, type XebecLayout } from './xebecLayout';

/** Préceintes (lisses du bordé) : hauteurs (m). */
const WALES = [1.18, 0.42] as const;
/** Galerie de poupe en surplomb, sous la balustrade de la dunette : hauteur du bas, hauteur, saillie (m). */
const GALLERY = { y: 1.2, height: 0.85, depth: 0.7 };
/** Balustres de la dunette (par bord, régulièrement de l'arrière à l'avant de la dunette). */
const BALUSTERS = 9;
/** Pale d'aviron : longueur, largeur (m). */
const BLADE = { length: 0.8, width: 0.2 };
export const FLAG = { length: 1.5, height: 0.95 };

export interface XebecTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles latines (dans le repère de leur vergue, voir buildLateenSail), leurs vergues, et l'inclinaison de ce repère. */
  lateens: { sail: THREE.BufferGeometry; yard: THREE.BufferGeometry; pitch: number }[];
  course: THREE.BufferGeometry;
  courseYard: THREE.BufferGeometry;
  topsail: THREE.BufferGeometry;
  topsailYard: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  /** Roue de gouvernail (elle tourne autour de Z). */
  wheel: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  gunport: THREE.BufferGeometry;
  /** Un aviron : le long de +X à partir de son sabord (manche en dedans, pale au bout). */
  oar: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, allongé) et par livrée. */
const templates = new Map<XebecLayout, Map<Livery, XebecTemplate>>();

export function xebecTemplateFor(layout: XebecLayout, livery: Livery): XebecTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: XebecLayout, livery: Livery): XebecTemplate {
  const { hull } = L;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const poopFrom = L.base(POOP.from);
  const poopTo = L.base(POOP.to);

  // Coque, pont principal et dunette planchés, lisses et préceintes.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.99, 0.97, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(POOP.y, poopFrom, poopTo, 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, poopTo, 0.95);
  addDeckSeams(batch, p.dark, hull, POOP.y, poopFrom, poopTo);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.07), identity);
    for (const y of WALES) batch.add(p.trim, hull.buildRail(side, y, 0.02, 0.05, true), identity);
  }
  // Bande peinte entre les deux préceintes, aux couleurs de la livrée (le liseré du plan).
  batch.add(p.trim, hull.buildBand(() => WALES[0] - 0.12, () => WALES[0] - 0.02, 0.012), identity);

  addPoop(batch, p, L);
  addBow(batch, p, L);

  // Sabords d'aviron sous le pont, de chaque bord.
  for (const z of L.oarZs) {
    const s = hull.stationAt(z / hull.halfLength);
    for (const side of [1, -1]) batch.add(p.dark, box(0.04, 0.18, 0.2), tf(side * (hull.halfWidthAt(s, OAR.y) + 0.005), OAR.y, z));
  }

  // Mâts inclinés vers l'avant (chouques, hune du grand mât, hampe du pavillon).
  for (const [mast, radius] of [[L.foreMast, 0.17], [L.mainMast, 0.22], [L.mizzenMast, 0.15]] as const) {
    const mid = alongMast(mast.z, mast.length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.7, radius, mast.length, 8), tf(0, mid.y, mid.z, RAKE));
    const top = alongMast(mast.z, mast.length);
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.1, 8), tf(0, top.y + 0.05, top.z, RAKE));
  }
  const hune = alongMast(L.mainMast.z, L.topPlatform);
  batch.add(p.wood, new THREE.CylinderGeometry(0.75, 0.66, 0.45, 10), tf(0, hune.y, hune.z, RAKE));
  const mainTop = alongMast(L.mainMast.z, L.mainMast.length);
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, mainTop.y + 0.6, mainTop.z));

  // Cargaison et accastillage, dans l'axe : les flancs restent libres pour les canons.
  const hatch = L.at(-0.22).z;
  batch.add(p.dark, box(1.1, 0.12, 1.2), tf(0, DECK_Y + 0.06, hatch));
  batch.add(p.trim, box(1.2, 0.08, 1.3), tf(0, DECK_Y + 0.02, hatch));
  batch.add(p.dark, box(0.9, 0.1, 0.9), tf(0, DECK_Y + 0.05, L.at(0.3).z));
  addBarrel(batch, p, tf(0.45, DECK_Y, L.at(0.2).z));
  addBarrel(batch, p, tf(-0.45, DECK_Y, L.at(0.2).z, 0, 0.7));
  addCrate(batch, p, tf(0.4, DECK_Y, L.at(-0.38).z, 0, 0.25));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, L.mainMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.45, DECK_Y, L.foreMast.z - 0.7));
  addRopeCoil(batch, p, tf(-0.4, POOP.y, L.at(-0.8).z));

  const yard = (length: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, length, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  return {
    palette: p,
    statics: batch.build(),
    lateens: [L.fore, L.mizzen].map(lateenParts),
    course: buildSquareSail(L.course.width, L.course.height, 0.6),
    courseYard: yard(L.course.width + 0.5, 0.09),
    topsail: buildSquareSail(L.topsail.width, L.topsail.height, 0.4),
    topsailYard: yard(L.topsail.width + 0.4, 0.07),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(1.6),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    gunport: box(0.05, 0.38, 0.46),
    oar: buildOar(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Voile latine, sa vergue (qui dépasse un peu de chaque bout) et l'inclinaison de son repère. */
function lateenParts({ sail }: XebecLateen) {
  const lateen = buildLateenSail(sail);
  const yard = cylinderBetween(new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, lateen.yardLength + 0.4), 0.1, 0.05);
  return { sail: lateen.sail, yard, pitch: lateen.pitch };
}

/**
 * Dunette : cloison avant (porte, fenêtres) et escaliers depuis le pont principal, balustrade à balustres au-dessus du
 * pavois, galerie de poupe en surplomb (fenêtres éclairées la nuit), fanal sur la lisse de couronnement.
 */
function addPoop(batch: GeometryBatch, p: Palette, L: XebecLayout) {
  const { hull } = L;
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const front = L.at(POOP.to);
  const height = POOP.y - DECK_Y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(front, POOP.y) * 0.98, height, 0.12), tf(0, DECK_Y + height / 2, front.z));
  batch.add(p.dark, box(0.7, 0.85, 0.04), tf(0, DECK_Y + 0.43, front.z + 0.07));
  for (const x of [-1, 1]) batch.add(p.window, box(0.34, 0.26, 0.04), tf(x, DECK_Y + 0.6, front.z + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.25, DECK_Y, front.z), height, 4);
  // Colonne de la roue de gouvernail.
  batch.add(p.wood, box(0.14, L.wheel.y - POOP.y, 0.14), tf(0, (L.wheel.y + POOP.y) / 2, L.wheel.z - 0.12));

  // Balustrade : balustres sur le plat-bord de la dunette et lisse d'appui, sur les deux bords et en travers de la poupe.
  const top = (s: { gunwale: number }) => s.gunwale + POOP.railHeight;
  const from = L.base(POOP.from);
  const to = L.base(POOP.to) - 0.005;
  for (const side of [1, -1]) {
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i < BALUSTERS; i++) {
      const s = hull.stationAt(from + ((to - from) * i) / (BALUSTERS - 1));
      const x = side * (hull.halfWidthAt(s, s.gunwale) - 0.04);
      batch.add(p.trim, box(0.07, POOP.railHeight, 0.07), tf(x, s.gunwale + POOP.railHeight / 2, s.z));
      rail.push(new THREE.Vector3(x, top(s), s.z));
    }
    for (let i = 0; i < rail.length - 1; i++) batch.add(p.trim, cylinderBetween(rail[i], rail[i + 1], 0.05), new THREE.Matrix4());
  }
  const stern = hull.stationAt(from);
  const sternHalf = hull.halfWidthAt(stern, stern.gunwale) - 0.04;
  for (const x of [-0.5, 0, 0.5]) batch.add(p.trim, box(0.07, POOP.railHeight, 0.07), tf(x * sternHalf, stern.gunwale + POOP.railHeight / 2, stern.z));
  batch.add(p.trim, box(2 * sternHalf + 0.1, 0.1, 0.12), tf(0, top(stern), stern.z));
  // Fanal de poupe, debout sur la lisse de couronnement.
  addLantern(batch, p, tf(0, top(stern) + 0.05, stern.z, 0, 0, 0, 0.8));

  // Galerie de poupe : un balcon couvert qui déborde du tableau arrière, fenêtres à l'arrière et sur les côtés.
  const back = hull.stationAt(-1);
  const width = 2 * hull.halfWidthAt(back, GALLERY.y + GALLERY.height / 2) * 0.92;
  const gz = back.z - GALLERY.depth / 2 + 0.05;
  const gy = GALLERY.y + GALLERY.height / 2;
  batch.add(p.hull, box(width, GALLERY.height, GALLERY.depth), tf(0, gy, gz));
  batch.add(p.trim, box(width + 0.16, 0.1, GALLERY.depth + 0.12), tf(0, GALLERY.y + GALLERY.height + 0.05, gz));
  batch.add(p.trim, box(width + 0.1, 0.12, GALLERY.depth + 0.08), tf(0, GALLERY.y - 0.04, gz));
  for (const x of [-0.75, -0.25, 0.25, 0.75]) batch.add(p.window, box(0.3, 0.42, 0.04), tf((x * width) / 2, gy, back.z - GALLERY.depth + 0.03));
  for (const side of [1, -1]) batch.add(p.window, box(0.04, 0.42, 0.3), tf(side * (width / 2 + 0.01), gy, gz));
  // Préceintes autour du tableau arrière.
  for (const y of WALES) batch.add(p.trim, box(2 * hull.halfWidthAt(back, y) + 0.08, 0.1, 0.08), tf(0, y, back.z - 0.04));
}

/**
 * Avant : étrave, éperon (long bec qui prolonge l'étrave), plateforme de proue à peine surélevée (plancher, cloison
 * arrière, escaliers) où se posent les canons de chasse.
 */
function addBow(batch: GeometryBatch, p: Palette, L: XebecLayout) {
  const { hull } = L;
  const stem = hull.stationAt(1);
  // L'étrave s'arrête au plat-bord : le canon de chasse du centre tire par-dessus.
  batch.add(p.trim, new THREE.BoxGeometry(0.14, stem.gunwale - stem.keel, 0.18), tf(0, (stem.gunwale + stem.keel) / 2, stem.z - 0.05, -0.15));
  // Éperon et sa console (une jambe de force sous lui, contre l'étrave).
  batch.add(p.trim, cylinderBetween(L.spur.base, L.spur.tip, 0.2, 0.06), new THREE.Matrix4());
  const knee = L.spur.base.clone().lerp(L.spur.tip, 0.45);
  batch.add(p.trim, cylinderBetween(new THREE.Vector3(0, 0.35, stem.z - 0.1), knee, 0.09, 0.06), new THREE.Matrix4());

  const { y, from, to } = BOW_PLATFORM;
  const [uFrom, uTo] = [L.base(from), L.base(to)];
  batch.add(p.floor, hull.buildFloor(y, uFrom, uTo, 0.96), new THREE.Matrix4());
  addDeckSeams(batch, p.dark, hull, y, uFrom, uTo);
  const back = hull.stationAt(uFrom);
  const rise = y - DECK_Y;
  const width = 2 * hull.halfWidthAt(back, y) * 0.96;
  batch.add(p.wood, new THREE.BoxGeometry(width, rise, 0.12), tf(0, DECK_Y + rise / 2, back.z));
  batch.add(p.trim, new THREE.BoxGeometry(width + 0.06, 0.07, 0.18), tf(0, y, back.z));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 0.75, DECK_Y, back.z, 0, Math.PI), rise, 2, 0.5);
}

/** Aviron le long de +X : manche depuis `-OAR.inboard` (dedans) jusqu'à la pale, au bout de `OAR.outboard`. */
function buildOar(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  const shaft = OAR.inboard + OAR.outboard - BLADE.length / 2;
  batch.add(key, new THREE.CylinderGeometry(0.04, 0.05, shaft, 5), tf(shaft / 2 - OAR.inboard, 0, 0, 0, 0, -Math.PI / 2));
  batch.add(key, new THREE.BoxGeometry(BLADE.length, BLADE.width, 0.04), tf(OAR.outboard - BLADE.length / 2, 0, 0));
  return batch.build()[0].geometry;
}

/** Haubans des trois mâts, étais (artimon → grand mât → misaine → éperon), sous-barbe de l'éperon. */
function buildRigging(L: XebecLayout): THREE.BufferGeometry {
  const { hull } = L;
  const head = (m: { z: number; length: number }) => alongMast(m.z, m.length - 0.5);
  const fore = head(L.foreMast);
  const main = head(L.mainMast);
  const mizzen = head(L.mizzenMast);
  const points: THREE.Vector3[] = [fore, L.spur.tip, main, alongMast(L.foreMast.z, L.foreMast.length - 1.2), mizzen, alongMast(L.mainMast.z, L.topPlatform - 0.4)];
  points.push(L.spur.tip, new THREE.Vector3(0, 0.5, hull.stationAt(1).z - 0.1));
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière, sur le plat-bord.
  const shrouds: [THREE.Vector3, number, number[]][] = [
    [fore, L.foreMast.z, [-0.4, -1.1, -1.8]],
    [main, L.mainMast.z, [-0.5, -1.2, -1.9, -2.6]],
    [mizzen, L.mizzenMast.z, [-0.4, -1.1]],
  ];
  for (const side of [1, -1]) {
    for (const [from, z, offsets] of shrouds) {
      for (const dz of offsets) {
        const s = hull.stationAt((z + dz) / hull.halfLength);
        points.push(from, new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale) * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
