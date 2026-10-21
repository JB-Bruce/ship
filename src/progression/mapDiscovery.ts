import { MAP_FOG, WORLD_EDGE } from '../config';
import type { Landmass } from '../world/landmass';
import { decodeRuns, encodeRuns } from './discoveryRuns';

/** Rectangle de cases (bornes comprises) ; vide quand `minC` > `maxC`. */
export interface CellRect {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

const emptyRect = (r: CellRect) => {
  r.minC = r.minR = Infinity;
  r.maxC = r.maxR = -Infinity;
};

const grow = (r: CellRect, c: number, row: number) => {
  if (c < r.minC) r.minC = c;
  if (c > r.maxC) r.maxC = c;
  if (row < r.minR) r.minR = row;
  if (row > r.maxR) r.maxR = row;
};

/**
 * Ce que la carte connaît de la mer : une grille de cases (MAP_FOG.cell m) sur tout le monde jouable, chacune
 * découverte (1) ou non (0), pour toujours. Le radar du bateau piloté découvre tout ce qui passe dans son cercle ;
 * au départ, on connaît la Tortue et ses abords. La case (c, r) a son centre en X = `originX` + (c + 0,5) × `cell`,
 * Z = `originZ` + (r + 0,5) × `cell`.
 */
export class MapDiscovery {
  readonly cell = MAP_FOG.cell;
  readonly originX: number;
  readonly originZ: number;
  /** Nombre de cases par côté (la grille est carrée). */
  readonly size: number;
  readonly known: Uint8Array;
  /** Cases découvertes, et cases en tout, en deçà du bord du monde (part découverte). */
  private insideKnown = 0;
  private readonly insideTotal: number;
  /** Cases découvertes depuis le dernier `takeDirty`, et emprise de tout ce qui est découvert. */
  private readonly dirty: CellRect = { minC: 0, maxC: -1, minR: 0, maxR: -1 };
  private readonly extent: CellRect = { minC: 0, maxC: -1, minR: 0, maxR: -1 };
  /** Position et portée de la dernière découverte (NaN : aucune encore). */
  private lastX = NaN;
  private lastZ = NaN;
  private lastRadius = 0;

  constructor() {
    const [cx, cz] = WORLD_EDGE.center;
    const half = WORLD_EDGE.radius + WORLD_EDGE.band + MAP_FOG.margin;
    this.size = Math.ceil((2 * half) / this.cell);
    this.originX = cx - (this.size * this.cell) / 2;
    this.originZ = cz - (this.size * this.cell) / 2;
    this.known = new Uint8Array(this.size * this.size);
    let inside = 0;
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (this.insideEdge(c, r)) inside++;
    this.insideTotal = inside;
    emptyRect(this.dirty);
    emptyRect(this.extent);
  }

  /** Le radar du bateau piloté (position, portée en m) : découverte seulement s'il a bougé ou changé de portée d'au moins MAP_FOG.step. */
  update(x: number, z: number, radius: number) {
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    if (moved < MAP_FOG.step && Math.abs(radius - this.lastRadius) < MAP_FOG.step) return;
    this.lastX = x;
    this.lastZ = z;
    this.lastRadius = radius;
    this.reveal(x, z, radius);
  }

  /** Découvre les cases dont le centre est à moins de `radius` m de (x, z). */
  reveal(x: number, z: number, radius: number) {
    const { cell, size, known } = this;
    const c0 = Math.max(0, Math.floor((x - radius - this.originX) / cell));
    const c1 = Math.min(size - 1, Math.floor((x + radius - this.originX) / cell));
    const r0 = Math.max(0, Math.floor((z - radius - this.originZ) / cell));
    const r1 = Math.min(size - 1, Math.floor((z + radius - this.originZ) / cell));
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const dz = this.originZ + (r + 0.5) * cell - z;
      for (let c = c0; c <= c1; c++) {
        const i = r * size + c;
        if (known[i]) continue;
        const dx = this.originX + (c + 0.5) * cell - x;
        if (dx * dx + dz * dz > r2) continue;
        this.mark(i, c, r);
      }
    }
  }

  /** Une terre et ses abords (MAP_FOG.startMargin m au-delà de sa côte). */
  revealLand(land: Landmass) {
    this.reveal(land.cx, land.cz, land.outerRadius + MAP_FOG.startMargin);
  }

  isKnown(x: number, z: number): boolean {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((z - this.originZ) / this.cell);
    return c >= 0 && r >= 0 && c < this.size && r < this.size && this.known[r * this.size + c] === 1;
  }

  /** Part découverte de la mer en deçà du bord du monde (0 à 1). */
  get share(): number {
    return this.insideKnown / this.insideTotal;
  }

  /** Emprise de tout ce qui est découvert, en m (null si rien ne l'est). */
  bounds(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    const e = this.extent;
    if (e.minC > e.maxC) return null;
    const { originX, originZ, cell } = this;
    return { minX: originX + e.minC * cell, maxX: originX + (e.maxC + 1) * cell, minZ: originZ + e.minR * cell, maxZ: originZ + (e.maxR + 1) * cell };
  }

  /**
   * Copie dans `out` les cases découvertes depuis le dernier appel, et l'oublie. Renvoie false s'il n'y en a aucune.
   * Après un `restore`, c'est toute la grille.
   */
  takeDirty(out: CellRect): boolean {
    const d = this.dirty;
    if (d.minC > d.maxC) return false;
    Object.assign(out, d);
    emptyRect(d);
    return true;
  }

  /** Copie dans `out` l'emprise (en cases) de tout ce qui est découvert. Renvoie false si rien ne l'est. */
  extentRect(out: CellRect): boolean {
    if (this.extent.minC > this.extent.maxC) return false;
    Object.assign(out, this.extent);
    return true;
  }

  /** État à sauvegarder : la grille, compressée (voir discoveryRuns.ts). */
  snapshot(): string {
    return encodeRuns(this.known, { cell: this.cell, size: this.size, originX: this.originX, originZ: this.originZ });
  }

  /** Reprend une sauvegarde (la grille est refaite si ses réglages ont changé). Renvoie false si elle est illisible. */
  restore(data: string): boolean {
    const grid = decodeRuns(data);
    if (!grid) return false;
    this.known.fill(0);
    this.insideKnown = 0;
    emptyRect(this.extent);
    const { size, cell } = this;
    for (let r = 0; r < size; r++) {
      const z = this.originZ + (r + 0.5) * cell;
      for (let c = 0; c < size; c++) {
        const x = this.originX + (c + 0.5) * cell;
        if (grid.at(x, z)) this.mark(r * size + c, c, r);
      }
    }
    // Tout est à repeindre, et la prochaine image refait une découverte autour du bateau.
    this.dirty.minC = this.dirty.minR = 0;
    this.dirty.maxC = this.dirty.maxR = size - 1;
    this.lastX = NaN;
    return true;
  }

  private mark(i: number, c: number, r: number) {
    this.known[i] = 1;
    if (this.insideEdge(c, r)) this.insideKnown++;
    grow(this.dirty, c, r);
    grow(this.extent, c, r);
  }

  /** Le centre de la case est-il en deçà du bord du monde ? */
  private insideEdge(c: number, r: number): boolean {
    const center = WORLD_EDGE.center;
    return Math.hypot(this.originX + (c + 0.5) * this.cell - center[0], this.originZ + (r + 0.5) * this.cell - center[1]) <= WORLD_EDGE.radius;
  }
}
