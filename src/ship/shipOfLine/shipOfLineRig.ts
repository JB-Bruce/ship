import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Mast } from '../galleon/galleonLayout';
import type { Palette } from '../parts/props';
import type { ShipOfLineLayout } from './shipOfLineLayout';

/** Porte-haubans : planches qui débordent du bordé sous le plat-bord (dessous du plat-bord, largeur, débord, m). */
const CHANNEL = { below: 0.5, width: 0.6, overhang: 0.3 };
/** Pieds des haubans : derrière chaque mât, sur le plat-bord du pont qui le porte (m). */
const SHROUD_FEET = { first: 0.4, spacing: 0.7, count: 4, clearance: 0.45 };
/** Barres de perroquet : au-dessus de chaque hune, à cette hauteur (m) sous la tête du mât. */
const CROSSTREES = { below: 5.2, width: 2.6 };

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Les trois mâts avec leur rayon au pied et la demi-largeur de leur hune. */
const mastsOf = (L: ShipOfLineLayout): [Mast, number, number][] => [
  [L.foreMast, 0.32, 1.1],
  [L.mainMast, 0.42, 1.35],
  [L.mizzenMast, 0.25, 0.85],
];

/** Mâts : hunes plates en planches cerclées de sombre, barres de perroquet, chouques ; hampe du pavillon ; porte-haubans. */
export function addMasts(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout) {
  for (const [mast, radius, top] of mastsOf(L)) {
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.55, radius, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    batch.add(p.wood, box(2 * top, 0.16, 1.6 * top), tf(0, mast.topPlatform + 0.08, mast.z - 0.15));
    batch.add(p.dark, box(2 * top + 0.06, 0.1, 0.08), tf(0, mast.topPlatform + 0.2, mast.z - 0.15 + 0.8 * top));
    batch.add(p.wood, box(CROSSTREES.width * (top / 1.35), 0.12, 0.6), tf(0, mast.top - CROSSTREES.below, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
    addChannels(batch, p, L, shroudFeet(L, mast));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4), tf(0, L.mainMast.top + 0.75, L.mainMast.z));
}

/** Porte-haubans d'un mât, sur chaque bord : une planche qui suit le bordé, un peu au-delà des pieds de haubans. */
function addChannels(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout, feet: readonly number[]) {
  const { hull } = L;
  const zs = [feet[0] + CHANNEL.overhang, ...feet, feet[feet.length - 1] - CHANNEL.overhang];
  for (const side of [1, -1]) {
    const points = zs.map((z) => {
      const s = hull.stationAt(z / hull.halfLength);
      const y = s.gunwale - CHANNEL.below;
      return new THREE.Vector3(side * (hull.halfWidthAt(s, y) + CHANNEL.width / 2), y, z);
    });
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      const length = a.distanceTo(b) + 0.04;
      batch.add(p.wood, box(CHANNEL.width, 0.09, length), tf((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, Math.atan2(a.y - b.y, Math.hypot(b.x - a.x, b.z - a.z)), Math.atan2(b.x - a.x, b.z - a.z)));
    }
  }
}

/**
 * Haubans des trois mâts (sur les porte-haubans), galhaubans des têtes de mât, étais (artimon → grand mât → misaine →
 * beaupré, et du perroquet de misaine au mât de contre-civadière), étais des focs, sous-barbe vers l'éperon.
 */
export function buildRigging(L: ShipOfLineLayout): THREE.BufferGeometry {
  const { hull, bowsprit } = L;
  const head = (m: Mast) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const foreTop = new THREE.Vector3(0, L.foreMast.topPlatform + 0.4, L.foreMast.z);
  const points: THREE.Vector3[] = [
    foreTop, bowsprit.base.clone().lerp(bowsprit.tip, 0.5),
    head(L.foreMast), bowsprit.topmast.clone().setY(bowsprit.topmast.y - 0.2),
    head(L.mainMast), foreTop,
    new THREE.Vector3(0, L.mainMast.topPlatform + 0.4, L.mainMast.z), new THREE.Vector3(0, L.foreMast.base + 1.2, L.foreMast.z - 0.4),
    head(L.mizzenMast), new THREE.Vector3(0, L.mainMast.topPlatform - 1.5, L.mainMast.z),
    bowsprit.tip, new THREE.Vector3(0, L.beak.figurehead.y - 0.2, L.beak.figurehead.z - 0.4),
    ...L.jibs.flatMap((j) => [j.head, j.tack]),
  ];
  for (const side of [1, -1]) {
    for (const [mast] of mastsOf(L)) {
      const top = new THREE.Vector3(side * 0.7, mast.topPlatform, mast.z);
      const feet = shroudFeet(L, mast);
      for (const z of feet) {
        const s = hull.stationAt(z / hull.halfLength);
        const y = s.gunwale - CHANNEL.below;
        points.push(top, new THREE.Vector3(side * (hull.halfWidthAt(s, y) + CHANNEL.width * 0.9), y, s.z));
      }
      // Galhauban : de la tête du mât à l'arrière des porte-haubans.
      const back = hull.stationAt(feet[feet.length - 1] / hull.halfLength);
      const y = back.gunwale - CHANNEL.below;
      points.push(head(mast), new THREE.Vector3(side * (hull.halfWidthAt(back, y) + CHANNEL.width * 0.9), y, back.z - 0.5));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** z des pieds des haubans d'un mât, de l'avant vers l'arrière, sur le plat-bord du pont qui le porte (resserrés s'il est court). */
function shroudFeet(L: ShipOfLineLayout, mast: Mast): number[] {
  const z = (u: number) => L.station(u).z;
  const sections: [number, number][] = [
    [z(L.forecastle.from), z(1)],
    [z(L.quarterdeck.to), z(L.forecastle.from)],
    [z(L.poop.to), z(L.quarterdeck.to)],
    [z(-1), z(L.poop.to)],
  ];
  const [aft, fore] = sections.find(([a, f]) => mast.z > a && mast.z < f) ?? [z(-1), z(1)];
  const { first, spacing, count, clearance } = SHROUD_FEET;
  const start = Math.min(mast.z - first, fore - clearance);
  const room = start - (aft + clearance);
  const step = Math.min(spacing, room / (count - 1));
  return Array.from({ length: count }, (_, i) => start - step * i);
}
