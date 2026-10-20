import * as THREE from 'three';
import { DECK_NAV } from '../config';
import type { DeckPlan } from '../ship/deckPlan';
import type { ShipModel } from '../ship/shipModel';
import { waterMaskMaterial } from '../ship/parts/common';
import { ladderRun } from '../ship/parts/deckFittings';
import { collectTriangles, DeckGrid, LEVELS, LINKS, LINKS_PER_DIR, rasterize } from './deckGrid';
import { DeckPaths } from './deckPath';
import { findShrouds, type Shroud } from './shrouds';

/** 8 voisins d'une case : décalages (i, j), les 4 premiers orthogonaux (+x, -x, +z, -z). */
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];

/** Un bord du pont où l'on peut s'accouder : son nœud et le côté vers le large. */
export interface RailSpot {
  node: number;
  side: 1 | -1;
}

/**
 * Où l'équipage peut marcher sur un navire : grille tirée de la géométrie du modèle (ponts, marches des escaliers,
 * dessus des châteaux ; mâts, cloisons, écoutilles et plafonds bas la coupent), reliée de proche en proche (une marche
 * au plus `stepMax` plus haute), réduite aux parties reliées aux postes du plan de pont. Calculée une fois par plan.
 */
export class DeckNav {
  readonly grid: DeckGrid;
  /** Voisins de chaque nœud (LINKS par nœud : deux par direction, -1 = rien), seulement entre nœuds libres. */
  readonly links: Int32Array;
  /** Composante (partie du pont d'un seul tenant) de chaque nœud praticable, -1 sinon. */
  readonly part: Int32Array;
  /** Nœud au bord d'un obstacle ou du pavois (on l'évite un peu en marchant). */
  readonly edge: Uint8Array;
  /** Nœuds praticables, par composante. */
  readonly nodes: number[][] = [];
  readonly rails: RailSpot[] = [];
  /** Échelles : chaque bout mène à l'autre (on y grimpe). */
  readonly ladders = new Map<number, number>();
  readonly shrouds: Shroud[];
  readonly paths: DeckPaths;

  constructor(model: ShipModel, plan: DeckPlan) {
    const cannons = new Set(model.cannons.map((m) => m.object));
    const tris = collectTriangles(model.root, (mesh) => skipMesh(mesh, cannons));
    const box = new THREE.Box3();
    for (let i = 0; i < tris.length; i += 3) box.expandByPoint(new THREE.Vector3(tris[i], tris[i + 1], tris[i + 2]));
    const cell = DECK_NAV.cell;
    const grid = new DeckGrid(box.min.x - cell, box.min.z - cell, Math.ceil((box.max.x - box.min.x) / cell) + 2, Math.ceil((box.max.z - box.min.z) / cell) + 2);
    // Les ponts sont entre le plus bas et le plus haut des postes du plan (avec de la marge : châteaux, marches).
    const ys = [plan.helm.y, ...plan.ropes.map((r) => r.y), ...plan.walks.map((w) => w.y), ...(plan.ladders ?? []).flatMap((l) => [l.from, l.to])];
    rasterize(grid, tris, Math.min(...ys) - DECK_NAV.deckMargin, Math.max(...ys) + DECK_NAV.deckMargin);
    this.grid = grid;
    const total = grid.nx * grid.nz * LEVELS;
    this.links = new Int32Array(total * LINKS).fill(-1);
    this.part = new Int32Array(total).fill(-1);
    this.edge = new Uint8Array(total);
    this.link();
    for (const l of plan.ladders ?? []) {
      const foot = this.nearestFree(l.x, l.from, l.z + l.facing * (ladderRun(l.to - l.from) + DECK_NAV.ladderStand));
      const head = this.nearestFree(l.x, l.to, l.z - l.facing * DECK_NAV.ladderStand);
      if (foot < 0 || head < 0) continue;
      this.ladders.set(foot, head);
      this.ladders.set(head, foot);
    }
    const seeds = [plan.helm, ...plan.ropes, ...plan.walks.flatMap((w) => [{ x: w.ax, y: w.y, z: w.az }, { x: w.bx, y: w.y, z: w.bz }, { x: (w.ax + w.bx) / 2, y: w.y, z: (w.az + w.bz) / 2 }])];
    for (const s of seeds) this.flood(this.nearestFree(s.x, s.y, s.z));
    this.findEdges();
    this.shrouds = findShrouds(model.root, this);
    this.paths = new DeckPaths(this);
  }

  // ——— Lecture de la grille ———

  x(node: number) {
    return this.grid.centerX(Math.floor(node / LEVELS) % this.grid.nx);
  }

  z(node: number) {
    return this.grid.centerZ(Math.floor(Math.floor(node / LEVELS) / this.grid.nx));
  }

  y(node: number) {
    return this.grid.heights[node];
  }

  walkable(node: number) {
    return node >= 0 && this.part[node] >= 0;
  }

  /** Nœud praticable de la case (x, z) au plus près de la hauteur y (à `reach` m près), ou -1. */
  nodeAt(x: number, z: number, y: number, reach = DECK_NAV.stepMax): number {
    const i = this.grid.cellX(x);
    const j = this.grid.cellZ(z);
    if (i < 0 || j < 0 || i >= this.grid.nx || j >= this.grid.nz) return -1;
    return this.levelNear(j * this.grid.nx + i, y, reach, true);
  }

  /**
   * Hauteur du sol sous (x, z), au plus près de y : surface praticable de préférence, sinon une case gênée (le marin
   * peut y déborder un peu) ; y lui-même s'il n'y a rien dessous.
   */
  groundAt(x: number, z: number, y: number): number {
    const i = this.grid.cellX(x);
    const j = this.grid.cellZ(z);
    if (i < 0 || j < 0 || i >= this.grid.nx || j >= this.grid.nz) return y;
    const cell = j * this.grid.nx + i;
    // D'abord une surface praticable (la marche, pas le pont pris sous l'escalier), sinon n'importe laquelle.
    const node = this.levelNear(cell, y, DECK_NAV.stepMax, true);
    const any = node >= 0 ? node : this.levelNear(cell, y, DECK_NAV.stepMax, false);
    return any >= 0 ? this.grid.heights[any] : y;
  }

  /** Le nœud praticable le plus proche du point (même composante qu'importe), cherché dans un petit rayon. */
  nearestWalkable(x: number, y: number, z: number): number {
    return this.search(x, y, z, (node) => this.walkable(node));
  }

  private nearestFree(x: number, y: number, z: number): number {
    return this.search(x, y, z, (node) => !this.grid.blocked[node]);
  }

  private search(x: number, y: number, z: number, ok: (node: number) => boolean): number {
    const ci = this.grid.cellX(x);
    const cj = this.grid.cellZ(z);
    let best = -1;
    let bestScore = Infinity;
    const r = DECK_NAV.snapCells;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.grid.nx || j >= this.grid.nz) continue;
        const cell = j * this.grid.nx + i;
        for (let k = 0; k < this.grid.counts[cell]; k++) {
          const node = cell * LEVELS + k;
          if (!ok(node)) continue;
          const dy = Math.abs(this.grid.heights[node] - y);
          if (dy > DECK_NAV.snapHeight) continue;
          const score = Math.hypot(this.grid.centerX(i) - x, this.grid.centerZ(j) - z) + dy * 2;
          if (score < bestScore) {
            bestScore = score;
            best = node;
          }
        }
      }
    }
    return best;
  }

  private levelNear(cell: number, y: number, reach: number, needWalkable: boolean): number {
    let best = -1;
    let bestDy = reach;
    for (let k = 0; k < this.grid.counts[cell]; k++) {
      const node = cell * LEVELS + k;
      if (needWalkable && !this.walkable(node)) continue;
      const dy = Math.abs(this.grid.heights[node] - y);
      if (dy <= bestDy) {
        bestDy = dy;
        best = node;
      }
    }
    return best;
  }

  // ——— Construction ———

  /**
   * Relie chaque nœud libre aux nœuds libres des cases voisines dont la hauteur est proche (une marche au plus : au
   * pied d'un escalier, le pont et la première marche sont tous deux voisins). Diagonale seulement si les deux cases
   * qu'elle frôle passent aussi.
   */
  private link() {
    const { nx, nz, counts, heights, blocked } = this.grid;
    const free = (cell: number, h: number, k: number) => !blocked[cell * LEVELS + k] && Math.abs(heights[cell * LEVELS + k] - h) <= DECK_NAV.stepMax;
    const cellOf = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i);
    const passes = (cell: number, h1: number, h2: number) => {
      if (cell < 0) return false;
      for (let k = 0; k < counts[cell]; k++) if (free(cell, h1, k) && free(cell, h2, k)) return true;
      return false;
    };
    for (let cell = 0; cell < nx * nz; cell++) {
      const i = cell % nx;
      const j = Math.floor(cell / nx);
      for (let k = 0; k < counts[cell]; k++) {
        const node = cell * LEVELS + k;
        if (blocked[node]) continue;
        const h = heights[node];
        for (let d = 0; d < 8; d++) {
          const other = cellOf(i + DI[d], j + DJ[d]);
          if (other < 0) continue;
          let slot = 0;
          for (let k2 = 0; k2 < counts[other] && slot < LINKS_PER_DIR; k2++) {
            if (!free(other, h, k2)) continue;
            const h2 = heights[other * LEVELS + k2];
            if (d >= 4 && !(passes(cellOf(i + DI[d], j), h, h2) && passes(cellOf(i, j + DJ[d]), h, h2))) continue;
            this.links[node * LINKS + d * LINKS_PER_DIR + slot++] = other * LEVELS + k2;
          }
        }
      }
    }
  }

  /** Marque la partie du pont reliée à `start` (s'il n'en a pas déjà une). */
  private flood(start: number) {
    if (start < 0 || this.part[start] >= 0) return;
    const id = this.nodes.length;
    const list: number[] = [start];
    this.part[start] = id;
    for (let q = 0; q < list.length; q++) {
      const node = list[q];
      for (let l = 0; l <= LINKS; l++) {
        const n = l < LINKS ? this.links[node * LINKS + l] : (this.ladders.get(node) ?? -1);
        if (n >= 0 && this.part[n] < 0) {
          this.part[n] = id;
          list.push(n);
        }
      }
    }
    // Un îlot minuscule (dessus d'un tonneau, d'un affût) n'est pas un pont.
    if (list.length < DECK_NAV.minPart) {
      for (const n of list) this.part[n] = -1;
      return;
    }
    this.nodes.push(list);
  }

  /** Bords : nœuds à qui manque un voisin ; ceux du côté du large deviennent des places où s'accouder. */
  private findEdges() {
    let widest = 0;
    for (const list of this.nodes) for (const n of list) widest = Math.max(widest, Math.abs(this.x(n)));
    for (const list of this.nodes) {
      for (const n of list) {
        let open = 0;
        for (let d = 0; d < 8; d++) if (this.links[n * LINKS + d * LINKS_PER_DIR] >= 0) open++;
        if (open < 8) this.edge[n] = 1;
        const x = this.x(n);
        const side = x > 0 ? 1 : -1;
        const outward = this.links[n * LINKS + (side > 0 ? 0 : 1) * LINKS_PER_DIR];
        if (outward < 0 && Math.abs(x) > widest * DECK_NAV.railShare) this.rails.push({ node: n, side });
      }
    }
  }
}

/** Ce qui n'est pas du bois où l'on bute : voiles, pavillons, masque d'eau, canons (gérés à part, ils changent). */
function skipMesh(mesh: THREE.Mesh, cannons: Set<THREE.Object3D>): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.some((m) => m === waterMaskMaterial || m.userData.sail || m.userData.flag || !m.visible)) return true;
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) if (cannons.has(o)) return true;
  return false;
}

const cache = new WeakMap<DeckPlan, DeckNav>();

/** La navigation de ce plan est-elle déjà calculée ? */
export const hasDeckNav = (plan: DeckPlan) => cache.has(plan);

/** La navigation du pont d'un plan (calculée au premier équipage qui l'occupe). */
export function deckNavOf(model: ShipModel, plan: DeckPlan): DeckNav {
  let nav = cache.get(plan);
  if (!nav) cache.set(plan, (nav = new DeckNav(model, plan)));
  return nav;
}
