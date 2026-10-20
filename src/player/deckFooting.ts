import { DECK_NAV, PLAYER } from '../config';
import { LEVELS } from '../deckCrew/deckGrid';
import type { DeckNav } from '../deckCrew/deckNav';

/**
 * Où le joueur à pied peut poser le pied : les surfaces libres de la grille du pont (DeckNav) qui sont dans l'emprise
 * du pont, rangée par rangée (entre les nœuds praticables les plus à bâbord et à tribord de chaque rangée), et le
 * haut de ce qui gêne une surface quand il est assez bas. Il peut ainsi monter d'un saut sur un tonneau, une écoutille
 * ou une balustrade, mais jamais sur le plat-bord ni dehors : le pavois le retient toujours, il ne peut pas tomber à
 * l'eau. Calculé une fois par grille.
 */
export class DeckFooting {
  /** Pour chaque rangée (z), les cases (x) extrêmes du pont praticable ; min > max = rangée sans pont. */
  private readonly rowMin: Int32Array;
  private readonly rowMax: Int32Array;
  /** Hauteurs entre lesquelles il y a du pont (m). */
  private readonly low: number;
  private readonly high: number;

  constructor(readonly nav: DeckNav) {
    const { nx, nz } = nav.grid;
    this.rowMin = new Int32Array(nz).fill(nx);
    this.rowMax = new Int32Array(nz).fill(-1);
    let low = Infinity;
    let high = -Infinity;
    for (const list of nav.nodes) {
      for (const n of list) {
        const cell = Math.floor(n / LEVELS);
        const i = cell % nx;
        const j = Math.floor(cell / nx);
        this.rowMin[j] = Math.min(this.rowMin[j], i);
        this.rowMax[j] = Math.max(this.rowMax[j], i);
        low = Math.min(low, nav.y(n));
        high = Math.max(high, nav.y(n));
      }
    }
    this.low = low - PLAYER.footing.below;
    this.high = high + PLAYER.footing.above;
  }

  /** Peut-on se tenir sur ce nœud ? (`blocked` : nœuds pris par les affûts.) */
  standable(node: number, blocked: Uint8Array | null): boolean {
    const { grid } = this.nav;
    if (grid.blocked[node] || (blocked && blocked[node])) return false;
    return this.nav.part[node] >= 0 || this.inDeck(node, grid.heights[node]);
  }

  /** Le nœud est-il dans l'emprise du pont, à une hauteur de pont ? */
  private inDeck(node: number, h: number): boolean {
    const { grid } = this.nav;
    const cell = Math.floor(node / LEVELS);
    const i = cell % grid.nx;
    const j = Math.floor(cell / grid.nx);
    return i >= this.rowMin[j] && i <= this.rowMax[j] && h >= this.low && h <= this.high;
  }

  /**
   * Où l'on se tient sous (x, z), pas plus haut que `top` : la plus haute surface de la case sous cette hauteur, si
   * l'on peut s'y tenir (ou se poser sur ce qui la gêne, quand c'est assez bas) ; -Infinity sinon (pavois, mât,
   * dehors : on ne peut pas y aller). On ne passe jamais à travers un plancher pour atteindre une surface plus basse.
   */
  groundBelow(x: number, z: number, top: number, blocked: Uint8Array | null): number {
    const { grid } = this.nav;
    const i = grid.cellX(x);
    const j = grid.cellZ(z);
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return -Infinity;
    const cell = j * grid.nx + i;
    let node = -1;
    for (let k = 0; k < grid.counts[cell]; k++) {
      const n = cell * LEVELS + k;
      if (grid.heights[n] <= top && (node < 0 || grid.heights[n] > grid.heights[node])) node = n;
    }
    if (node < 0) return -Infinity;
    const h = grid.heights[node];
    if (this.standable(node, blocked)) return h;
    if (!grid.blocked[node] || (blocked && blocked[node])) return -Infinity;
    // Sur ce qui gêne : on peut s'y poser d'un saut (bord d'un caisson, d'une écoutille, d'un tonneau), pas en haut
    // d'un mât ni d'une cloison, et jamais hors de l'emprise du pont (plat-bord).
    const t = grid.clutter[node];
    return t <= top && t < h + DECK_NAV.headroom - CLUTTER_EPSILON && this.inDeck(node, t) ? t : -Infinity;
  }
}

const cache = new WeakMap<DeckNav, DeckFooting>();
/** Un obstacle qui monte jusqu'au plafond de la place libre (mât, cloison) : on ne se pose pas dessus. */
const CLUTTER_EPSILON = 0.01;

/** Les appuis du joueur sur la grille d'un pont (calculés à la première visite). */
export function footingOf(nav: DeckNav): DeckFooting {
  let f = cache.get(nav);
  if (!f) cache.set(nav, (f = new DeckFooting(nav)));
  return f;
}
