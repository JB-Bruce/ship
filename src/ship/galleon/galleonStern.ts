import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addLantern, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DARK_WOOD, GILT } from './galleonDecor';
import { WALES, type GalleonLayout } from './galleonLayout';

/**
 * Galeries de poupe : elles partent des hanches (`from`, u de base) et suivent le contour arrondi de la poupe par ces
 * sections ; saillie (m). L'étage bas fait le tour de la poupe, fermé ; à l'étage haut, des galeries fermées à dôme sur
 * les hanches, et entre elles, sur l'arrière, un balcon ouvert à balustrade dorée.
 */
const GALLERY = { sections: [-0.86, -0.92, -0.96, -0.985, -1], depth: 0.75, low: [7.7, 9.4], high: [9.55, 11.35] as const };
/** Balcon : hauteur de la balustrade, écart des balustres (m). */
const BALCONY = { height: 0.78, spacing: 0.36 };
/** Fenêtres du tableau, derrière le balcon : hauteur du centre, places (part de la demi-largeur). */
const STERN_WINDOWS = { y: 10.65, xs: [-0.62, 0, 0.62] };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const identity = new THREE.Matrix4();

/** Un pan du contour de la poupe : ses deux bouts sur le bordé, sa direction (cap) et sa normale vers l'extérieur. */
interface Panel {
  a: THREE.Vector3;
  b: THREE.Vector3;
  yaw: number;
  out: THREE.Vector3;
  length: number;
}

/** Contour de la poupe vu de dessus à la hauteur y : de la hanche bâbord au tableau, puis à la hanche tribord. */
function sternPanels(L: GalleonLayout, y: number): Panel[] {
  const port = GALLERY.sections.map((u) => {
    const s = L.at(u);
    return new THREE.Vector3(L.hull.halfWidthAt(s, y), y, s.z);
  });
  const points = [...port, ...[...port].reverse().map((v) => new THREE.Vector3(-v.x, y, v.z))];
  const panels: Panel[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const length = a.distanceTo(b);
    if (length < 0.05) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    panels.push({ a, b, yaw: Math.atan2(dx, dz), out: new THREE.Vector3(-dz, 0, dx).normalize(), length });
  }
  return panels;
}

/** Point d'un pan à `t` de sa longueur, décalé de `d` vers l'extérieur, à la hauteur y. */
const onPanel = (p: Panel, t: number, d: number, y: number) => p.a.clone().lerp(p.b, t).addScaledVector(p.out, d).setY(y);

/** Un caisson de galerie fermé sur un pan, de `low` à `high` : fenêtres, dalles dorées dessus et dessous. */
function galleryBox(batch: GeometryBatch, p: Palette, panel: Panel, low: number, high: number) {
  const h = high - low;
  const y = (low + high) / 2;
  const centre = onPanel(panel, 0.5, GALLERY.depth / 2 - 0.15, y);
  // Un peu plus long que le pan : les caissons voisins se rejoignent aux angles.
  batch.add(p.hull, box(GALLERY.depth, h, panel.length + 0.3), tf(centre.x, y, centre.z, 0, panel.yaw));
  for (const dy of [-h / 2, h / 2]) {
    const slab = onPanel(panel, 0.5, GALLERY.depth / 2 - 0.1, y + dy);
    batch.add(GILT, box(GALLERY.depth + 0.12, 0.12, panel.length + 0.4), tf(slab.x, slab.y, slab.z, 0, panel.yaw));
  }
  const count = Math.max(1, Math.floor(panel.length / 0.7));
  for (let k = 0; k < count; k++) {
    const w = onPanel(panel, (k + 0.5) / count, GALLERY.depth - 0.13, y);
    batch.add(p.window, box(0.05, h * 0.5, Math.min(0.42, panel.length / count - 0.12)), tf(w.x, w.y, w.z, 0, panel.yaw));
  }
}

/**
 * Poupe très haute, arrondie vue de dessus : galeries (voir GALLERY), dômes aux couleurs du camp sur les galeries des
 * hanches, balcon doré ; sur le tableau, hauts peints, fenêtres entre des pilastres dorés, écusson couronné, préceintes
 * en travers ; sur le couronnement, trois grands fanaux et deux statues dorées aux angles.
 */
export function addStern(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const z = stern.z - 0.02;
  const width = (y: number) => 2 * hull.halfWidthAt(stern, y);

  // Étage bas : la galerie fait le tour de la poupe.
  for (const panel of sternPanels(L, (GALLERY.low[0] + GALLERY.low[1]) / 2)) galleryBox(batch, p, panel, GALLERY.low[0], GALLERY.low[1]);

  // Étage haut : galeries fermées sur les hanches, coiffées d'un dôme ; balcon ouvert sur l'arrière.
  const [low, high] = GALLERY.high;
  const upper = sternPanels(L, (low + high) / 2);
  const rail: THREE.Vector3[][] = [[]];
  for (const panel of upper) {
    const side = Math.abs(panel.out.x) > 0.75;
    if (side) {
      galleryBox(batch, p, panel, low, high);
      if (rail[rail.length - 1].length) rail.push([]);
      continue;
    }
    const n = Math.max(1, Math.round(panel.length / BALCONY.spacing));
    // Le premier balustre d'un pan est le dernier du pan précédent, s'il y en a un.
    for (let k = rail[rail.length - 1].length ? 1 : 0; k <= n; k++) {
      const foot = onPanel(panel, k / n, GALLERY.depth - 0.1, low - 0.15);
      batch.add(GILT, box(0.06, BALCONY.height, 0.06), tf(foot.x, foot.y + BALCONY.height / 2, foot.z));
      rail[rail.length - 1].push(foot.setY(foot.y + BALCONY.height));
    }
  }
  for (const run of rail) for (let i = 0; i < run.length - 1; i++) batch.add(GILT, cylinderBetween(run[i], run[i + 1], 0.045), identity);
  for (const side of [1, -1]) {
    const hips = upper.filter((panel) => Math.abs(panel.out.x) > 0.75 && Math.sign(panel.out.x) === side);
    const centre = hips.reduce((sum, panel) => sum.add(onPanel(panel, 0.5, GALLERY.depth / 2 - 0.1, high + 0.06)), new THREE.Vector3()).divideScalar(hips.length);
    const length = hips.reduce((sum, panel) => sum + panel.length, 0);
    const dome = new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(GALLERY.depth * 1.3, 1, Math.min(length * 0.9, 1.4) * 2);
    batch.add(p.hull, dome, tf(centre.x, centre.y, centre.z, 0, hips[0].yaw));
    batch.add(GILT, new THREE.SphereGeometry(0.13, 6, 4), tf(centre.x, centre.y + 0.55, centre.z));
  }

  // Tableau : hauts peints, fenêtres entre des pilastres dorés, écusson couronné, préceintes.
  const top = WALES[0];
  const from = top.y + top.sheer * L.sheer(-1) + top.height / 2;
  const to = stern.gunwale - 0.1;
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const [a, b] = [from + ((to - from) * i) / rows, from + ((to - from) * (i + 1)) / rows];
    batch.add(p.hull, box(width((a + b) / 2) - 0.04, b - a, 0.03), tf(0, (a + b) / 2, z));
  }
  const half = hull.halfWidthAt(stern, STERN_WINDOWS.y);
  for (const x of STERN_WINDOWS.xs) {
    batch.add(GILT, box(0.5, 0.6, 0.04), tf(x * half, STERN_WINDOWS.y, z - 0.02));
    batch.add(p.window, box(0.36, 0.46, 0.05), tf(x * half, STERN_WINDOWS.y, z - 0.035));
  }
  for (const x of [-0.95, -0.31, 0.31, 0.95]) batch.add(GILT, box(0.1, 1.35, 0.07), tf(x * half, STERN_WINDOWS.y + 0.05, z - 0.03));
  for (const dy of [-0.55, 0.62]) batch.add(GILT, box(width(STERN_WINDOWS.y + dy) - 0.06, 0.09, 0.06), tf(0, STERN_WINDOWS.y + dy, z - 0.02));
  const crestY = stern.gunwale - 0.75;
  batch.add(GILT, box(0.9, 0.7, 0.07), tf(0, crestY, z - 0.04));
  batch.add(p.hull, box(0.6, 0.45, 0.04), tf(0, crestY - 0.02, z - 0.08));
  batch.add(GILT, new THREE.CylinderGeometry(0.3, 0.24, 0.22, 8), tf(0, crestY + 0.48, z - 0.06));
  for (const w of WALES) {
    const y = w.y + w.sheer * L.sheer(-1);
    batch.add(DARK_WOOD, box(width(y), w.height, 0.06), tf(0, y, z - 0.01));
  }

  // Couronnement : lisse, trois fanaux (celui du milieu plus grand), deux statues dorées aux angles.
  batch.add(p.trim, box(width(stern.gunwale) + 0.14, 0.16, 0.26), tf(0, stern.gunwale, stern.z + 0.08));
  for (const x of [-0.7, 0, 0.7]) addLantern(batch, p, tf(x, stern.gunwale + 0.08, stern.z + 0.25, 0, 0, 0, x === 0 ? 1.35 : 0.85));
  const corner = hull.halfWidthAt(stern, stern.gunwale) - 0.12;
  for (const side of [1, -1]) addStatue(batch, new THREE.Vector3(side * corner, stern.gunwale + 0.08, stern.z + 0.18), side);
}

/** Statue dorée debout sur le couronnement : socle, corps, tête, un bras levé vers l'extérieur. */
function addStatue(batch: GeometryBatch, at: THREE.Vector3, side: number) {
  batch.add(GILT, box(0.32, 0.2, 0.32), tf(at.x, at.y + 0.1, at.z));
  batch.add(GILT, new THREE.CylinderGeometry(0.12, 0.18, 0.85, 6), tf(at.x, at.y + 0.62, at.z));
  batch.add(GILT, new THREE.IcosahedronGeometry(0.14, 0), tf(at.x, at.y + 1.17, at.z));
  batch.add(GILT, cylinderBetween(new THREE.Vector3(at.x, at.y + 0.92, at.z), new THREE.Vector3(at.x + side * 0.28, at.y + 1.35, at.z), 0.045, 0.04, 4), identity);
}
