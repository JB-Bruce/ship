import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { senauLamps } from './senauLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { addBoat, addBow, addQuarterdeck, addStern } from './senauDecor';
import { alongMast, DECK_Y, PORT_Y, QUARTERDECK, RAKE, type SenauLayout, type SenauMast } from './senauLayout';

/** Préceintes : hauteurs (m). */
const WALES = [1.2, 2.15] as const;

export interface SenauTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues de chaque mât (misaine, grand mât), de bas en haut. */
  squareSails: THREE.BufferGeometry[][];
  yards: THREE.BufferGeometry[][];
  jibs: THREE.BufferGeometry[];
  spanker: THREE.BufferGeometry;
  boom: THREE.BufferGeometry;
  gaff: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, grand) et par livrée. */
const templates = new Map<SenauLayout, Map<Livery, SenauTemplate>>();

export function senauTemplateFor(layout: SenauLayout, livery: Livery): SenauTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: SenauLayout, livery: Livery): SenauTemplate {
  const { hull, at, base } = L;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont et gaillard d'arrière planchés, lisses et préceintes ; sabords de la batterie.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  const qdFrom = base(QUARTERDECK.from);
  const qdTo = base(QUARTERDECK.to);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.99, 0.97, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(QUARTERDECK.y, qdFrom, qdTo, 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, qdTo, 0.95);
  addDeckSeams(batch, p.dark, hull, QUARTERDECK.y, qdFrom, qdTo);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.09), identity);
    for (const y of WALES) batch.add(p.trim, hull.buildRail(side, y, 0.03, 0.06, true), identity);
    for (const z of L.ports) {
      const s = hull.stationAt(z / hull.halfLength);
      batch.add(p.dark, box(0.05, 0.42, 0.48), tf(side * (hull.halfWidthAt(s, PORT_Y) + 0.02), PORT_Y, z));
    }
  }
  addQuarterdeck(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L, cylinderBetween);
  addBoat(batch, p, L);

  // Mâts inclinés vers l'arrière : hune, barres de perroquet, chouque ; mât de senau ; hampe du pavillon ; roue.
  for (const [mast, radius] of [[L.foreMast, 0.23], [L.mainMast, 0.25]] as const) {
    const mid = alongMast(mast, mast.length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.length, 8), tf(0, mid.y, mid.z, -RAKE));
    const top = alongMast(mast, mast.top);
    batch.add(p.wood, new THREE.CylinderGeometry(0.9, 0.8, 0.12, 10), tf(0, top.y, top.z, -RAKE));
    const trees = alongMast(mast, mast.sails[1].along + 0.6);
    batch.add(p.wood, box(2.3, 0.1, 0.5), tf(0, trees.y, trees.z, -RAKE));
    const cap = alongMast(mast, mast.length);
    batch.add(p.dark, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), tf(0, cap.y + 0.05, cap.z, -RAKE));
  }
  const senau = L.senauMast;
  const senauMid = alongMast(senau, senau.length / 2);
  batch.add(p.wood, new THREE.CylinderGeometry(0.09, 0.11, senau.length, 6), tf(0, senauMid.y, senauMid.z, -RAKE));
  const mainCap = alongMast(L.mainMast, L.mainMast.length);
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, mainCap.y + 0.6, mainCap.z));
  batch.add(p.wood, box(0.14, L.wheel.y - QUARTERDECK.y, 0.14), tf(0, (L.wheel.y + QUARTERDECK.y) / 2, L.wheel.z - 0.12));

  // Pont : caillebotis, cabestan, cargaison et cordages dans l'axe (les flancs restent aux canons).
  addHatch(batch, p, tf(0, DECK_Y, at(-0.38).z), 1.1, 1.2, 'grating');
  addHatch(batch, p, tf(0, DECK_Y, at(0.62).z), 1, 1.1, 'grating');
  const capstan = at(-0.5).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.28, 0.34, 0.8, 8), tf(0, DECK_Y + 0.4, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8), tf(0, DECK_Y + 0.82, capstan));
  addBarrel(batch, p, tf(0.5, DECK_Y, at(0.78).z));
  addBarrel(batch, p, tf(-0.5, DECK_Y, at(0.78).z, 0, 0.7));
  addCrate(batch, p, tf(0.5, QUARTERDECK.y, at(-0.66).z, 0, 0.3));
  addRopeCoil(batch, p, tf(-0.55, DECK_Y, L.foreMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.55, DECK_Y, L.mainMast.z + 0.8));

  const sails = (mast: SenauMast) => mast.sails.map((s) => buildSquareSail(s.width, s.height, 0.55));
  const yards = (mast: SenauMast) =>
    mast.sails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.08, 0.08, s.width + 0.5, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    });
  addLampFixtures(batch, p, senauLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    squareSails: [sails(L.foreMast), sails(L.mainMast)],
    yards: [yards(L.foreMast), yards(L.mainMast)],
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.4)),
    spanker: buildGaffSail(L.spanker),
    boom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, L.spanker.clew.z - 0.3), 0.1, 0.07),
    gaff: cylinderBetween(L.spanker.throat, L.spanker.peak, 0.08, 0.05),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.3),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Haubans des deux mâts, étais (grand mât → misaine → bout-dehors, focs), sous-barbe. */
function buildRigging(L: SenauLayout): THREE.BufferGeometry {
  const { hull } = L;
  const fore = alongMast(L.foreMast, L.foreMast.length - 0.6);
  const main = alongMast(L.mainMast, L.mainMast.length - 0.6);
  const points: THREE.Vector3[] = [
    fore, L.bowsprit.tip,
    main, alongMast(L.foreMast, L.foreMast.top + 0.4),
    alongMast(L.mainMast, L.mainMast.length - 3.6), alongMast(L.foreMast, L.foreMast.length - 3),
    L.bowsprit.tip, new THREE.Vector3(0, 0.8, hull.stationAt(1).z - 0.1),
  ];
  for (const j of L.jibs) points.push(j.head, j.tack);
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière, sur le plat-bord.
  for (const side of [1, -1]) {
    for (const mast of [L.foreMast, L.mainMast]) {
      const top = alongMast(mast, mast.top);
      for (const dz of [-0.5, -1.2, -1.9, -2.6]) {
        const s = hull.stationAt((mast.z + dz) / hull.halfLength);
        points.push(top, new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale) * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
