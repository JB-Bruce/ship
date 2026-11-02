import { MAP_FOG } from '../config';
import type { CellRect, MapDiscovery } from '../progression/mapDiscovery';
import { fractalNoise } from '../utils/noise';

/** Graine du bruit qui rend la limite irrégulière. */
const EDGE_SEED = 11;
/** Champ lissé sous lequel (au-dessus duquel, × 1 −) un texel est tout à fait inconnu (connu) : pas de bruit à calculer. */
const EPSILON = 1e-3;
/** Texel tout à fait inconnu : opaque, sans assombrissement (RVBA 255, 255, 255, 255 écrits d'un coup). */
const DEEP_FOG = 0xffffffff;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Masque de la brume de la carte, tiré de la grille de découverte : une image hors écran qui couvre toute la grille,
 * dans le sens de la carte (nord en haut, ouest à gauche), un texel = MAP_FOG.texel m. Son opacité est celle du lavis
 * (1 = inconnu, 0 = découvert, bord doux et irrégulier, jamais une grille) ; sa couleur, le facteur qui assombrit le
 * parchemin au bord du lavis (blanc = aucun). Seules les parties qui ont changé depuis la dernière fois sont refaites ;
 * une reconstruction complète (première fois, sauvegarde rechargée) ne calcule que l'emprise de ce qui est découvert.
 */
export class FogMask {
  readonly texels: number;
  /** Côté d'un texel (m), côté du monde couvert (m), et bords ouest et nord de la grille (les plus grands X et Z). */
  readonly texel: number;
  readonly span: number;
  readonly maxX: number;
  readonly maxZ: number;
  private canvas: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  private pixels: Uint32Array | null = null;
  /** Découverte lissée par case (0 inconnu, 1 connu), et passe horizontale du flou gaussien. */
  private readonly field: Float32Array;
  private readonly pass: Float32Array;
  private readonly kernel: Float32Array;
  private readonly radius: number;
  /** Assombrissement du bord, par canal : couleur du bord / couleur du parchemin. */
  private readonly rimFactor: readonly number[];
  private readonly rect: CellRect = { minC: 0, maxC: -1, minR: 0, maxR: -1 };
  private readonly region: CellRect = { minC: 0, maxC: -1, minR: 0, maxR: -1 };

  constructor(private readonly discovery: MapDiscovery) {
    const { size, cell } = discovery;
    this.span = size * cell;
    this.texels = Math.ceil(this.span / MAP_FOG.texel);
    this.texel = this.span / this.texels;
    this.maxX = discovery.originX + this.span;
    this.maxZ = discovery.originZ + this.span;
    this.field = new Float32Array(size * size);
    this.pass = new Float32Array(size * size);
    // Flou gaussien de la limite (écart type MAP_FOG.blur cases, coupé à 2,5 écarts types).
    this.radius = Math.ceil(MAP_FOG.blur * 2.5);
    this.kernel = new Float32Array(this.radius * 2 + 1);
    let sum = 0;
    for (let k = -this.radius; k <= this.radius; k++) sum += this.kernel[k + this.radius] = Math.exp(-(k * k) / (2 * MAP_FOG.blur * MAP_FOG.blur));
    for (let k = 0; k < this.kernel.length; k++) this.kernel[k] /= sum;
    this.rimFactor = MAP_FOG.rimColor.map((c, k) => c / MAP_FOG.paper[k]);
  }

  /** L'image du masque, refaite là où la découverte a changé. */
  update(): HTMLCanvasElement {
    const d = this.discovery;
    const last = d.size - 1;
    let full = false;
    if (!this.canvas || !this.image || !this.pixels) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = this.texels;
      this.image = new ImageData(this.texels, this.texels);
      this.pixels = new Uint32Array(this.image.data.buffer);
      d.takeDirty(this.rect);
      full = true;
    } else if (d.takeDirty(this.rect)) {
      const r = this.rect;
      full = r.minC === 0 && r.minR === 0 && r.maxC === last && r.maxR === last;
    } else {
      return this.canvas;
    }
    const ctx = this.canvas.getContext('2d')!;
    if (full) {
      this.pixels.fill(DEEP_FOG);
      this.field.fill(0);
      if (!d.extentRect(this.rect)) {
        ctx.putImageData(this.image, 0, 0);
        return this.canvas;
      }
    }
    const k = this.radius;
    const g = this.region;
    g.minC = Math.max(0, this.rect.minC - k);
    g.maxC = Math.min(last, this.rect.maxC + k);
    g.minR = Math.max(0, this.rect.minR - k);
    g.maxR = Math.min(last, this.rect.maxR + k);
    this.blur(g);
    // Texels qui lisent une case refaite (lissage bilinéaire : une case de plus de chaque côté).
    const { originX, originZ, cell } = d;
    const i0 = Math.max(0, Math.floor((this.maxX - (originX + (g.maxC + 2) * cell)) / this.texel));
    const i1 = Math.min(this.texels - 1, Math.ceil((this.maxX - (originX + (g.minC - 1) * cell)) / this.texel));
    const j0 = Math.max(0, Math.floor((this.maxZ - (originZ + (g.maxR + 2) * cell)) / this.texel));
    const j1 = Math.min(this.texels - 1, Math.ceil((this.maxZ - (originZ + (g.minR - 1) * cell)) / this.texel));
    this.paintTexels(i0, i1, j0, j1);
    if (full) ctx.putImageData(this.image, 0, 0);
    else ctx.putImageData(this.image, 0, 0, i0, j0, i1 - i0 + 1, j1 - j0 + 1);
    return this.canvas;
  }

  /** Découverte lissée (flou gaussien séparable) sur les cases de `out` ; hors de la grille, tout est inconnu. */
  private blur(out: CellRect) {
    const { size, known } = this.discovery;
    const { kernel, radius, pass, field } = this;
    const r0 = Math.max(0, out.minR - radius);
    const r1 = Math.min(size - 1, out.maxR + radius);
    for (let r = r0; r <= r1; r++) {
      const row = r * size;
      for (let c = out.minC; c <= out.maxC; c++) {
        let sum = 0;
        const k0 = Math.max(-radius, -c);
        const k1 = Math.min(radius, size - 1 - c);
        for (let k = k0; k <= k1; k++) sum += known[row + c + k] * kernel[k + radius];
        pass[row + c] = sum;
      }
    }
    for (let r = out.minR; r <= out.maxR; r++) {
      const k0 = Math.max(-radius, -r);
      const k1 = Math.min(radius, size - 1 - r);
      for (let c = out.minC; c <= out.maxC; c++) {
        let sum = 0;
        for (let k = k0; k <= k1; k++) sum += pass[(r + k) * size + c] * kernel[k + radius];
        field[r * size + c] = sum;
      }
    }
  }

  /** Refait les texels [i0, i1] × [j0, j1] : opacité du lavis et assombrissement de son bord. */
  private paintTexels(i0: number, i1: number, j0: number, j1: number) {
    const { size, cell, originX, originZ } = this.discovery;
    const data = this.image!.data;
    const pixels = this.pixels!;
    const { wobble, soft, rim, rimStrength, noise } = MAP_FOG;
    const [factorR, factorG, factorB] = this.rimFactor;
    for (let j = j0; j <= j1; j++) {
      const z = this.maxZ - (j + 0.5) * this.texel;
      const fr = (z - originZ) / cell - 0.5;
      const r = Math.floor(fr);
      const tr = fr - r;
      for (let i = i0; i <= i1; i++) {
        const x = this.maxX - (i + 0.5) * this.texel;
        const fc = (x - originX) / cell - 0.5;
        const c = Math.floor(fc);
        const p = j * this.texels + i;
        const v = this.sample(c, r, fc - c, tr, size);
        if (v > 1 - EPSILON) {
          pixels[p] = 0;
          continue;
        }
        if (v < EPSILON) {
          pixels[p] = DEEP_FOG;
          continue;
        }
        // Distance à la limite, en part du flou (> 0 côté connu), rendue irrégulière par le bruit.
        const n = fractalNoise(x, z, noise, EDGE_SEED);
        const d = v - 0.5 + n * wobble;
        const alpha = 1 - smoothstep(-soft, soft, d);
        if (alpha <= 0) {
          pixels[p] = 0;
          continue;
        }
        const edge = d > -rim ? Math.min(1, 1 + d / rim) ** 2 * rimStrength * (0.8 + 0.2 * n) : 0;
        const o = p * 4;
        data[o] = 255 * (1 - edge * (1 - factorR));
        data[o + 1] = 255 * (1 - edge * (1 - factorG));
        data[o + 2] = 255 * (1 - edge * (1 - factorB));
        data[o + 3] = alpha * 255;
      }
    }
  }

  /** Lissage bilinéaire de la découverte lissée ; hors de la grille, 0. */
  private sample(c: number, r: number, tc: number, tr: number, size: number): number {
    const values = this.field;
    const inC0 = c >= 0 && c < size;
    const inC1 = c + 1 >= 0 && c + 1 < size;
    const inR0 = r >= 0 && r < size;
    const inR1 = r + 1 >= 0 && r + 1 < size;
    const i = r * size + c;
    const a = inC0 && inR0 ? values[i] : 0;
    const b = inC1 && inR0 ? values[i + 1] : 0;
    const e = inC0 && inR1 ? values[i + size] : 0;
    const f = inC1 && inR1 ? values[i + size + 1] : 0;
    return a + (b - a) * tc + (e - a) * tr + (a - b - e + f) * tc * tr;
  }
}
