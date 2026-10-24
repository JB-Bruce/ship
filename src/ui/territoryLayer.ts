import { TERRITORY, WORLD_EDGE } from '../config';
import { OWNER_KEYS, type Territory } from '../progression/territory';
import { fractalNoise } from '../utils/noise';
import type { MapFrame } from './mapView';

/** Graine et octaves du bruit qui fait onduler les frontières : [longueur d'onde (m), poids]. */
const WOBBLE_SEED = 53;
const WOBBLE_OCTAVES = [[420, 1], [140, 0.5]] as const;
/** Amplitude de l'ondulation, en part du champ flouté. */
const WOBBLE = 0.12;
/** Rayon du flou, en écarts types. */
const BLUR_REACH = 3;

/**
 * Calque des territoires sur la carte M (bouton « Territoires ») : un lavis léger de la couleur de chaque camp (Marine en
 * rouge, pirates à l'encre, toi en vert) et des frontières courbes à l'encre. La grille des territoires est floutée, puis
 * chaque texel prend le camp dont le champ est le plus fort, un bruit faisant onduler les limites ; la frontière est là où
 * deux champs se valent. L'image n'est refaite que quand les territoires changent (`Territory.version`).
 */
export class TerritoryLayer {
  shown = false;
  private image: HTMLCanvasElement | null = null;
  private builtAt = -1;

  constructor(private readonly territory: Territory) {}

  /** Pose le calque au cadrage `frame` de la carte (sous les terres : elles le recouvrent). */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number, frame: MapFrame) {
    if (!this.shown) return;
    const t = this.territory;
    if (!this.image || this.builtAt !== t.version) {
      this.image = this.build();
      this.builtAt = t.version;
    }
    const { midX, midZ, scale } = frame;
    const span = t.size * t.cell;
    const maxX = t.originX + span;
    const maxZ = t.originZ + span;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.image, width / 2 - (maxX - midX) * scale, height / 2 - (maxZ - midZ) * scale, span * scale, span * scale);
    ctx.restore();
  }

  private build(): HTMLCanvasElement {
    const t = this.territory;
    const { texel, line, wash, colors } = TERRITORY.map;
    const n = t.size;
    const fields = [0, 1, 2].map((k) => blur(t.owner, n, k, TERRITORY.map.blur));
    const span = n * t.cell;
    const px = Math.ceil(span / texel);
    const maxX = t.originX + span;
    const maxZ = t.originZ + span;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const image = new ImageData(px, px);
    const v = [0, 0, 0];
    for (let j = 0; j < px; j++)
      for (let i = 0; i < px; i++) {
        const x = maxX - (i + 0.5) * texel;
        const z = maxZ - (j + 0.5) * texel;
        // Au-delà du bord du monde, rien : la tempête n'appartient à personne.
        if (Math.hypot(x - WORLD_EDGE.center[0], z - WORLD_EDGE.center[1]) > WORLD_EDGE.radius) continue;
        // Position dans la grille des cases (centres aux demi-entiers).
        const gc = (x - t.originX) / t.cell - 0.5;
        const gr = (z - t.originZ) / t.cell - 0.5;
        for (let k = 0; k < 3; k++) v[k] = sample(fields[k], n, gc, gr);
        for (let k = 0; k < 3; k++) v[k] += WOBBLE * fractalNoise(x, z, WOBBLE_OCTAVES, WOBBLE_SEED + k * 7);
        let best = 0;
        for (let k = 1; k < 3; k++) if (v[k] > v[best]) best = k;
        let second = -Infinity;
        for (let k = 0; k < 3; k++) if (k !== best && v[k] > second) second = v[k];
        const color = colors[OWNER_KEYS[best]];
        const o = (j * px + i) * 4;
        // Frontière : là où deux camps se valent, un trait d'encre qui s'adoucit sur ses bords.
        const edge = Math.max(0, 1 - (v[best] - second) / line);
        const ink = edge * edge * (3 - 2 * edge);
        for (let k = 0; k < 3; k++) image.data[o + k] = color[k] * (1 - ink * 0.35);
        image.data[o + 3] = Math.round(255 * (wash + (0.85 - wash) * ink));
      }
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return canvas;
  }
}

/** Part des cases du camp `who` autour de chaque case (flou gaussien séparable de `sigma` cases). */
function blur(owner: Uint8Array, n: number, who: number, sigma: number): Float32Array {
  const reach = Math.ceil(sigma * BLUR_REACH);
  const kernel: number[] = [];
  let sum = 0;
  for (let d = -reach; d <= reach; d++) {
    const w = Math.exp(-(d * d) / (2 * sigma * sigma));
    kernel.push(w);
    sum += w;
  }
  for (let d = 0; d < kernel.length; d++) kernel[d] /= sum;
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = owner[i] === who ? 1 : 0;
  const b = new Float32Array(n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let s = 0;
      for (let d = -reach; d <= reach; d++) s += a[r * n + Math.min(n - 1, Math.max(0, c + d))] * kernel[d + reach];
      b[r * n + c] = s;
    }
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let s = 0;
      for (let d = -reach; d <= reach; d++) s += b[Math.min(n - 1, Math.max(0, r + d)) * n + c] * kernel[d + reach];
      a[r * n + c] = s;
    }
  return a;
}

/** Valeur bilinéaire du champ au point (c, r) de la grille, bornée à ses bords. */
function sample(f: Float32Array, n: number, c: number, r: number): number {
  const c0 = Math.min(n - 1, Math.max(0, Math.floor(c)));
  const r0 = Math.min(n - 1, Math.max(0, Math.floor(r)));
  const c1 = Math.min(n - 1, c0 + 1);
  const r1 = Math.min(n - 1, r0 + 1);
  const fc = Math.min(1, Math.max(0, c - c0));
  const fr = Math.min(1, Math.max(0, r - r0));
  const top = f[r0 * n + c0] + (f[r0 * n + c1] - f[r0 * n + c0]) * fc;
  const bottom = f[r1 * n + c0] + (f[r1 * n + c1] - f[r1 * n + c0]) * fc;
  return top + (bottom - top) * fr;
}
