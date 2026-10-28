import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addLantern, type Palette } from '../parts/props';
import { DARK_WOOD, GILT } from '../galleon/galleonDecor';
import { DECK_Y, type ShipOfLineLayout } from './shipOfLineLayout';

/**
 * Deux galeries ouvertes sur le tableau arrière : leur plancher (au niveau du pont du milieu, puis du gaillard
 * d'arrière), leur saillie, la hauteur de la balustrade et l'écart des balustres (m) ; fenêtres de la chambre derrière.
 */
const GALLERIES = { depth: 0.9, rail: 0.8, spacing: 0.32, windowY: 0.75, windows: 6 };
/**
 * Bouteilles : galeries fermées sur les hanches (étendue en u de base, saillie hors du bordé, bas et haut en m), avec
 * leur cul-de-lampe dessous et leur petit dôme dessus.
 */
const QUARTER = { from: -0.96, to: -0.86, depth: 0.7, low: DECK_Y - 0.1, high: 8.5 };
/** Grands fanaux sur le couronnement (places en part de la demi-largeur, taille). */
const LANTERNS = { xs: [-0.62, 0, 0.62], scale: 1.35 };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * Poupe plate : deux galeries ouvertes à balustres dorés devant les fenêtres de la chambre, pilastres dorés entre
 * elles ; bouteilles fermées sur les hanches ; couronnement doré, écusson et trois grands fanaux.
 */
export function addStern(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout) {
  const { hull } = L;
  const stern = hull.stationAt(-1);
  const width = (y: number) => 2 * hull.halfWidthAt(stern, y);
  for (const floor of [DECK_Y, L.quarterdeck.y]) {
    const w = width(floor + 0.5) - 0.3;
    const z = stern.z - GALLERIES.depth / 2;
    batch.add(DARK_WOOD, box(w + 0.2, 0.14, GALLERIES.depth), tf(0, floor, z));
    const railZ = stern.z - GALLERIES.depth + 0.05;
    batch.add(GILT, box(w + 0.2, 0.08, 0.1), tf(0, floor + GALLERIES.rail, railZ));
    for (let x = -w / 2; x <= w / 2 + 0.01; x += GALLERIES.spacing) batch.add(GILT, box(0.06, GALLERIES.rail, 0.06), tf(x, floor + GALLERIES.rail / 2, railZ));
    for (const side of [1, -1]) batch.add(GILT, box(0.08, GALLERIES.rail, GALLERIES.depth), tf((side * (w + 0.2)) / 2, floor + GALLERIES.rail / 2, z));
    // Fenêtres de la chambre et pilastres dorés entre elles.
    const n = GALLERIES.windows;
    const y = floor + GALLERIES.windowY;
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + (w * (k + 0.5)) / n;
      batch.add(p.window, box(Math.min(0.5, w / n - 0.18), 0.6, 0.05), tf(x, y, stern.z - 0.03));
      batch.add(GILT, box(0.1, 1.05, 0.06), tf(-w / 2 + (w * k) / n, y, stern.z - 0.04));
    }
  }
  // Couronnement, écusson et fanaux.
  batch.add(GILT, box(2 * stern.halfWidth + 0.2, 0.18, 0.3), tf(0, stern.gunwale, stern.z + 0.06));
  batch.add(GILT, new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10), tf(0, stern.gunwale - 0.6, stern.z - 0.04, Math.PI / 2));
  for (const f of LANTERNS.xs) addLantern(batch, p, tf(f * stern.halfWidth, stern.gunwale + 0.09, stern.z + 0.1, 0, 0, 0, LANTERNS.scale));
  addQuarterGalleries(batch, p, L);
}

/** Bouteilles des deux hanches : caisson fermé à fenêtres, aux couleurs du camp, dalles dorées, cul-de-lampe et dôme. */
function addQuarterGalleries(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout) {
  const { hull } = L;
  const a = L.at(QUARTER.from);
  const b = L.at(QUARTER.to);
  const z = (a.z + b.z) / 2;
  const length = b.z - a.z;
  const h = QUARTER.high - QUARTER.low;
  const y = (QUARTER.low + QUARTER.high) / 2;
  const mid = L.at((QUARTER.from + QUARTER.to) / 2);
  for (const side of [1, -1]) {
    const x = side * (hull.halfWidthAt(mid, y) + QUARTER.depth / 2 - 0.15);
    batch.add(p.hull, box(QUARTER.depth, h, length), tf(x, y, z));
    for (const dy of [-h / 2, h / 2, 0]) batch.add(GILT, box(QUARTER.depth + 0.12, 0.12, length + 0.12), tf(x, y + dy, z));
    for (const wy of [y - h / 4, y + h / 4]) {
      for (const dz of [-length / 4, length / 4]) batch.add(p.window, box(0.05, 0.5, 0.4), tf(x + side * (QUARTER.depth / 2 + 0.01), wy, z + dz));
    }
    batch.add(GILT, new THREE.ConeGeometry(QUARTER.depth * 0.6, 1.1, 6), tf(x, QUARTER.low - 0.55, z, Math.PI));
    batch.add(p.hull, new THREE.SphereGeometry(QUARTER.depth * 0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), tf(x, QUARTER.high + 0.06, z));
  }
}
