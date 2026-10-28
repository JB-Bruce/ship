import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { galiotLamps } from './galiotLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch, addStairs } from '../parts/deckFittings';
import { addMortarPlatform, buildMortarGeometry } from '../parts/mortar';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { alongMast, DECK_Y, PORT_Y, QUARTERDECK, RAKE, type GaliotLayout, type GaliotMast } from './galiotLayout';

/** Préceintes : hauteurs (m). */
const WALES = [1.15, 2.05] as const;
/** Fenêtres de la chambre, sous le gaillard d'arrière (tableau et flancs) : hauteur de leur centre (m). */
const CABIN_WINDOW_Y = (DECK_Y + QUARTERDECK.y) / 2 + 0.1;
/** Couronnement : lisse qui ferme le haut du tableau arrière (m). */
const TAFFRAIL = { height: 0.16, depth: 0.26 };

export interface GaliotTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues de chaque mât (grand mât, artimon), de bas en haut. */
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
  /** Mortiers : affût (bois) et fût (métal), qui pivotent ensemble. */
  mortarBed: THREE.BufferGeometry;
  mortarTube: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, grande) et par livrée. */
const templates = new Map<GaliotLayout, Map<Livery, GaliotTemplate>>();

export function galiotTemplateFor(layout: GaliotLayout, livery: Livery): GaliotTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: GaliotLayout, livery: Livery): GaliotTemplate {
  const { hull, at, base } = L;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont du milieu et gaillard d'arrière planchés, lisses et préceintes ; sabords des canons de flanc.
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

  // Étrave et beaupré.
  const stem = at(1);
  batch.add(p.trim, box(0.16, stem.gunwale - stem.keel + 0.2, 0.2), tf(0, (stem.gunwale + stem.keel) / 2, stem.z - 0.06, -0.35));
  batch.add(p.wood, cylinderBetween(L.bowsprit.base, L.bowsprit.tip, 0.2, 0.09), identity);
  for (const x of [-0.3, 0.3]) batch.add(p.wood, box(0.2, 0.7, 0.2), tf(x, DECK_Y + 0.35, L.bowsprit.base.z - 0.25));

  // Mâts : grand mât (hune, barres, chouque, hampe du pavillon) et artimon sur le gaillard ; colonne de la roue.
  for (const [mast, radius] of [[L.mainMast, 0.26], [L.mizzen, 0.17]] as const) {
    const mid = alongMast(mast, mast.length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.length, 8), tf(0, mid.y, mid.z, -RAKE));
    const top = alongMast(mast, mast.top);
    const rim = mast === L.mainMast ? 0.9 : 0.55;
    batch.add(p.wood, new THREE.CylinderGeometry(rim, rim - 0.1, 0.12, 10), tf(0, top.y, top.z, -RAKE));
    const cap = alongMast(mast, mast.length);
    batch.add(p.dark, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), tf(0, cap.y + 0.05, cap.z, -RAKE));
  }
  const trees = alongMast(L.mainMast, L.mainMast.sails[1].along + 0.6);
  batch.add(p.wood, box(2.4, 0.1, 0.5), tf(0, trees.y, trees.z, -RAKE));
  const mainCap = alongMast(L.mainMast, L.mainMast.length);
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, mainCap.y + 0.6, mainCap.z));
  batch.add(p.wood, box(0.14, L.wheel.y - QUARTERDECK.y, 0.14), tf(0, (L.wheel.y + QUARTERDECK.y) / 2, L.wheel.z - 0.12));

  // Pont du milieu : caillebotis, cabestan, cargaison dans l'axe ; à l'avant, les puits renforcés des mortiers.
  addHatch(batch, p, tf(0, DECK_Y, at(-0.18).z), 1.2, 1.4, 'grating');
  const capstan = at(-0.36).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.3, 0.36, 0.85, 8), tf(0, DECK_Y + 0.42, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), tf(0, DECK_Y + 0.86, capstan));
  for (const m of L.mortars) addMortarPlatform(batch, p, tf(m.x, DECK_Y, m.z), L.platform);
  addBarrel(batch, p, tf(0.6, DECK_Y, at(0.82).z));
  addBarrel(batch, p, tf(-0.6, DECK_Y, at(0.82).z, 0, 0.7));
  addCrate(batch, p, tf(0.5, QUARTERDECK.y, at(-0.62).z, 0, 0.3));
  addRopeCoil(batch, p, tf(-0.55, DECK_Y, L.mainMast.z - 0.9));
  addRopeCoil(batch, p, tf(0.55, QUARTERDECK.y, L.mizzen.z + 0.8));

  const sails = (mast: GaliotMast) => mast.sails.map((s) => buildSquareSail(s.width, s.height, 0.55));
  const yards = (mast: GaliotMast) =>
    mast.sails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.08, 0.08, s.width + 0.5, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    });
  const mortar = buildMortarGeometry();
  addLampFixtures(batch, p, galiotLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    squareSails: [sails(L.mainMast), sails(L.mizzen)],
    yards: [yards(L.mainMast), yards(L.mizzen)],
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.4)),
    spanker: buildGaffSail(L.spanker),
    boom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, L.spanker.clew.z - 0.3), 0.09, 0.07),
    gaff: cylinderBetween(L.spanker.throat, L.spanker.peak, 0.08, 0.05),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.3),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    mortarBed: mortar.bed,
    mortarTube: mortar.tube,
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Cloison du gaillard d'arrière (porte, fenêtres), escaliers du pont du milieu, fenêtres de la chambre sur les flancs. */
function addQuarterdeck(batch: GeometryBatch, p: Palette, L: GaliotLayout) {
  const { hull, at } = L;
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const front = at(QUARTERDECK.to);
  const rise = QUARTERDECK.y - DECK_Y;
  batch.add(p.wood, box(2 * hull.halfWidthAt(front, DECK_Y + rise / 2) * 0.98, rise, 0.12), tf(0, DECK_Y + rise / 2, L.bulkhead));
  batch.add(p.dark, box(0.75, 1.05, 0.04), tf(0, DECK_Y + 0.52, L.bulkhead + 0.07));
  for (const x of [-1.5, 1.5]) batch.add(p.window, box(0.4, 0.3, 0.04), tf(x, DECK_Y + 0.75, L.bulkhead + 0.07));
  for (const side of [1, -1]) addStairs(batch, p, tf(side * 2.1, DECK_Y, L.bulkhead), rise, 4);
  for (const side of [1, -1]) {
    for (const u of [-0.9, -0.78, -0.66]) {
      const s = at(u);
      batch.add(p.window, box(0.05, 0.34, 0.4), tf(side * (hull.halfWidthAt(s, CABIN_WINDOW_Y) + 0.03), CABIN_WINDOW_Y, s.z));
    }
  }
}

/** Tableau arrière : fenêtres de la chambre entre deux moulures, couronnement, fanal sur la hanche (la bôme passe au-dessus). */
function addStern(batch: GeometryBatch, p: Palette, L: GaliotLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const half = hull.halfWidthAt(stern, CABIN_WINDOW_Y);
  for (const x of [-0.66, -0.22, 0.22, 0.66]) batch.add(p.window, box(0.36, 0.42, 0.05), tf(x * half, CABIN_WINDOW_Y, stern.z - 0.02));
  for (const y of [CABIN_WINDOW_Y - 0.36, CABIN_WINDOW_Y + 0.36]) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y) - 0.1, 0.08, 0.06), tf(0, y, stern.z - 0.03));
  for (const y of WALES) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y) + 0.08, 0.11, 0.08), tf(0, y, stern.z - 0.04));
  batch.add(p.trim, box(2 * stern.halfWidth + 0.16, TAFFRAIL.height, TAFFRAIL.depth), tf(0, stern.gunwale, stern.z + TAFFRAIL.depth / 2 - 0.08));
  addLantern(batch, p, tf(stern.halfWidth * 0.75, stern.gunwale + TAFFRAIL.height / 2, stern.z + 0.3, 0, 0, 0, 0.85));
}

/** Haubans des deux mâts, étais (grand mât → beaupré, artimon → grand mât), sous-barbe. */
function buildRigging(L: GaliotLayout): THREE.BufferGeometry {
  const { hull } = L;
  const main = alongMast(L.mainMast, L.mainMast.length - 0.6);
  const mizzen = alongMast(L.mizzen, L.mizzen.length - 0.5);
  const points: THREE.Vector3[] = [
    main, L.bowsprit.tip,
    alongMast(L.mainMast, L.mainMast.top + 0.3), L.bowsprit.base.clone().lerp(L.bowsprit.tip, 0.4),
    mizzen, alongMast(L.mainMast, L.mainMast.top + 2),
    L.bowsprit.tip, new THREE.Vector3(0, 0.9, hull.stationAt(1).z - 0.1),
  ];
  for (const j of L.jibs) points.push(j.head, j.tack);
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière, sur le plat-bord.
  const shrouds: [GaliotMast, number[]][] = [
    [L.mainMast, [-0.5, -1.2, -1.9, -2.6]],
    [L.mizzen, [-0.4, -1.1]],
  ];
  for (const side of [1, -1]) {
    for (const [mast, offsets] of shrouds) {
      const top = alongMast(mast, mast.top);
      for (const dz of offsets) {
        const s = hull.stationAt((mast.z + dz) / hull.halfLength);
        points.push(top, new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale) * 0.98, s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
