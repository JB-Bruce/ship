import * as THREE from 'three';
import { DECK_NAV } from '../config';
import { DeckGrid, LEVELS, rasterize, type ModelTriangles } from './deckGrid';
import type { Shroud } from './shrouds';

const T = DECK_NAV.top;

/** Une place où se tenir dans une hune (repère du modèle), avec son regard. */
export interface TopSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
}

/**
 * La montée d'un hauban jusqu'à la hune (repère du modèle) : du pied du hauban jusque sous la hune, puis par les
 * gambes (vers le bord) jusque sur le plancher.
 */
export interface TopRoute {
  readonly shroud: Shroud;
  readonly points: readonly THREE.Vector3[];
}

/**
 * Une hune : la plate-forme en haut d'un bas-mât, où l'on monte par les haubans. Son plancher est lu dans la géométrie
 * du modèle (petite grille fine autour du mât, comme celle du pont) : toute la plate-forme, et ses cases libres, où
 * l'on tient debout (hors du mât et de ce qui gêne au-dessus : une vergue à hauteur de poitrine).
 */
export class MastTop {
  readonly spots: TopSpot[] = [];
  readonly routes: TopRoute[] = [];

  constructor(
    private readonly grid: DeckGrid,
    /** Hauteur de la plate-forme dans chaque case (NaN = dehors), et si l'on peut s'y tenir. */
    private readonly floor: Float32Array,
    private readonly free: Uint8Array,
    /** Centre de la plate-forme, sa hauteur moyenne et son rayon (m). */
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly radius: number,
    /** Hauteur de la tête des haubans de son mât (le plus grand mât porte le nid de pie). */
    readonly mastHead: number,
  ) {}

  private cellAt(x: number, z: number): number {
    const i = this.grid.cellX(x);
    const j = this.grid.cellZ(z);
    return i < 0 || j < 0 || i >= this.grid.nx || j >= this.grid.nz ? -1 : j * this.grid.nx + i;
  }

  /** Hauteur de la plate-forme sous (x, z) (libre ou non : le mât la traverse), NaN hors de la hune. */
  platformAt(x: number, z: number): number {
    const cell = this.cellAt(x, z);
    return cell < 0 ? NaN : this.floor[cell];
  }

  /** Hauteur du plancher libre sous (x, z), ou -Infinity (hors de la hune, mât, sous une vergue). */
  ground(x: number, z: number): number {
    const cell = this.cellAt(x, z);
    return cell >= 0 && this.free[cell] ? this.floor[cell] : -Infinity;
  }

  /** Le point du plancher libre le plus proche de (x, z) (centre d'une case), écrit dans `out`. */
  nearest(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    let best = Infinity;
    const { nx, nz } = this.grid;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!this.free[j * nx + i]) continue;
        const cx = this.grid.centerX(i);
        const cz = this.grid.centerZ(j);
        const d = Math.hypot(cx - x, cz - z);
        if (d < best) {
          best = d;
          out.set(cx, this.floor[j * nx + i], cz);
        }
      }
    }
    return out;
  }
}

/** Les hunes d'un navire : une au plus par mât dont les haubans sont connus, au moins `T.minAbove` au-dessus du pont. */
export function findTops(triangles: ModelTriangles, shrouds: readonly Shroud[], deckTop: number): MastTop[] {
  // Les haubans d'un même mât (les deux bords) montent vers la même tête.
  const masts: Shroud[][] = [];
  for (const h of shrouds) {
    const group = masts.find((g) => Math.abs(g[0].head.z - h.head.z) < T.sameMast);
    if (group) group.push(h);
    else masts.push([h]);
  }
  if (!masts.length) return [];
  // Seuls comptent les triangles près de l'axe et au-dessus des ponts (mâts, hunes, vergues) : la coque est sautée.
  const head = Math.max(...shrouds.map((h) => h.head.y));
  const near = nearMasts(triangles, deckTop + T.minAbove, head + T.above + T.headroom);
  const tops: MastTop[] = [];
  for (const group of masts) {
    const top = findTop(near, group, deckTop);
    if (top) tops.push(top);
  }
  return tops;
}

/** Les triangles qui touchent la bande |x| ≤ T.reach entre les hauteurs `low` et `high`. */
function nearMasts({ tris, soft }: ModelTriangles, low: number, high: number): ModelTriangles {
  const keep: number[] = [];
  const keepSoft: number[] = [];
  for (let t = 0; t < tris.length; t += 9) {
    const [x0, y0, x1, y1, x2, y2] = [tris[t], tris[t + 1], tris[t + 3], tris[t + 4], tris[t + 6], tris[t + 7]];
    if (Math.min(x0, x1, x2) > T.reach || Math.max(x0, x1, x2) < -T.reach || Math.max(y0, y1, y2) < low || Math.min(y0, y1, y2) > high) continue;
    for (let k = 0; k < 9; k++) keep.push(tris[t + k]);
    keepSoft.push(soft[t / 9]);
  }
  return { tris: Float32Array.from(keep), soft: Uint8Array.from(keepSoft) };
}

function findTop(triangles: ModelTriangles, shrouds: readonly Shroud[], deckTop: number): MastTop | null {
  const head = Math.max(...shrouds.map((h) => h.head.y));
  const z = shrouds.reduce((sum, h) => sum + h.head.z, 0) / shrouds.length;
  const halfZ = T.reach + T.rake;
  const grid = new DeckGrid(-T.reach, z - halfZ, Math.ceil((2 * T.reach) / T.cell), Math.ceil((2 * halfZ) / T.cell), T.cell);
  rasterize(grid, triangles, deckTop + T.minAbove, head + T.above, T.headroom);
  // Le plus grand plancher libre d'un seul tenant, puis toute la plate-forme qui le porte (sous le mât, sous une vergue).
  let floor: number[] = [];
  const seen = new Uint8Array(grid.nx * grid.nz * LEVELS);
  for (let node = 0; node < seen.length; node++) {
    if (seen[node] || node % LEVELS >= grid.counts[Math.floor(node / LEVELS)] || grid.blocked[node]) continue;
    const part = flood(grid, [node], seen, (n) => !grid.blocked[n]);
    if (part.length > floor.length) floor = part;
  }
  if (floor.length * T.cell * T.cell < T.minArea) return null;
  const platform = flood(grid, floor, new Uint8Array(seen.length), () => true);

  const heights = new Float32Array(grid.nx * grid.nz).fill(NaN);
  const free = new Uint8Array(grid.nx * grid.nz);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const node of platform) {
    const cell = Math.floor(node / LEVELS);
    heights[cell] = grid.heights[node];
    free[cell] = grid.blocked[node] ? 0 : 1;
    cx += grid.centerX(cell % grid.nx);
    cy += grid.heights[node];
    cz += grid.centerZ(Math.floor(cell / grid.nx));
  }
  cx /= platform.length;
  cy /= platform.length;
  cz /= platform.length;
  let radius = 0;
  for (const node of platform) {
    const cell = Math.floor(node / LEVELS);
    radius = Math.max(radius, Math.hypot(grid.centerX(cell % grid.nx) - cx, grid.centerZ(Math.floor(cell / grid.nx)) - cz) + T.cell / 2);
  }
  const top = new MastTop(grid, heights, free, cx, cy, cz, radius, head);
  addSpots(top);
  addRoutes(top, shrouds);
  return top.spots.length && top.routes.length ? top : null;
}

/**
 * Les surfaces reliées aux nœuds de départ (voisines, à une marche près) qu'accepte `ok` ; `seen` marque celles
 * déjà prises.
 */
function flood(grid: DeckGrid, starts: readonly number[], seen: Uint8Array, ok: (node: number) => boolean): number[] {
  const { nx, nz, counts, heights } = grid;
  const list = [...starts];
  for (const n of list) seen[n] = 1;
  for (let q = 0; q < list.length; q++) {
    const node = list[q];
    const c = Math.floor(node / LEVELS);
    const i = c % nx;
    const j = Math.floor(c / nx);
    for (const [di, dj] of NEIGHBORS) {
      if (i + di < 0 || j + dj < 0 || i + di >= nx || j + dj >= nz) continue;
      const other = (j + dj) * nx + i + di;
      for (let k = 0; k < counts[other]; k++) {
        const n = other * LEVELS + k;
        if (seen[n] || !ok(n) || Math.abs(heights[n] - heights[node]) > DECK_NAV.merge) continue;
        seen[n] = 1;
        list.push(n);
      }
    }
  }
  return list;
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Places où se tenir : dans les directions de T.spots (derrière le mât, loin des voiles), vers le bord du plancher
 * (au milieu de l'anneau entre le mât et le bord, s'il est étroit).
 */
function addSpots(top: MastTop) {
  for (const { angle, facing } of T.spots) {
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    // Du plancher dans cette direction : du plus près au plus loin du mât.
    let inner = -1;
    let outer = -1;
    for (let r = 0; r <= top.radius + T.cell; r += T.cell / 2) {
      if (top.ground(top.x + sx * r, top.z + sz * r) === -Infinity) continue;
      if (inner < 0) inner = r;
      outer = r;
    }
    if (inner < 0) continue;
    const r = Math.max((inner + outer) / 2, outer - T.spotInset);
    const x = top.x + sx * r;
    const z = top.z + sz * r;
    const y = top.ground(x, z);
    if (y !== -Infinity) top.spots.push({ x, y, z, facing });
  }
}

/** La montée de chaque hauban : jusque sous le plancher, puis vers le bord de la hune de son côté. */
function addRoutes(top: MastTop, shrouds: readonly Shroud[]) {
  const rim = new THREE.Vector3();
  for (const shroud of shrouds) {
    const { foot, head } = shroud;
    const t = (top.y - T.futtockDrop - foot.y) / (head.y - foot.y);
    if (t <= 0 || t > 1) continue;
    const below = foot.clone().lerp(head, t);
    const dx = below.x - top.x;
    const dz = below.z - top.z;
    const d = Math.hypot(dx, dz) || 1;
    const out = Math.max(0, top.radius - T.rimInset);
    top.nearest(top.x + (dx / d) * out, top.z + (dz / d) * out, rim);
    top.routes.push({ shroud, points: [foot.clone().setY(foot.y + T.footLift), below, rim.clone()] });
  }
}
