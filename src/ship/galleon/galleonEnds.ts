import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addLantern, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DARK_WOOD, GILT, HULL_WOOD } from './galleonDecor';
import { WALES, type GalleonLayout } from './galleonLayout';

/** Tableau arrière : rangées de fenêtres (hauteur du centre : chambre sous le gaillard, chambre de la dunette). */
const STERN_WINDOWS = [8.55, 10.65];
/** Galeries de poupe (bouteilles) sur la hanche : étendue (u de base), saillie, étages (bas, haut) (m). */
const QUARTER = { from: -0.985, to: -0.84, depth: 0.8, levels: [[7.7, 9.4], [9.8, 11.5]] as const };
/** Étrave : sections (u de base) dont elle suit la quille, qui remonte vers la poulaine. */
const STEM_LINE = [0.82, 0.9, 0.96, 1];
/** Caillebotis de la poulaine : écart des lattes (m). */
const GRATING = 0.45;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const identity = new THREE.Matrix4();

/**
 * Poupe plate très haute : hauts peints aux couleurs du camp, deux rangées de fenêtres entre des moulures dorées, un
 * écusson doré sous le couronnement, préceintes en travers, trois grands fanaux.
 */
export function addStern(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const z = stern.z - 0.02;
  const width = (y: number) => 2 * hull.halfWidthAt(stern, y);
  // Hauts peints, de la préceinte haute jusque sous le couronnement, en bandes qui suivent la rentrée.
  const top = WALES[0];
  const from = top.y + top.sheer * L.sheer(-1) + top.height / 2;
  const to = stern.gunwale - 0.1;
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const [a, b] = [from + ((to - from) * i) / rows, from + ((to - from) * (i + 1)) / rows];
    batch.add(p.hull, box(width((a + b) / 2) - 0.04, b - a, 0.03), tf(0, (a + b) / 2, z));
  }
  STERN_WINDOWS.forEach((y, row) => {
    const half = hull.halfWidthAt(stern, y);
    const xs = row === 0 ? [-1, -1 / 3, 1 / 3, 1] : [-0.75, 0, 0.75];
    for (const x of xs) {
      batch.add(GILT, box(0.5, 0.58, 0.04), tf(x * (half - 0.5), y, z - 0.02));
      batch.add(p.window, box(0.38, 0.46, 0.05), tf(x * (half - 0.5), y, z - 0.035));
    }
    for (const dy of [-0.42, 0.42]) batch.add(GILT, box(width(y + dy) - 0.06, 0.09, 0.06), tf(0, y + dy, z - 0.02));
  });
  batch.add(GILT, box(1.3, 0.55, 0.06), tf(0, stern.gunwale - 0.55, z - 0.03));
  for (const w of WALES) {
    const y = w.y + w.sheer * L.sheer(-1);
    batch.add(DARK_WOOD, box(width(y), w.height, 0.06), tf(0, y, z - 0.01));
  }
  batch.add(p.trim, box(width(stern.gunwale) + 0.14, 0.16, 0.26), tf(0, stern.gunwale, stern.z + 0.08));
  for (const x of [-1.1, 0, 1.1]) addLantern(batch, p, tf(x, stern.gunwale + 0.08, stern.z + 0.25, 0, 0, 0, x === 0 ? 1.35 : 1));
}

/**
 * Galeries de poupe sur chaque hanche, à deux étages : caissons aux couleurs du camp qui débordent du bordé (ils
 * suivent sa courbe vers la poupe), fenêtres, dalles dorées dessus et dessous, cul-de-lampe doré sous l'étage bas.
 */
export function addQuarterGalleries(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull } = L;
  const [aft, fore] = [L.at(QUARTER.from), L.at(QUARTER.to)];
  for (const side of [1, -1]) {
    for (const [low, high] of QUARTER.levels) {
      const y = (low + high) / 2;
      const a = new THREE.Vector3(side * hull.halfWidthAt(aft, y), y, aft.z);
      const b = new THREE.Vector3(side * hull.halfWidthAt(fore, y), y, fore.z);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const length = a.distanceTo(b);
      // Vers l'extérieur, perpendiculaire au bordé (dans le plan horizontal).
      const out = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(side);
      const at = (t: number, d: number, dy = 0) => a.clone().lerp(b, t).addScaledVector(out, d).setY(y + dy);
      const centre = at(0.5, QUARTER.depth / 2 - 0.15);
      batch.add(p.hull, box(QUARTER.depth, high - low, length), tf(centre.x, y, centre.z, 0, yaw));
      for (const dy of [-(high - low) / 2, (high - low) / 2]) {
        const slab = at(0.5, QUARTER.depth / 2 - 0.1, dy);
        batch.add(GILT, box(QUARTER.depth + 0.12, 0.12, length + 0.14), tf(slab.x, slab.y, slab.z, 0, yaw));
      }
      for (const t of [0.22, 0.5, 0.78]) {
        const w = at(t, QUARTER.depth - 0.13);
        batch.add(p.window, box(0.05, (high - low) * 0.5, 0.42), tf(w.x, w.y, w.z, 0, yaw));
      }
      if (low === QUARTER.levels[0][0]) {
        const foot = at(0.5, QUARTER.depth / 2 - 0.1, -(high - low) / 2 - 0.45);
        batch.add(GILT, new THREE.ConeGeometry(0.45, 0.8, 6), tf(foot.x, foot.y, foot.z, Math.PI));
      }
    }
  }
}

/**
 * Avant : étrave qui suit la quille jusqu'à la poulaine (plate-forme à caillebotis en avant du petit pont de l'avant,
 * lisses, jambe de force pleine dessous, lion de proue doré au bout), bossoirs, beaupré et vergue de civadière.
 */
export function addBow(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull, beak, forecastle } = L;
  const stem = hull.stationAt(1);
  const line = STEM_LINE.map((u) => L.at(u)).map((s) => new THREE.Vector3(0, s.keel, s.z));
  line.push(new THREE.Vector3(0, beak.y, stem.z + 0.05));
  for (let i = 0; i < line.length - 1; i++) batch.add(DARK_WOOD, cylinderBetween(line[i], line[i + 1], 0.16, 0.16, 4), identity);

  // Plate-forme en triangle (dessinée dans le plan (x, -z), puis couchée à plat), et ses lattes en travers.
  const deck = new THREE.Shape();
  deck.moveTo(beak.halfWidth, -beak.rootZ);
  deck.lineTo(0, -beak.tipZ);
  deck.lineTo(-beak.halfWidth, -beak.rootZ);
  const platform = new THREE.ExtrudeGeometry(deck, { depth: 0.14, bevelEnabled: false });
  platform.rotateX(-Math.PI / 2);
  platform.translate(0, beak.y - 0.14, 0);
  batch.add(HULL_WOOD, platform, identity);
  for (let z = beak.rootZ + GRATING; z < beak.tipZ - 0.6; z += GRATING) {
    const w = beak.halfWidth * (1 - (z - beak.rootZ) / (beak.tipZ - beak.rootZ));
    batch.add(p.dark, box(2 * w, 0.05, 0.08), tf(0, beak.y + 0.02, z));
  }
  // Jambe de force pleine sous la plate-forme, de l'étrave à la pointe.
  const knee = new THREE.Shape();
  knee.moveTo(beak.rootZ - 0.2, stem.keel + 1);
  knee.lineTo(beak.rootZ - 0.2, beak.y - 0.1);
  knee.lineTo(beak.tipZ - 0.3, beak.y - 0.1);
  const plate = new THREE.ExtrudeGeometry(knee, { depth: 0.24, bevelEnabled: false });
  plate.rotateY(-Math.PI / 2);
  plate.translate(0.12, 0, 0);
  batch.add(HULL_WOOD, plate, identity);
  // Lisses de la poulaine, de l'avant du château vers la pointe, en remontant.
  const tip = new THREE.Vector3(0, beak.y + beak.rise + 0.4, beak.tipZ - 0.5);
  for (const side of [1, -1]) {
    for (const h of [0.35, 0.8]) {
      const root = new THREE.Vector3(side * beak.halfWidth * 0.95, beak.y + h, beak.rootZ);
      batch.add(p.wood, cylinderBetween(root, tip.clone().setY(tip.y + h - 0.4), 0.05), identity);
      batch.add(p.wood, cylinderBetween(root, root.clone().setY(beak.y), 0.05), identity);
    }
  }
  // Lion de proue : la tête au bout de la poulaine, le corps couché le long d'elle.
  batch.add(GILT, new THREE.IcosahedronGeometry(0.38, 0), tf(0, beak.y + beak.rise + 0.3, beak.tipZ + 0.05));
  batch.add(GILT, box(0.42, 0.5, 1.1), tf(0, beak.y + beak.rise - 0.05, beak.tipZ - 0.55, -0.35));
  // Bossoirs de part et d'autre du château avant.
  const cat = L.station(forecastle.to - 0.02);
  for (const side of [1, -1]) batch.add(p.wood, box(1, 0.2, 0.2), tf(side * (hull.halfWidthAt(cat, forecastle.y + 0.4) + 0.25), forecastle.y + 0.4, cat.z));
  const { base, tip: spritTip } = L.bowsprit;
  batch.add(p.wood, cylinderBetween(base.clone().add(new THREE.Vector3(0, -0.4, -1.4)), spritTip, 0.26, 0.11), identity);
  const sprit = L.spritsail;
  batch.add(p.wood, cylinderBetween(sprit.yard.clone().setX(-sprit.width / 2 - 0.2), sprit.yard.clone().setX(sprit.width / 2 + 0.2), 0.08), identity);
}
