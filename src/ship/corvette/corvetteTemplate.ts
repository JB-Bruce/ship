import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch, addStairs } from '../parts/deckFittings';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { BATTERY_Y, DECK_Y, type CorvetteLayout } from './corvetteLayout';

export interface CorvetteTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  jibs: THREE.BufferGeometry[];
  mizzenSail: THREE.BufferGeometry;
  mizzenBoom: THREE.BufferGeometry;
  mizzenGaff: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord de la batterie (pointe vers +X). */
  batteryGun: THREE.BufferGeometry;
  deckGun: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (standard, allongée) et par livrée. */
const templates = new Map<CorvetteLayout, Map<Livery, CorvetteTemplate>>();

export function corvetteTemplateFor(layout: CorvetteLayout, livery: Livery): CorvetteTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: CorvetteLayout, livery: Livery): CorvetteTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const { hull, quarterdeck, forecastle, at } = L;

  // Coque, ponts planchés (principal, château, gaillard), lisses ; bande peinte le long de la batterie.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  batch.add(p.floor, hull.buildFloor(quarterdeck.y, quarterdeck.from, quarterdeck.to, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(forecastle.y, forecastle.from, forecastle.to, 0.95), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, quarterdeck.to, forecastle.from);
  addDeckSeams(batch, p.dark, hull, quarterdeck.y, quarterdeck.from, quarterdeck.to);
  addDeckSeams(batch, p.dark, hull, forecastle.y, forecastle.from, forecastle.to);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.09), identity);
    batch.add(p.trim, hull.buildRail(side, DECK_Y - 0.25, 0.03, 0.06, true), identity);
    batch.add(p.trim, hull.buildRail(side, BATTERY_Y, 0.01, 0.34, true), identity);
  }

  // Cloisons du château arrière (porte, fenêtres) et du gaillard d'avant, escaliers d'accès depuis le pont.
  const castle = L.station(quarterdeck.to);
  const castleHeight = quarterdeck.y - DECK_Y;
  batch.add(p.wood, box(2 * castle.halfWidth * 0.98, castleHeight, 0.12), tf(0, DECK_Y + castleHeight / 2, castle.z));
  batch.add(p.dark, box(0.75, 1.3, 0.04), tf(0, DECK_Y + 0.65, castle.z + 0.07));
  for (const x of [-0.8, 0.8]) batch.add(p.window, box(0.38, 0.32, 0.04), tf(x, DECK_Y + 1.2, castle.z + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.3, DECK_Y, castle.z), castleHeight, 6);
  const fore = L.station(forecastle.from);
  const foreHeight = forecastle.y - DECK_Y;
  batch.add(p.wood, box(2 * fore.halfWidth * 0.96, foreHeight, 0.12), tf(0, DECK_Y + foreHeight / 2, fore.z));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.2, DECK_Y, fore.z, 0, Math.PI), foreHeight, 3, 0.55);

  // Écoutilles vers la batterie.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, h.kind);

  // Sabords : batterie couverte dans le bordé, canons du pont dans le pavois.
  for (const side of [1, -1]) {
    for (const u of L.batterySlots) {
      const s = L.station(u);
      batch.add(p.dark, box(0.08, 0.52, 0.56), tf(side * (s.halfWidth + 0.06), BATTERY_Y, s.z));
    }
    for (const u of L.deckSlots) {
      const s = L.station(u);
      batch.add(p.dark, box(0.05, 0.42, 0.5), tf(side * (s.halfWidth + 0.02), DECK_Y + 0.4, s.z));
    }
    // Fenêtres du château, sur ses flancs.
    for (const u of [-0.9, -0.74, -0.6]) {
      const s = at(u);
      batch.add(p.window, box(0.05, 0.4, 0.45), tf(side * (s.halfWidth + 0.02), quarterdeck.y - 0.75, s.z));
    }
  }

  // Tableau arrière : fenêtres de la grand-chambre (sous le château) et moulures dorées.
  const stern = at(-1);
  for (const x of [-1.35, -0.45, 0.45, 1.35]) batch.add(p.window, box(0.5, 0.55, 0.05), tf(x, quarterdeck.y - 0.85, stern.z - 0.02));
  for (const y of [DECK_Y + 0.4, quarterdeck.y - 0.2, stern.gunwale - 0.1]) batch.add(p.trim, box(2 * stern.halfWidth - 0.2, 0.09, 0.06), tf(0, y, stern.z - 0.03));

  // Mâts (hunes, chouques), hampe du pavillon, beaupré, colonne de la roue, cabestan.
  for (const mast of [L.foreMast, L.mainMast, L.mizzenMast]) {
    batch.add(p.wood, new THREE.CylinderGeometry(0.16, 0.25, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    batch.add(p.wood, new THREE.CylinderGeometry(0.75, 0.7, 0.1, 10), tf(0, mast.topPlatform, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.3, 4), tf(0, L.mainMast.top + 0.65, L.mainMast.z));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.18, 0.09), identity);
  batch.add(p.wood, box(0.14, 0.9, 0.14), tf(0, quarterdeck.y + 0.45, L.wheel.z - 0.12));
  batch.add(p.wood, new THREE.CylinderGeometry(0.32, 0.38, 0.7, 8), tf(0, DECK_Y + 0.35, at(-0.4).z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), tf(0, DECK_Y + 0.66, at(-0.4).z));


  // Cargaison, cordages, fanal de poupe.
  addBarrel(batch, p, tf(0.8, forecastle.y, at(0.74).z));
  addBarrel(batch, p, tf(-0.8, forecastle.y, at(0.74).z, 0, 0.7));
  addBarrel(batch, p, tf(-0.9, quarterdeck.y, at(-0.56).z, 0, 1.4));
  addCrate(batch, p, tf(0.6, DECK_Y, at(-0.32).z, 0, 0.2));
  addRopeCoil(batch, p, tf(-0.6, DECK_Y, L.foreMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.6, quarterdeck.y, L.mizzenMast.z + 0.8));
  addLantern(batch, p, tf(0, stern.gunwale, stern.z + 0.2, 0, 0, 0, 1.5));

  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.6)),
    yards: L.squareSails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.08, 0.08, s.width + 0.5, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    }),
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.45)),
    mizzenSail: buildGaffSail(L.mizzenSail),
    mizzenBoom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, L.mizzenSail.clew.z - 0.3), 0.09, 0.07),
    mizzenGaff: cylinderBetween(L.mizzenSail.throat, L.mizzenSail.peak, 0.07, 0.05),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.6),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(),
  };
}

/** Fût d'un canon de batterie : il pivote dans son sabord (origine), la bouche dépasse de 0,8 m vers +X. */
export function buildBatteryGun(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.CylinderGeometry(0.12, 0.16, 1.4, 8), tf(0.1, 0, 0, 0, 0, -Math.PI / 2));
  batch.add(key, new THREE.CylinderGeometry(0.15, 0.15, 0.12, 8), tf(0.74, 0, 0, 0, 0, -Math.PI / 2));
  return batch.build()[0].geometry;
}

/** Roue de gouvernail (dans le plan XY, elle tourne autour de Z). */
export function buildWheel(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.TorusGeometry(0.55, 0.045, 4, 14), new THREE.Matrix4());
  batch.add(key, new THREE.CylinderGeometry(0.09, 0.09, 0.12, 8), tf(0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 8; i++) batch.add(key, new THREE.BoxGeometry(0.035, 1.4, 0.035), tf(0, 0, 0, 0, 0, (i * Math.PI) / 8));
  return batch.build()[0].geometry;
}

/** Haubans des trois mâts, étais (artimon → grand mât → misaine → beaupré), sous-barbe. */
function buildRigging(L: CorvetteLayout): THREE.BufferGeometry {
  const top = (m: { z: number; top: number }) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const fore = top(L.foreMast);
  const main = top(L.mainMast);
  const mizzen = top(L.mizzenMast);
  const points: THREE.Vector3[] = [fore, L.bowsprit.tip, main, fore, mizzen, main, L.bowsprit.tip, new THREE.Vector3(0, 0.8, L.at(1).z - 0.1)];
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, sur le plat-bord.
  const shrouds: [THREE.Vector3, number[]][] = [
    [fore, [-0.55, -1.21, -1.87]],
    [main, [-0.55, -1.21, -1.87]],
    [mizzen, [-0.44, -0.99, -1.54]],
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
