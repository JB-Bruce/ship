import { WATER_MASK } from '../../config';
import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, passThrough, std } from '../parts/common';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { DECK_Y, type BrigantineLayout } from './brigantineLayout';

export interface BrigantineTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  jibs: THREE.BufferGeometry[];
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (standard, allongé) et par livrée. */
const templates = new Map<BrigantineLayout, Map<Livery, BrigantineTemplate>>();

export function brigantineTemplateFor(layout: BrigantineLayout, livery: Livery): BrigantineTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: BrigantineLayout, livery: Livery): BrigantineTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const { at, hull, quarterdeck, forecastle } = L;

  // Coque, ponts (principal, château arrière, gaillard d'avant) et lisses.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  batch.add(p.floor, hull.buildFloor(quarterdeck.y, quarterdeck.from, quarterdeck.to, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(forecastle.y, forecastle.from, forecastle.to, 0.95), identity);
  // Bordé en planches sur les trois ponts (le pont principal seulement là où il est à l'air libre).
  addDeckSeams(batch, p.dark, hull, DECK_Y, quarterdeck.to, forecastle.from);
  addDeckSeams(batch, p.dark, hull, quarterdeck.y, quarterdeck.from, quarterdeck.to);
  addDeckSeams(batch, p.dark, hull, forecastle.y, forecastle.from, forecastle.to);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.08), identity);
    batch.add(p.trim, hull.buildRail(side, 0.95, 0.03, 0.06, true), identity);
    batch.add(p.trim, hull.buildRail(side, 0.45, 0.02, 0.05, true), identity);
  }

  // Cloisons du château arrière (porte et fenêtres) et du gaillard d'avant, escaliers d'accès.
  const castle = L.station(quarterdeck.to);
  const castleHeight = quarterdeck.y - DECK_Y;
  batch.add(p.wood, box(2 * castle.halfWidth * 0.98, castleHeight, 0.12), tf(0, DECK_Y + castleHeight / 2, castle.z));
  batch.add(p.dark, box(0.7, 1.25, 0.04), tf(0, DECK_Y + 0.62, castle.z + 0.07));
  for (const x of [-0.75, 0.75]) batch.add(p.window, box(0.35, 0.3, 0.04), tf(x, DECK_Y + 1.15, castle.z + 0.07));
  const fore = L.station(forecastle.from);
  batch.add(p.wood, box(2 * fore.halfWidth * 0.96, forecastle.y - DECK_Y, 0.12), tf(0, (forecastle.y + DECK_Y) / 2, fore.z));
  // Escaliers pleins, posés sur le pont : chaque marche est un bloc qui descend jusqu'au plancher.
  // La plus haute s'appuie contre la cloison (elle mord de 2 cm dans son épaisseur : aucun jour visible).
  const stepRise = castleHeight / 5.3;
  const stepDepth = 0.29;
  const stairBack = castle.z + 0.04;
  for (const side of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const top = stepRise * (i + 1);
      const z = stairBack + stepDepth * (4.5 - i);
      batch.add(p.wood, box(0.6, top, stepDepth), tf(side * 1.25, DECK_Y + top / 2, z));
      batch.add(p.dark, box(0.62, 0.02, 0.02), tf(side * 1.25, DECK_Y + top + 0.005, z + stepDepth / 2));
    }
  }

  // Fenêtres du château (tableau arrière et flancs) et sabords des emplacements de canons.
  const stern = at(-1);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) batch.add(p.window, box(0.42, 0.48, 0.05), tf(x, 2.25, stern.z - 0.02));
  for (const y of [1.92, 2.58]) batch.add(p.trim, box(2 * stern.halfWidth - 0.2, 0.08, 0.06), tf(0, y, stern.z - 0.03));
  for (const side of [1, -1]) {
    for (const u of [-0.9, -0.72, -0.55]) {
      const s = at(u);
      batch.add(p.window, box(0.05, 0.36, 0.42), tf(side * (s.halfWidth + 0.02), 2.3, s.z));
    }
    for (const u of L.gunSlots) {
      const s = L.station(u);
      batch.add(p.dark, box(0.05, 0.42, 0.5), tf(side * (s.halfWidth + 0.02), DECK_Y + 0.4, s.z));
    }
  }

  // Mâts, hunes, chouques et hampe ; beaupré ; colonne de la roue.
  for (const mast of [L.foreMast, L.mainMast]) {
    batch.add(p.wood, new THREE.CylinderGeometry(0.15, 0.22, mast.top - DECK_Y, 8), tf(0, (mast.top + DECK_Y) / 2, mast.z));
    batch.add(p.wood, new THREE.CylinderGeometry(0.65, 0.6, 0.1, 10), tf(0, mast.topPlatform, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, L.mainMast.top + 0.6, L.mainMast.z));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.16, 0.08), identity);
  batch.add(p.wood, box(0.14, 0.85, 0.14), tf(0, quarterdeck.y + 0.42, L.wheel.z - 0.12));


  // Écoutille, cargaison, cordages, grand fanal de poupe.
  batch.add(p.dark, box(1.2, 0.12, 1), tf(0, DECK_Y + 0.06, at(0.02).z));
  batch.add(p.trim, box(1.3, 0.08, 1.1), tf(0, DECK_Y + 0.02, at(0.02).z));
  addBarrel(batch, p, tf(0.6, forecastle.y, at(0.56).z));
  addBarrel(batch, p, tf(-0.6, forecastle.y, at(0.56).z, 0, 0.7));
  addCrate(batch, p, tf(0.35, DECK_Y, castle.z + 0.6, 0, 0.2));
  addRopeCoil(batch, p, tf(-0.5, DECK_Y, L.foreMast.z - 0.7));
  addRopeCoil(batch, p, tf(0.4, forecastle.y, at(0.82).z));
  addLantern(batch, p, tf(0, stern.gunwale, stern.z + 0.2, 0, 0, 0, 1.4));

  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.55)),
    yards: L.squareSails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.07, 0.07, s.width + 0.5, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    }),
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.45)),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(1.8),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Roue de gouvernail (dans le plan XY, elle tourne autour de Z) ; le joueur à pied la traverse. */
function buildWheel(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.TorusGeometry(0.5, 0.045, 4, 14), new THREE.Matrix4());
  batch.add(key, new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8), tf(0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 8; i++) {
    batch.add(key, new THREE.BoxGeometry(0.035, 1.3, 0.035), tf(0, 0, 0, 0, 0, (i * Math.PI) / 8));
  }
  return passThrough(batch.build()[0].geometry);
}

/** Haubans des deux mâts, étais (mât de misaine → beaupré, grand mât → misaine), sous-barbe. */
function buildRigging(L: BrigantineLayout): THREE.BufferGeometry {
  const foreTop = new THREE.Vector3(0, L.foreMast.top - 0.5, L.foreMast.z);
  const mainTop = new THREE.Vector3(0, L.mainMast.top - 0.5, L.mainMast.z);
  const points: THREE.Vector3[] = [
    foreTop, L.bowsprit.tip,
    mainTop, foreTop,
    L.bowsprit.tip, new THREE.Vector3(0, 0.6, L.at(1).z - 0.1),
  ];
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, sur le plat-bord.
  const shrouds: [THREE.Vector3, number[]][] = [
    [foreTop, [-0.48, -1.12, -1.76]],
    [mainTop, [-0.48, -1.12, -2.64]],
  ];
  const half = L.length / 2;
  for (const side of [1, -1]) {
    for (const [from, offsets] of shrouds) {
      for (const dz of offsets) {
        const s = L.station((from.z + dz) / half);
        points.push(from, new THREE.Vector3(side * s.halfWidth, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
