import { TERRITORY, WORLD_EDGE } from '../config';
import { OWNER_KEYS, type Territory } from '../progression/territory';
import { fractalNoise } from '../utils/noise';
import type { MapFrame } from './mapView';
import { contours, loopsPath } from './territoryContours';

/** Graine et octaves du bruit qui fait onduler les frontières : [longueur d'onde (m), poids]. */
const WOBBLE_SEED = 53;
const WOBBLE_OCTAVES = [[420, 1], [140, 0.5]] as const;
/** Amplitude de l'ondulation, en part du champ flouté. */
const WOBBLE = 0.12;
/** Rayon du flou, en écarts types. */
const BLUR_REACH = 3;

/** Un camp sur la carte : son contour (coordonnées du monde) et ses couleurs. */
interface Region {
  path: Path2D;
  wash: string;
  band: string;
}

/**
 * Calque des territoires sur la carte M (bouton « Territoires »), dessiné en vecteurs pour rester net à tout zoom : la
 * grille des territoires est floutée, un bruit fait onduler les limites, puis le contour de chaque camp est tiré du champ
 * (`territoryContours.ts` : lignes de niveau lissées). Chaque camp a un lavis léger, un liseré de sa couleur le long de
 * l'intérieur de sa frontière, et un fin trait d'encre marque la frontière elle-même. Le tout est coupé au bord du monde.
 * Les contours ne sont refaits que quand les territoires changent (`Territory.version`).
 */
export class TerritoryLayer {
  shown = false;
  private regions: Region[] = [];
  private builtAt = -1;

  constructor(private readonly territory: Territory) {}

  /** Pose le calque au cadrage `frame` de la carte (sous les terres : elles le recouvrent). */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number, frame: MapFrame) {
    if (!this.shown) return;
    if (this.builtAt !== this.territory.version) {
      this.regions = this.build();
      this.builtAt = this.territory.version;
    }
    const { midX, midZ, scale } = frame;
    const m = TERRITORY.map;
    ctx.save();
    // Repère du monde : écran = (largeur / 2 − (x − midX) × échelle, hauteur / 2 − (z − midZ) × échelle).
    ctx.translate(width / 2 + midX * scale, height / 2 + midZ * scale);
    ctx.scale(-scale, -scale);
    const edge = new Path2D();
    edge.arc(WORLD_EDGE.center[0], WORLD_EDGE.center[1], WORLD_EDGE.radius, 0, Math.PI * 2);
    ctx.clip(edge);
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const r of this.regions) {
      ctx.fillStyle = r.wash;
      ctx.fill(r.path, 'evenodd');
      // Liseré : le trait est coupé à l'intérieur du camp, seule sa moitié intérieure reste.
      ctx.save();
      ctx.clip(r.path, 'evenodd');
      ctx.strokeStyle = r.band;
      ctx.lineWidth = (2 * m.band) / scale;
      ctx.stroke(r.path);
      ctx.restore();
    }
    ctx.strokeStyle = m.ink;
    ctx.lineWidth = m.inkWidth / scale;
    for (const r of this.regions) ctx.stroke(r.path);
    ctx.restore();
  }

  private build(): Region[] {
    const t = this.territory;
    const m = TERRITORY.map;
    const n = t.size;
    const fields = [0, 1, 2].map((k) => blur(t.owner, n, k, m.blur));
    const span = n * t.cell;
    const w = Math.ceil(span / m.step) + 1;
    const x0 = t.originX + span;
    const z0 = t.originZ + span;
    const [cx, cz] = WORLD_EDGE.center;
    const values = [0, 1, 2].map(() => new Float32Array(w * w));
    for (let j = 0; j < w; j++)
      for (let i = 0; i < w; i++) {
        let x = x0 - i * m.step;
        let z = z0 - j * m.step;
        // Au-delà du bord du monde, le champ du bord continue (le calque y est coupé) : pas de frontière le long du bord.
        const out = Math.hypot(x - cx, z - cz);
        if (out > WORLD_EDGE.radius) {
          x = cx + ((x - cx) * WORLD_EDGE.radius) / out;
          z = cz + ((z - cz) * WORLD_EDGE.radius) / out;
        }
        const gc = (x - t.originX) / t.cell - 0.5;
        const gr = (z - t.originZ) / t.cell - 0.5;
        for (let k = 0; k < 3; k++) values[k][j * w + i] = sample(fields[k], n, gc, gr) + WOBBLE * fractalNoise(x, z, WOBBLE_OCTAVES, WOBBLE_SEED + k * 7);
      }
    const regions: Region[] = [];
    const d = new Float32Array(w * w);
    for (let k = 0; k < 3; k++) {
      let any = false;
      for (let j = 0; j < w; j++)
        for (let i = 0; i < w; i++) {
          const p = j * w + i;
          const other = Math.max(values[(k + 1) % 3][p], values[(k + 2) % 3][p]);
          // Bord de la grille négatif : toutes les boucles se ferment.
          d[p] = i === 0 || j === 0 || i === w - 1 || j === w - 1 ? -1 : values[k][p] - other;
          if (d[p] > 0) any = true;
        }
      if (!any) continue;
      const [r, g, b] = m.colors[OWNER_KEYS[k]];
      regions.push({ path: loopsPath(contours(d, w, w, x0, z0, m.step)), wash: `rgba(${r}, ${g}, ${b}, ${m.wash})`, band: `rgba(${r}, ${g}, ${b}, ${m.bandAlpha})` });
    }
    return regions;
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
