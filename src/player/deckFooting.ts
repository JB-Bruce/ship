import { PLAYER } from '../config';
import { LEVELS } from '../deckCrew/deckGrid';
import type { DeckNav } from '../deckCrew/deckNav';

/**
 * Où le joueur à pied peut poser le pied : les surfaces libres de la grille du pont (DeckNav) qui sont dans l'emprise
 * du pont, rangée par rangée (entre les nœuds praticables les plus à bâbord et à tribord de chaque rangée), et le
 * haut de ce qui gêne une surface quand il est assez bas. Il peut ainsi monter d'un saut sur un tonneau, une écoutille
 * ou une balustrade, mais jamais sur le plat-bord ni dehors : le pavois le retient toujours, il ne peut pas tomber à
 * l'eau. S'y ajoutent les planchers des hunes (DeckNav.tops), d'où l'on saute vers le pont. Calculé une fois par grille.
 */
export class DeckFooting {
  /** Pour chaque rangée (z), les cases (x) extrêmes du pont praticable ; min > max = rangée sans pont. */
  private readonly rowMin: Int32Array;
  private readonly rowMax: Int32Array;
  /** Hauteurs entre lesquelles il y a du pont (m). */
  private readonly low: number;
  /** Le pont le plus bas (m). */
  readonly lowest: number;
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
    this.lowest = low;
    this.low = low - PLAYER.footing.below;
    this.high = high + PLAYER.footing.above;
    // Une cloison en travers du pont n'a pas (ou presque pas) de nœud praticable sur sa rangée : une rangée prend aussi
    // l'emprise commune à ses voisines de devant et de derrière (on passe au-dessus de la cloison en tombant d'un
    // château), jamais plus large que l'une d'elles (là où la coque s'affine, on ne monte pas sur le plat-bord).
    const min = this.rowMin.slice();
    const max = this.rowMax.slice();
    const r = PLAYER.footing.rows;
    for (let j = 0; j < nz; j++) {
      let beforeMin = nx;
      let beforeMax = -1;
      let afterMin = nx;
      let afterMax = -1;
      for (let k = Math.max(0, j - r); k < j; k++) {
        beforeMin = Math.min(beforeMin, min[k]);
        beforeMax = Math.max(beforeMax, max[k]);
      }
      for (let k = j + 1; k <= Math.min(nz - 1, j + r); k++) {
        afterMin = Math.min(afterMin, min[k]);
        afterMax = Math.max(afterMax, max[k]);
      }
      const lo = Math.max(beforeMin, afterMin);
      const hi = Math.min(beforeMax, afterMax);
      if (lo > hi) continue;
      this.rowMin[j] = Math.min(this.rowMin[j], lo);
      this.rowMax[j] = Math.max(this.rowMax[j], hi);
    }
  }

  /** Peut-on se tenir sur ce nœud ? (On traverse les pièces marquées : roue, barre franche ; les canons ne sont pas dans la grille.) */
  standable(node: number): boolean {
    const { grid } = this.nav;
    if (grid.hard[node]) return false;
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
   * Où l'on se tient sous (x, z), pas plus haut que `top` : la plus haute surface sous cette hauteur, si l'on peut s'y
   * tenir (ou se poser sur ce qui la gêne, quand c'est assez bas) ; -Infinity sinon (pavois, mât, dehors : on ne peut
   * pas y aller). On ne passe jamais à travers un plancher pour atteindre une surface plus basse : ni celui du pont, ni
   * celui d'une hune (le mât, une vergue au-dessus en font un mur).
   */
  groundBelow(x: number, z: number, top: number): number {
    let best = this.deckBelow(x, z, top);
    for (const t of this.nav.tops) {
      const h = t.platformAt(x, z);
      if (!(h <= top)) continue;
      const free = t.ground(x, z);
      if (free === -Infinity) return -Infinity;
      best = Math.max(best, free);
    }
    return best;
  }

  /** Comme groundBelow, sur le seul pont (grille du DeckNav). */
  private deckBelow(x: number, z: number, top: number): number {
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
    if (this.standable(node)) return h;
    if (!grid.hard[node]) return -Infinity;
    // Sur ce qui gêne, quand on est assez haut : on s'y pose d'un saut (caisson, écoutille, tonneau), et l'on passe
    // au-dessus du haut d'une cloison en sautant ou en tombant d'un château ; jamais hors de l'emprise du pont (plat-bord).
    const t = grid.clutter[node];
    return t <= top && this.inDeck(node, t) ? t : -Infinity;
  }
}

const cache = new WeakMap<DeckNav, DeckFooting>();

/** Les appuis du joueur sur la grille d'un pont (calculés à la première visite). */
export function footingOf(nav: DeckNav): DeckFooting {
  let f = cache.get(nav);
  if (!f) cache.set(nav, (f = new DeckFooting(nav)));
  return f;
}
