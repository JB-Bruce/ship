import { WATER_MASK } from '../../config';
import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch, addStairs } from '../parts/deckFittings';
import { buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { addLampFixtures } from '../parts/shipLamps';
import { addBeakhead, addCargo, addStern } from './frigateDecor';
import { frigateLamps } from './frigateLamps';
import { batteryY, DECK_Y, sheer, type FrigateLayout } from './frigateLayout';

export interface FrigateTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  jibs: THREE.BufferGeometry[];
  spanker: THREE.BufferGeometry;
  spankerBoom: THREE.BufferGeometry;
  spankerGaff: THREE.BufferGeometry;
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

/** Dorures des moulures, des galeries et de la figure de proue (communes à toutes les livrées). */
export const gold = std(0xc9a227, { roughness: 0.45, metalness: 0.6 });
/** Bois clair (ocre) des bandes des œuvres mortes, des cloisons et du tableau arrière, sur toutes les livrées. */
const lightWood = std(0xbd8f52);

/** Un gabarit par plan (standard, allongée) et par livrée. */
const templates = new Map<FrigateLayout, Map<Livery, FrigateTemplate>>();

export function frigateTemplateFor(layout: FrigateLayout, livery: Livery): FrigateTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: FrigateLayout, livery: Livery): FrigateTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const hull = L.hull;
  const { quarterdeck, poop, forecastle } = L;

  // Coque, ponts planchés (principal, gaillard d'arrière, dunette, gaillard d'avant).
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  batch.add(p.floor, hull.buildFloor(quarterdeck.y, quarterdeck.from, quarterdeck.to, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(poop.y, poop.from, poop.to, 0.96), identity);
  batch.add(p.floor, hull.buildFloor(forecastle.y, forecastle.from, forecastle.to, 0.95), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, quarterdeck.to, forecastle.from);
  addDeckSeams(batch, p.dark, hull, quarterdeck.y, poop.to, quarterdeck.to);
  addDeckSeams(batch, p.dark, hull, forecastle.y, forecastle.from, forecastle.to);

  // Couleurs : bandes de bois clair (batterie, pavois, étages des châteaux) alternées avec la couleur de la livrée,
  // toutes sur la tonture ; préceintes sombres et moulures dorées.
  const deckLine = (_s: unknown, u: number) => DECK_Y - 0.3 + sheer(u);
  const band = (from: (u: number) => number, to: (u: number) => number) =>
    batch.add(lightWood, hull.buildBand((_s, u) => from(u), (s, u) => Math.min(s.gunwale - 0.1, to(u)), 0.015), identity);
  /** Bande d'un étage, seulement sur l'étendue de son pont (nulle ailleurs). */
  const storey = (y: number, inside: (u: number) => boolean) => band(() => y - 0.2, (u) => (inside(u) ? y + 0.6 : y - 0.2));
  band((u) => batteryY(u) - 0.4, (u) => batteryY(u) + 0.4);
  band((u) => deckLine(null, u) + 0.2, (u) => deckLine(null, u) + 0.95);
  storey(quarterdeck.y, (u) => u <= quarterdeck.to);
  storey(poop.y, (u) => u <= poop.to);
  storey(forecastle.y, (u) => u >= forecastle.from);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.1), identity);
    batch.add(gold, hull.buildRailAt(side, deckLine, 0.03, 0.06), identity);
    batch.add(p.trim, hull.buildRailAt(side, (_s, u) => batteryY(u) - 0.68, 0.02, 0.15), identity);
    batch.add(gold, hull.buildRailAt(side, (_s, u) => batteryY(u) + 0.43, 0.05, 0.04), identity);
    batch.add(gold, hull.buildRailAt(side, (_s, u) => batteryY(u) - 0.43, 0.05, 0.04), identity);
  }

  // Cloisons du gaillard d'arrière et de la dunette (portes, fenêtres), du gaillard d'avant ; escaliers d'accès.
  const castle = L.station(quarterdeck.to);
  const castleHeight = quarterdeck.y - DECK_Y;
  batch.add(p.wood, box(2 * L.width(quarterdeck.to, DECK_Y) * 0.97, castleHeight, 0.12), tf(0, DECK_Y + castleHeight / 2, castle.z));
  batch.add(p.dark, box(0.85, 1.5, 0.04), tf(0, DECK_Y + 0.75, castle.z + 0.07));
  for (const x of [-1.1, 1.1]) batch.add(p.window, box(0.42, 0.36, 0.04), tf(x, DECK_Y + 1.4, castle.z + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.7, DECK_Y, castle.z), castleHeight, 7);
  const aft = L.station(poop.to);
  const poopHeight = poop.y - quarterdeck.y;
  batch.add(lightWood, box(2 * L.width(poop.to, quarterdeck.y) * 0.96, poopHeight, 0.12), tf(0, quarterdeck.y + poopHeight / 2, aft.z));
  batch.add(p.dark, box(0.8, 1.4, 0.04), tf(0, quarterdeck.y + 0.7, aft.z + 0.07));
  for (const x of [-1.2, 1.2]) batch.add(p.window, box(0.4, 0.34, 0.04), tf(x, quarterdeck.y + 1.25, aft.z + 0.07));
  batch.add(gold, box(2 * L.width(poop.to, poop.y) * 0.94, 0.08, 0.06), tf(0, poop.y - 0.05, aft.z + 0.08));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.6, quarterdeck.y, aft.z), poopHeight, 6);
  const fore = L.station(forecastle.from);
  const foreHeight = forecastle.y - DECK_Y;
  batch.add(lightWood, box(2 * L.width(forecastle.from, DECK_Y) * 0.95, foreHeight, 0.12), tf(0, DECK_Y + foreHeight / 2, fore.z));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 1.5, DECK_Y, fore.z, 0, Math.PI), foreHeight, 5, 0.6);

  // Écoutilles vers la batterie.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, h.kind);

  // Sabords : batterie couverte dans le bordé (sur la tonture), canons des gaillards dans le pavois.
  for (const side of [1, -1]) {
    for (const u of L.batterySlots) {
      const s = L.station(u);
      const y = batteryY(u);
      const x = side * L.width(u, y);
      batch.add(p.trim, box(0.07, 0.68, 0.72), tf(x + side * 0.04, y, s.z));
      batch.add(p.dark, box(0.08, 0.52, 0.56), tf(x + side * 0.06, y, s.z));
    }
    for (const { u, y } of L.deckSlots) {
      const s = L.station(u);
      batch.add(p.dark, box(0.05, 0.42, 0.5), tf(side * (L.width(u, y + 0.4) + 0.02), y + 0.4, s.z));
    }
  }
  addStern(L, batch, p, gold, lightWood);
  addBeakhead(L, batch, p, gold);

  // Mâts (hunes, barres de perroquet, chouques), hampe du pavillon, beaupré et son mâtereau, colonne de roue, cabestan.
  for (const mast of [L.foreMast, L.mainMast, L.mizzenMast]) {
    batch.add(p.wood, new THREE.CylinderGeometry(0.18, 0.3, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    batch.add(p.wood, new THREE.CylinderGeometry(0.9, 0.85, 0.12, 10), tf(0, mast.topPlatform, mast.z));
    batch.add(p.wood, box(1.4, 0.08, 0.3), tf(0, mast.crossTree, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(0.24, 0.24, 0.12, 8), tf(0, mast.top + 0.06, mast.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4), tf(0, L.mainMast.top + 0.75, L.mainMast.z));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.24, 0.12), identity);
  batch.add(p.wood, cylinderBetween(L.spritMast.base, L.spritMast.top, 0.09, 0.06), identity);
  batch.add(p.wood, new THREE.CylinderGeometry(0.42, 0.4, 0.08, 8), tf(0, L.spritMast.base.y + 0.3, L.spritMast.base.z));
  batch.add(p.wood, box(0.16, 1, 0.16), tf(0, quarterdeck.y + 0.5, L.wheel.z - 0.12));
  batch.add(p.wood, new THREE.CylinderGeometry(0.36, 0.42, 0.75, 8), tf(0, DECK_Y + 0.38, L.at(-0.36).z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.47, 0.47, 0.08, 8), tf(0, DECK_Y + 0.7, L.at(-0.36).z));
  addCargo(L, batch, p);
  addLampFixtures(batch, p, frigateLamps(L));

  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.65)),
    yards: L.squareSails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.09, 0.09, s.width + 0.6, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    }),
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.45)),
    spanker: buildGaffSail(L.spanker),
    spankerBoom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, L.spanker.clew.z - 0.4), 0.1, 0.08),
    spankerGaff: cylinderBetween(L.spanker.throat, L.spanker.peak, 0.08, 0.06),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(3.2),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Haubans des trois mâts, étais (artimon → grand mât → misaine → beaupré), sous-barbe, étai du mâtereau. */
function buildRigging(L: FrigateLayout): THREE.BufferGeometry {
  const top = (m: { z: number; top: number }) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const fore = top(L.foreMast);
  const main = top(L.mainMast);
  const mizzen = top(L.mizzenMast);
  const points: THREE.Vector3[] = [fore, L.bowsprit.tip, main, fore, mizzen, main, L.bowsprit.tip, new THREE.Vector3(0, 1.4, L.at(1).z - 0.1)];
  points.push(L.spritMast.top, new THREE.Vector3(0, fore.y - 6, L.foreMast.z));
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, sur le plat-bord.
  const shrouds: [THREE.Vector3, number[]][] = [
    [fore, [-0.56, -1.26, -1.96, -2.66]],
    [main, [-0.56, -1.26, -1.96, -2.66]],
    [mizzen, [0.56, -0.14, -0.84]],
  ];
  const half = L.length / 2;
  for (const side of [1, -1]) {
    for (const [from, offsets] of shrouds) {
      for (const dz of offsets) {
        const u = (from.z + dz) / half;
        const s = L.station(u);
        points.push(from, new THREE.Vector3(side * L.width(u, s.gunwale), s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
