import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DARK_WOOD, GILT, HULL_WOOD } from './galleonDecor';
import type { GalleonLayout } from './galleonLayout';

/** Étrave : sections (u de base) dont elle suit la quille, jusqu'au pied de l'éperon courbe de la poulaine. */
const STEM_LINE = [0.82, 0.9, 0.96, 1];
/** Caillebotis de la poulaine : écart des lattes (m). */
const GRATING = 0.38;
/** Éperon courbe : épaisseur (m). */
const CUTWATER = 0.32;
/**
 * Ajour de l'éperon, bordé d'un cadre doré : une seule ouverture le long de son bord bas (étendue en paramètre de la
 * courbe de ce bord), à `inset` m au-dessus de lui et `below` m sous la plate-forme : de larges bords de bois tout autour.
 */
const OPENINGS = { spans: [[0.17, 0.7]] as const, inset: 0.85, below: 0.85, steps: 8, frame: 0.05 };
/** Lion de proue cabré : inclinaison de son corps vers le haut (rad). */
const LION_REAR = 0.62;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const identity = new THREE.Matrix4();

/**
 * Avant : étrave qui suit la quille, éperon courbe (ajouré, cadre doré) qui part d'elle et remonte jusqu'au lion de proue doré, plate-forme
 * à caillebotis de la poulaine posée dessus, lisses courbes de l'avant du château vers le lion, bossoirs ; beaupré qui
 * sort du pont du château avant et que des liures attachent à l'éperon, hune et petit mât de contre-civadière à sa
 * pointe, vergue de civadière.
 */
export function addBow(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull, beak, forecastle } = L;
  const stem = hull.stationAt(1);
  const fig = beak.figurehead;
  const line = STEM_LINE.map((u) => L.at(u)).map((s) => new THREE.Vector3(0, s.keel, s.z));
  line.push(new THREE.Vector3(0, beak.cutwaterFoot, stem.z));
  for (let i = 0; i < line.length - 1; i++) batch.add(DARK_WOOD, cylinderBetween(line[i], line[i + 1], 0.16, 0.16, 4), identity);

  // Éperon : une pièce courbe dans l'axe (dessinée dans le plan (z, y), puis tournée), de l'étrave au lion, ajourée.
  const foot = new THREE.Vector2(stem.z - 0.2, beak.cutwaterFoot);
  const nose = new THREE.Vector2(fig.z - 0.3, fig.y - 0.25);
  const top = new THREE.Vector2(fig.z - 0.75, fig.y + 0.1);
  const root = new THREE.Vector2(stem.z - 0.2, beak.y);
  const bottom = new THREE.QuadraticBezierCurve(foot, new THREE.Vector2(beak.tipZ - 0.9, foot.y + 0.2), nose);
  const cutwater = new THREE.Shape();
  cutwater.moveTo(foot.x, foot.y);
  cutwater.quadraticCurveTo(beak.tipZ - 0.9, foot.y + 0.2, nose.x, nose.y);
  cutwater.lineTo(top.x, top.y);
  cutwater.quadraticCurveTo(beak.tipZ - 1.6, beak.y - 0.15, root.x, root.y);
  cutwater.lineTo(foot.x, foot.y);
  const openings = OPENINGS.spans.map(([a, b]) => {
    const along = Array.from({ length: OPENINGS.steps + 1 }, (_, i) => bottom.getPoint(a + ((b - a) * i) / OPENINGS.steps).add(new THREE.Vector2(0, OPENINGS.inset)));
    const y = beak.y - OPENINGS.below;
    return [...along, new THREE.Vector2(along[along.length - 1].x, y), new THREE.Vector2(along[0].x, y)];
  });
  cutwater.holes = openings.map((outline) => new THREE.Path(outline));
  const plate = new THREE.ExtrudeGeometry(cutwater, { depth: CUTWATER, bevelEnabled: false, curveSegments: 10 });
  plate.rotateY(-Math.PI / 2);
  plate.translate(CUTWATER / 2, 0, 0);
  batch.add(HULL_WOOD, plate, identity);
  // Filets dorés le long du bord bas de l'éperon, et cadre doré autour de l'ajour, de chaque côté.
  const edge = bottom.getPoints(10);
  for (const side of [1, -1]) {
    const x = side * (CUTWATER / 2 + 0.02);
    const points = edge.map((v) => new THREE.Vector3(x, v.y + 0.12, v.x));
    batch.add(GILT, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.045, 4, false), identity);
    for (const outline of openings) {
      const ring = outline.map((v) => new THREE.Vector3(x, v.y, v.x));
      ring.forEach((a, i) => batch.add(GILT, cylinderBetween(a, ring[(i + 1) % ring.length], OPENINGS.frame, OPENINGS.frame, 4), identity));
    }
  }

  // Plate-forme à caillebotis, posée sur l'éperon, qui se resserre vers le lion.
  const tipZ = top.x;
  const deck = new THREE.Shape();
  deck.moveTo(beak.halfWidth, -beak.rootZ);
  deck.lineTo(0.2, -tipZ);
  deck.lineTo(-0.2, -tipZ);
  deck.lineTo(-beak.halfWidth, -beak.rootZ);
  const platform = new THREE.ExtrudeGeometry(deck, { depth: 0.12, bevelEnabled: false });
  platform.rotateX(-Math.PI / 2);
  platform.translate(0, beak.y - 0.12, 0);
  batch.add(HULL_WOOD, platform, identity);
  for (let z = beak.rootZ + GRATING; z < tipZ - 0.2; z += GRATING) {
    const w = 0.2 + (beak.halfWidth - 0.2) * (1 - (z - beak.rootZ) / (tipZ - beak.rootZ));
    batch.add(p.dark, box(2 * w, 0.05, 0.08), tf(0, beak.y + 0.02, z));
  }

  // Lisses : de l'avant du château avant, elles descendent puis remontent en courbe jusque derrière le lion.
  const fcFront = L.station(forecastle.to);
  for (const side of [1, -1]) {
    const rail = (y0: number, dip: number, end: THREE.Vector3) => {
      const x0 = side * hull.halfWidthAt(fcFront, y0) * 0.92;
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(x0, y0, fcFront.z + 0.1),
        new THREE.Vector3(side * beak.halfWidth * 1.05, beak.y + dip + 0.25, beak.rootZ + 0.5),
        new THREE.Vector3(side * beak.halfWidth * 0.62, beak.y + dip, beak.rootZ + (tipZ - beak.rootZ) * 0.55),
        new THREE.Vector3(side * 0.24, beak.y + dip + 0.15, tipZ - 0.15),
        end,
      ]);
    };
    const upper = rail(forecastle.y + 0.9, 0.95, new THREE.Vector3(0, fig.y + 0.55, fig.z - 0.55));
    const lower = rail(forecastle.y - 0.2, 0.42, new THREE.Vector3(0, fig.y + 0.15, fig.z - 0.6));
    batch.add(GILT, new THREE.TubeGeometry(upper, 20, 0.06, 5, false), identity);
    batch.add(p.wood, new THREE.TubeGeometry(lower, 20, 0.055, 5, false), identity);
    // Jambettes entre les lisses et la plate-forme.
    for (const t of [0.35, 0.55, 0.75]) {
      const a = upper.getPoint(t);
      batch.add(p.wood, cylinderBetween(a, new THREE.Vector3(a.x, beak.y, a.z), 0.04, 0.04, 4), identity);
    }
  }
  addLion(batch, fig);

  // Bossoirs de part et d'autre du château avant.
  const cat = L.station(forecastle.to - 0.02);
  for (const side of [1, -1]) batch.add(p.wood, box(1, 0.2, 0.2), tf(side * (hull.halfWidthAt(cat, forecastle.y + 0.4) + 0.25), forecastle.y + 0.4, cat.z));

  // Beaupré : il sort du pont du château avant ; liures qui le serrent contre l'éperon ; hune et mât de contre-civadière.
  const { base, tip, topmast } = L.bowsprit;
  batch.add(p.wood, cylinderBetween(base, tip, 0.28, 0.12), identity);
  const along = (z: number) => base.clone().lerp(tip, (z - base.z) / (tip.z - base.z));
  for (const dz of [0.35, 0.6]) {
    const up = along(beak.rootZ + dz);
    batch.add(p.rope, cylinderBetween(up, new THREE.Vector3(0, beak.y - 0.1, up.z + 0.15), 0.05, 0.05, 4), identity);
  }
  batch.add(p.wood, new THREE.CylinderGeometry(0.45, 0.32, 0.25, 10), tf(0, tip.y + 0.05, tip.z));
  batch.add(p.wood, cylinderBetween(tip.clone().setY(tip.y - 0.2), topmast, 0.1, 0.07, 6), identity);
  batch.add(p.dark, new THREE.CylinderGeometry(0.09, 0.09, 0.1, 6), tf(0, topmast.y + 0.05, topmast.z));
  const sprit = L.spritsail;
  batch.add(p.wood, cylinderBetween(sprit.yard.clone().setX(-sprit.width / 2 - 0.2), sprit.yard.clone().setX(sprit.width / 2 + 0.2), 0.08), identity);
}

/**
 * Lion de proue doré, cabré au bout de l'éperon (`at` : le pied du lion, sur la pointe de l'éperon), tourné vers l'avant
 * (+Z) : arrière-train assis sur l'éperon, corps dressé, crinière en collerette, tête, museau et oreilles, pattes avant
 * levées griffes en avant, queue relevée en courbe.
 */
function addLion(batch: GeometryBatch, at: THREE.Vector3) {
  const frame = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(-LION_REAR, 0, 0)), new THREE.Vector3(1, 1, 1));
  const part = (geometry: THREE.BufferGeometry, local: THREE.Matrix4) => batch.add(GILT, geometry, frame.clone().multiply(local));
  const ball = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) =>
    part(new THREE.SphereGeometry(r, 7, 5), tf(x, y, z, rx, 0, 0, [sx, sy, sz]));
  const limb = (a: [number, number, number], b: [number, number, number], r0: number, r1: number) =>
    part(cylinderBetween(new THREE.Vector3(...a), new THREE.Vector3(...b), r0, r1, 5), new THREE.Matrix4());
  // Arrière-train et corps.
  ball(0.3, 1, 0.85, 1.15, 0, 0.26, -0.18);
  ball(0.3, 0.95, 0.9, 1.5, 0, 0.42, 0.22, -0.35);
  // Crinière : une collerette autour du cou, puis la tête et son museau, les oreilles.
  part(new THREE.IcosahedronGeometry(0.36, 1), tf(0, 0.7, 0.6, -0.3, 0, 0, [1.05, 1, 0.8]));
  ball(0.22, 1, 1, 1.05, 0, 0.82, 0.83);
  part(new THREE.CylinderGeometry(0.1, 0.13, 0.2, 6), tf(0, 0.76, 1.03, Math.PI / 2 + 0.25));
  for (const x of [-0.13, 0.13]) part(new THREE.ConeGeometry(0.06, 0.12, 4), tf(x, 1.02, 0.78));
  // Pattes avant levées, griffes en avant ; pattes arrière repliées sur l'éperon.
  for (const x of [-0.15, 0.15]) {
    limb([x, 0.5, 0.48], [x * 1.1, 0.62, 0.86], 0.075, 0.065);
    limb([x * 1.1, 0.62, 0.86], [x * 1.1, 0.48, 1.1], 0.065, 0.06);
    ball(0.075, 1.1, 0.8, 1.3, x * 1.1, 0.45, 1.15);
    limb([x * 1.4, 0.2, -0.12], [x * 1.4, 0.05, 0.18], 0.09, 0.07);
    ball(0.075, 1.1, 0.7, 1.4, x * 1.4, 0.02, 0.25);
  }
  // Queue relevée en courbe, un pompon au bout.
  const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.3, -0.45), new THREE.Vector3(0, 0.45, -0.7), new THREE.Vector3(0, 0.78, -0.72), new THREE.Vector3(0, 0.95, -0.55)]);
  part(new THREE.TubeGeometry(tail, 8, 0.035, 4, false), new THREE.Matrix4());
  ball(0.07, 1, 1.3, 1, 0, 0.99, -0.5);
}
