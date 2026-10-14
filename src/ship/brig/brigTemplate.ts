import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { alongMast, BAND, DECK_Y, NETTING, PORT_Y, RAKE, type BrigLayout } from './brigLayout';

/** Bande des sabords et figure de proue : un ocre doré, le même pour tous les camps (le reste suit la livrée). */
const bandMaterial = std(0xd8a23a);
/** Hamacs roulés dans les filets de bastingage. */
const hammockMaterial = std(0xd9cfb4);
/** Préceintes : hauteurs (m), aux bords de la bande et plus bas. */
const WALES = [BAND.from - 0.02, BAND.to + 0.02, 0.85] as const;
/** Fenêtres du tableau arrière : hauteur de leur centre (m). */
const STERN_WINDOW_Y = 2.15;

export interface BrigTemplate {
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

/** Un gabarit par plan (de base, allongé) et par livrée. */
const templates = new Map<BrigLayout, Map<Livery, BrigTemplate>>();

export function brigTemplateFor(layout: BrigLayout, livery: Livery): BrigTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: BrigLayout, livery: Livery): BrigTemplate {
  const { hull, at } = L;
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Coque, pont ras d'un bout à l'autre, lisses et préceintes ; bande ocre percée des sabords.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.99, 0.97, 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, -0.98, 0.95);
  batch.add(bandMaterial, hull.buildBand(() => BAND.from, () => BAND.to, 0.012), identity);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.08), identity);
    for (const y of WALES) batch.add(p.trim, hull.buildRail(side, y, 0.025, 0.05, true), identity);
    for (const z of L.ports) {
      const s = hull.stationAt(z / hull.halfLength);
      batch.add(p.dark, box(0.05, 0.42, 0.48), tf(side * (hull.halfWidthAt(s, PORT_Y) + 0.02), PORT_Y, z));
    }
  }
  addNetting(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);

  // Mâts inclinés vers l'arrière : hune, barres de perroquet, chouque ; hampe du pavillon au grand mât ; colonne de la roue.
  for (const [mast, radius] of [[L.foreMast, 0.22], [L.mainMast, 0.24]] as const) {
    const mid = alongMast(mast.z, mast.length / 2);
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.length, 8), tf(0, mid.y, mid.z, -RAKE));
    const top = alongMast(mast.z, mast.top);
    batch.add(p.wood, new THREE.CylinderGeometry(0.85, 0.75, 0.12, 10), tf(0, top.y, top.z, -RAKE));
    const trees = alongMast(mast.z, mast.sails[1].along + 0.6);
    batch.add(p.wood, box(2.2, 0.1, 0.5), tf(0, trees.y, trees.z, -RAKE));
    const cap = alongMast(mast.z, mast.length);
    batch.add(p.dark, new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), tf(0, cap.y + 0.05, cap.z, -RAKE));
  }
  const mainCap = alongMast(L.mainMast.z, L.mainMast.length);
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, mainCap.y + 0.6, mainCap.z));
  batch.add(p.wood, box(0.14, L.wheel.y - DECK_Y, 0.14), tf(0, (L.wheel.y + DECK_Y) / 2, L.wheel.z - 0.12));

  // Pont : caillebotis, cabestan entre les mâts, cargaison et cordages dans l'axe (les flancs restent aux canons).
  addHatch(batch, p, tf(0, DECK_Y, at(0.12).z), 1.1, 1.3, 'grating');
  addHatch(batch, p, tf(0, DECK_Y, at(-0.5).z), 1, 1.1, 'grating');
  const capstan = at(-0.05).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.28, 0.34, 0.8, 8), tf(0, DECK_Y + 0.4, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8), tf(0, DECK_Y + 0.82, capstan));
  addBarrel(batch, p, tf(0.5, DECK_Y, at(0.62).z));
  addBarrel(batch, p, tf(-0.5, DECK_Y, at(0.62).z, 0, 0.7));
  addCrate(batch, p, tf(0.35, DECK_Y, at(-0.62).z, 0, 0.2));
  addRopeCoil(batch, p, tf(-0.5, DECK_Y, L.foreMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.5, DECK_Y, L.mainMast.z - 0.8));

  const sails = (mast: BrigLayout['foreMast']) => mast.sails.map((s) => buildSquareSail(s.width, s.height, 0.55));
  const yards = (mast: BrigLayout['foreMast']) =>
    mast.sails.map((s) => {
      const yard = new THREE.CylinderGeometry(0.075, 0.075, s.width + 0.5, 6);
      yard.rotateZ(Math.PI / 2);
      return yard;
    });
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
    rudder: buildRudderGeometry(2.2),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Filets de bastingage : hamacs roulés sur le plat-bord de chaque bord, entre des chandeliers, sous une lisse fine. */
function addNetting(batch: GeometryBatch, p: Palette, L: BrigLayout) {
  const { hull } = L;
  const [from, to] = [L.base(NETTING.from), L.base(NETTING.to)];
  const steps = 16;
  for (const side of [1, -1]) {
    const roll: THREE.Vector3[] = [];
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const s = hull.stationAt(from + ((to - from) * i) / steps);
      const x = side * (hull.halfWidthAt(s, s.gunwale) - 0.06);
      roll.push(new THREE.Vector3(x, s.gunwale + NETTING.height / 2, s.z));
      rail.push(new THREE.Vector3(x, s.gunwale + NETTING.height + 0.04, s.z));
      if (i % 2 === 0) batch.add(p.dark, new THREE.BoxGeometry(0.05, NETTING.height + 0.06, 0.05), tf(x, s.gunwale + (NETTING.height + 0.06) / 2, s.z));
    }
    batch.add(hammockMaterial, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(roll), 32, NETTING.height / 2, 6, false), new THREE.Matrix4());
    batch.add(p.dark, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 32, 0.025, 4, false), new THREE.Matrix4());
  }
}

/** Poupe basse : tableau plat à petites fenêtres entre deux moulures, couronnement, fanal sur la hanche bâbord. */
function addStern(batch: GeometryBatch, p: Palette, L: BrigLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const half = hull.halfWidthAt(stern, STERN_WINDOW_Y);
  for (const x of [-0.6, -0.2, 0.2, 0.6]) batch.add(p.window, box(0.34, 0.36, 0.05), tf(x * half, STERN_WINDOW_Y, stern.z - 0.02));
  for (const y of [STERN_WINDOW_Y - 0.3, STERN_WINDOW_Y + 0.3]) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y) - 0.1, 0.08, 0.06), tf(0, y, stern.z - 0.03));
  batch.add(bandMaterial, box(2 * half - 0.3, 0.12, 0.05), tf(0, BAND.to - 0.05, stern.z - 0.035));
  batch.add(p.trim, box(2 * stern.halfWidth + 0.12, 0.14, 0.2), tf(0, stern.gunwale, stern.z + 0.06));
  // La bôme passe au-dessus de la poupe : le fanal est sur la hanche, assez bas pour qu'elle le survole.
  addLantern(batch, p, tf(stern.halfWidth * 0.75, stern.gunwale + 0.07, stern.z + 0.25, 0, 0, 0, 0.8));
}

/** Avant : étrave, beaupré et bout-dehors, figure de proue dorée sous le beaupré. */
function addBow(batch: GeometryBatch, p: Palette, L: BrigLayout) {
  const { hull } = L;
  const stem = hull.stationAt(1);
  batch.add(p.trim, new THREE.BoxGeometry(0.14, stem.gunwale - stem.keel + 0.2, 0.18), tf(0, (stem.gunwale + stem.keel) / 2, stem.z - 0.05, -0.2));
  const { base, tip } = L.bowsprit;
  const joint = base.clone().lerp(tip, 0.55);
  batch.add(p.wood, cylinderBetween(base, joint, 0.17, 0.12), new THREE.Matrix4());
  batch.add(p.wood, cylinderBetween(joint.clone().add(new THREE.Vector3(0, 0.12, -0.6)), tip, 0.09, 0.05), new THREE.Matrix4());
  batch.add(p.dark, new THREE.BoxGeometry(0.3, 0.3, 0.3), tf(0, joint.y + 0.06, joint.z));
  // Figure de proue : un buste doré penché vers l'avant, sur l'éperon de l'étrave.
  batch.add(bandMaterial, new THREE.BoxGeometry(0.22, 0.75, 0.32), tf(0, 2, stem.z - 0.08, 0.5));
  batch.add(bandMaterial, new THREE.SphereGeometry(0.15, 6, 4), tf(0, 2.4, stem.z + 0.12));
}

/** Haubans des deux mâts, étais (grand mât → misaine → bout-dehors), sous-barbe. */
function buildRigging(L: BrigLayout): THREE.BufferGeometry {
  const { hull } = L;
  const fore = alongMast(L.foreMast.z, L.foreMast.length - 0.6);
  const main = alongMast(L.mainMast.z, L.mainMast.length - 0.6);
  const points: THREE.Vector3[] = [
    fore, L.bowsprit.tip,
    main, alongMast(L.foreMast.z, L.foreMast.top + 0.4),
    alongMast(L.mainMast.z, L.mainMast.length - 3.5), alongMast(L.foreMast.z, L.foreMast.length - 3),
    L.bowsprit.tip, new THREE.Vector3(0, 0.7, hull.stationAt(1).z - 0.1),
  ];
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière, sur le plat-bord.
  for (const side of [1, -1]) {
    for (const [mast, head] of [[L.foreMast, fore], [L.mainMast, main]] as const) {
      const top = alongMast(mast.z, mast.top);
      for (const dz of [-0.5, -1.2, -1.9, -2.6]) {
        const s = hull.stationAt((mast.z + dz) / hull.halfLength);
        const foot = new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale) * 0.98, s.gunwale + NETTING.height, s.z);
        points.push(top, foot);
        if (dz > -1.5) points.push(head, new THREE.Vector3(side * 0.8, top.y, top.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
