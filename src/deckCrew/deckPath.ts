import { DECK_NAV } from '../config';
import { LEVELS, LINKS } from './deckGrid';
import type { DeckNav } from './deckNav';

/** Coût d'un pas vers chacun des 8 voisins (cases) : droit puis diagonale. */
const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

/**
 * Chemins sur le pont (A* sur la grille de DeckNav), puis raccourcis en lignes droites là où la vue est dégagée : le
 * marin coupe en diagonale au lieu de suivre les cases. Les nœuds de `avoid` (affûts des canons) sont contournés, et
 * les bords (pavois, mâts) un peu évités. Tableaux réutilisés d'une recherche à l'autre.
 */
export class DeckPaths {
  private readonly cost: Float32Array;
  private readonly from: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private stamp = 0;
  private readonly heap: number[] = [];
  private readonly heapCost: number[] = [];

  constructor(private readonly nav: DeckNav) {
    const total = nav.part.length;
    this.cost = new Float32Array(total);
    this.from = new Int32Array(total);
    this.seen = new Uint32Array(total);
    this.closed = new Uint32Array(total);
  }

  /** Nœuds de passage de `start` à `goal` (goal compris, start exclu), ou null s'il n'y a pas de chemin. */
  find(start: number, goal: number, avoid: Uint8Array | null): number[] | null {
    const nav = this.nav;
    if (start < 0 || goal < 0 || nav.part[start] !== nav.part[goal]) return null;
    if (start === goal) return [goal];
    const stamp = ++this.stamp;
    const gx = nav.x(goal);
    const gz = nav.z(goal);
    const h = (n: number) => Math.hypot(nav.x(n) - gx, nav.z(n) - gz) / DECK_NAV.cell;
    this.heap.length = 0;
    this.heapCost.length = 0;
    this.cost[start] = 0;
    this.seen[start] = stamp;
    this.from[start] = -1;
    this.push(start, h(start));
    let found = false;
    let expanded = 0;
    while (this.heap.length && expanded++ < DECK_NAV.maxExpand) {
      const node = this.pop();
      if (this.closed[node] === stamp) continue;
      this.closed[node] = stamp;
      if (node === goal) {
        found = true;
        break;
      }
      for (let l = 0; l <= LINKS; l++) {
        // Le dernier « voisin » : l'autre bout d'une échelle.
        const n = l < LINKS ? nav.links[node * LINKS + l] : (nav.ladders.get(node) ?? -1);
        if (n < 0 || this.closed[n] === stamp || (avoid && avoid[n] && n !== goal)) continue;
        const step = l < LINKS ? STEP[(l * 8) / LINKS | 0] : DECK_NAV.ladderCost;
        const c = this.cost[node] + step * (nav.edge[n] ? 1 + DECK_NAV.edgeCost : 1);
        if (this.seen[n] === stamp && c >= this.cost[n]) continue;
        this.seen[n] = stamp;
        this.cost[n] = c;
        this.from[n] = node;
        this.push(n, c + h(n));
      }
    }
    if (!found) return null;
    const raw: number[] = [];
    for (let n = goal; n !== start && n >= 0; n = this.from[n]) raw.push(n);
    raw.reverse();
    return this.smooth(start, raw, avoid);
  }

  /** Garde un nœud de passage seulement quand la ligne droite depuis le précédent ne passe plus. */
  private smooth(start: number, raw: number[], avoid: Uint8Array | null): number[] {
    const out: number[] = [];
    let anchor = start;
    for (let i = 0; i < raw.length; i++) {
      const next = raw[i + 1];
      if (next === undefined || !this.clear(anchor, next, avoid)) {
        out.push(raw[i]);
        anchor = raw[i];
      }
    }
    return out;
  }

  /** La ligne droite de a à b reste-t-elle sur le pont, loin des bords, sans marche trop haute ? */
  private clear(a: number, b: number, avoid: Uint8Array | null): boolean {
    const nav = this.nav;
    const ax = nav.x(a);
    const az = nav.z(a);
    const dx = nav.x(b) - ax;
    const dz = nav.z(b) - az;
    const steps = Math.ceil(Math.hypot(dx, dz) / (DECK_NAV.cell * 0.5));
    let y = nav.y(a);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const n = nav.nodeAt(ax + dx * t, az + dz * t, y);
      if (n < 0 || nav.edge[n] || (avoid && avoid[n]) || nav.part[n] !== nav.part[a]) return false;
      y = nav.y(n);
    }
    return true;
  }

  private push(node: number, priority: number) {
    const heap = this.heap;
    const costs = this.heapCost;
    let i = heap.length;
    heap.push(node);
    costs.push(priority);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (costs[parent] <= priority) break;
      heap[i] = heap[parent];
      costs[i] = costs[parent];
      i = parent;
    }
    heap[i] = node;
    costs[i] = priority;
  }

  private pop(): number {
    const heap = this.heap;
    const costs = this.heapCost;
    const top = heap[0];
    const last = heap.pop()!;
    const lastCost = costs.pop()!;
    if (heap.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= heap.length) break;
        const r = l + 1;
        const child = r < heap.length && costs[r] < costs[l] ? r : l;
        if (costs[child] >= lastCost) break;
        heap[i] = heap[child];
        costs[i] = costs[child];
        i = child;
      }
      heap[i] = last;
      costs[i] = lastCost;
    }
    return top;
  }
}

/** Nombre de nœuds de la grille (cases × niveaux), pour dimensionner un tableau par nœud. */
export const nodeCount = (nav: DeckNav) => nav.grid.nx * nav.grid.nz * LEVELS;
