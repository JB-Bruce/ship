import * as THREE from 'three';
import { DECK_NAV } from '../config';

/** Niveaux de surface gardés au plus par case (pont, marche, dessus de château…). */
export const LEVELS = 4;
/** Liens au plus vers une même case voisine (pont et marche), et par nœud (8 directions). */
export const LINKS_PER_DIR = 2;
export const LINKS = 8 * LINKS_PER_DIR;

/**
 * Grille du pont vue de dessus (repère du modèle) : chaque case garde jusqu'à LEVELS hauteurs de surfaces où l'on
 * peut poser le pied, et pour chacune si elle est libre (assez de place au-dessus : rien qui gêne entre les chevilles
 * et la tête). Un nœud = case × niveau.
 */
export class DeckGrid {
  readonly heights: Float32Array;
  readonly counts: Uint8Array;
  readonly blocked: Uint8Array;
  /** Pour une surface gênée : le haut de ce qui la gêne (plafonné à `headroom` au-dessus d'elle), où l'on peut se poser d'un saut. */
  readonly clutter: Float32Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly nx: number,
    readonly nz: number,
  ) {
    this.heights = new Float32Array(nx * nz * LEVELS);
    this.counts = new Uint8Array(nx * nz);
    this.blocked = new Uint8Array(nx * nz * LEVELS);
    this.clutter = new Float32Array(nx * nz * LEVELS);
  }

  cellX(x: number) {
    return Math.floor((x - this.x0) / DECK_NAV.cell);
  }

  cellZ(z: number) {
    return Math.floor((z - this.z0) / DECK_NAV.cell);
  }

  /** Centre d'une case (x, z). */
  centerX(i: number) {
    return this.x0 + (i + 0.5) * DECK_NAV.cell;
  }

  centerZ(j: number) {
    return this.z0 + (j + 0.5) * DECK_NAV.cell;
  }

  /** Ajoute une surface à la hauteur h (fusionnée avec une surface toute proche : la plus haute reste). */
  addSurface(cell: number, h: number) {
    const n = this.counts[cell];
    const base = cell * LEVELS;
    for (let k = 0; k < n; k++) {
      if (Math.abs(this.heights[base + k] - h) < DECK_NAV.merge) {
        this.heights[base + k] = Math.max(this.heights[base + k], h);
        return;
      }
    }
    if (n < LEVELS) {
      this.heights[base + n] = h;
      this.counts[cell] = n + 1;
      return;
    }
    // Case pleine : on garde les plus basses (les ponts sont sous les hunes et les vergues).
    let high = 0;
    for (let k = 1; k < n; k++) if (this.heights[base + k] > this.heights[base + high]) high = k;
    if (h < this.heights[base + high]) this.heights[base + high] = h;
  }
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const ab = new THREE.Vector3();
const ac = new THREE.Vector3();
const normal = new THREE.Vector3();

/** Parcourt les pièces visibles d'un modèle (la racine elle-même peut être cachée : navire dans la brume). */
export function visibleParts(root: THREE.Object3D, visit: (object: THREE.Object3D) => void) {
  const walk = (object: THREE.Object3D) => {
    if (object !== root && !object.visible) return;
    visit(object);
    for (const child of object.children) walk(child);
  };
  walk(root);
}

/** Les triangles d'un modèle, dans le repère de sa racine : de quoi marcher (dessus plats) et ce qui gêne. */
export function collectTriangles(root: THREE.Object3D, skip: (mesh: THREE.Mesh) => boolean): Float32Array {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const local = new THREE.Matrix4();
  const out: number[] = [];
  visibleParts(root, (object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || skip(mesh)) return;
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!position) return;
    local.multiplyMatrices(inverse, mesh.matrixWorld);
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (const [v, k] of [[a, 0], [b, 1], [c, 2]] as const) {
        v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(local);
        out.push(v.x, v.y, v.z);
      }
    }
  });
  return Float32Array.from(out);
}

/**
 * Pose les triangles dans la grille : d'abord les dessus assez plats (surfaces où marcher), puis tout ce qui occupe
 * l'espace sous `headroom` au-dessus d'une surface et monte plus haut qu'une marche la rend impraticable (mât, affût,
 * cloison, plafond bas). Seuls comptent les ponts entre `low` et `high` (m) : ce qui est tout en dessous (carène)
 * ou tout au-dessus (hunes, vergues) est sauté.
 */
export function rasterize(grid: DeckGrid, tris: Float32Array, low: number, high: number) {
  const flat = Math.cos(DECK_NAV.maxSlope);
  for (let pass = 0; pass < 2; pass++) {
    // Surfaces : seulement à hauteur de pont. Obstacles : ce qui monte d'une marche au-dessus d'un pont, sous la tête.
    const from = pass === 0 ? low : low + DECK_NAV.stepMax;
    const to = pass === 0 ? high : high + DECK_NAV.headroom;
    for (let t = 0; t < tris.length; t += 9) {
      const y0 = tris[t + 1];
      const y1 = tris[t + 4];
      const y2 = tris[t + 7];
      if (Math.max(y0, y1, y2) < from || Math.min(y0, y1, y2) > to) continue;
      a.fromArray(tris, t);
      b.fromArray(tris, t + 3);
      c.fromArray(tris, t + 6);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      const length = normal.length();
      if (length < 1e-9) continue;
      normal.divideScalar(length);
      if (pass === 0) {
        if (Math.abs(normal.y) >= flat) surfaces(grid);
      } else obstacles(grid);
    }
  }
}

/** y du plan du triangle en (x, z) (le triangle n'est pas vertical). */
function planeY(x: number, z: number) {
  return a.y - (normal.x * (x - a.x) + normal.z * (z - a.z)) / normal.y;
}

/** Le point (x, z) est-il dans le triangle vu de dessus, à `pad` m près ? */
function inside(x: number, z: number, pad: number) {
  const d1 = (x - b.x) * (a.z - b.z) - (a.x - b.x) * (z - b.z);
  const d2 = (x - c.x) * (b.z - c.z) - (b.x - c.x) * (z - c.z);
  const d3 = (x - a.x) * (c.z - a.z) - (c.x - a.x) * (z - a.z);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(neg && pos)) return true;
  if (pad <= 0) return false;
  return segmentDistance(x, z, a, b) < pad || segmentDistance(x, z, b, c) < pad || segmentDistance(x, z, c, a) < pad;
}

function segmentDistance(x: number, z: number, p: THREE.Vector3, q: THREE.Vector3) {
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len = dx * dx + dz * dz;
  const t = len > 0 ? Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / len)) : 0;
  return Math.hypot(x - p.x - t * dx, z - p.z - t * dz);
}

/** Cases couvertes par le triangle (vu de dessus), élargi de `pad`. */
function eachCell(grid: DeckGrid, pad: number, visit: (i: number, j: number, x: number, z: number) => void) {
  const i0 = Math.max(0, grid.cellX(Math.min(a.x, b.x, c.x) - pad));
  const i1 = Math.min(grid.nx - 1, grid.cellX(Math.max(a.x, b.x, c.x) + pad));
  const j0 = Math.max(0, grid.cellZ(Math.min(a.z, b.z, c.z) - pad));
  const j1 = Math.min(grid.nz - 1, grid.cellZ(Math.max(a.z, b.z, c.z) + pad));
  for (let j = j0; j <= j1; j++) {
    const z = grid.centerZ(j);
    for (let i = i0; i <= i1; i++) {
      const x = grid.centerX(i);
      if (inside(x, z, pad)) visit(i, j, x, z);
    }
  }
}

function surfaces(grid: DeckGrid) {
  const yMin = Math.min(a.y, b.y, c.y);
  const yMax = Math.max(a.y, b.y, c.y);
  if (yMax < DECK_NAV.minHeight) return;
  eachCell(grid, DECK_NAV.surfacePad, (i, j, x, z) => {
    const y = Math.max(yMin, Math.min(yMax, planeY(x, z)));
    if (y >= DECK_NAV.minHeight) grid.addSurface(j * grid.nx + i, y);
  });
}

function obstacles(grid: DeckGrid) {
  const yMin = Math.min(a.y, b.y, c.y);
  const yMax = Math.max(a.y, b.y, c.y);
  const steep = Math.abs(normal.y) < DECK_NAV.steepNormal;
  const half = DECK_NAV.cell / 2;
  // Une pièce gêne le passage si elle déborde dans la case (marge : demi-largeur d'un marin, moins un peu).
  eachCell(grid, DECK_NAV.obstaclePad, (i, j, x, z) => {
    let low = yMin;
    let high = yMax;
    if (!steep) {
      // Triangle incliné : seule sa partie au-dessus de la case compte.
      const ys = [planeY(x - half, z - half), planeY(x + half, z - half), planeY(x - half, z + half), planeY(x + half, z + half)];
      low = Math.max(yMin, Math.min(...ys));
      high = Math.min(yMax, Math.max(...ys));
    }
    const cell = j * grid.nx + i;
    const base = cell * LEVELS;
    for (let k = 0; k < grid.counts[cell]; k++) {
      const h = grid.heights[base + k];
      // Plus bas qu'une marche (contremarche, hiloire) : on l'enjambe ; son dessus est une surface à part.
      if (high > h + DECK_NAV.stepMax && low < h + DECK_NAV.headroom && high > h + DECK_NAV.clearLow) {
        grid.blocked[base + k] = 1;
        grid.clutter[base + k] = Math.max(grid.clutter[base + k], Math.min(high, h + DECK_NAV.headroom));
      }
    }
  });
}
