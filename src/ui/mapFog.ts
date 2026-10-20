import { MAP_FOG } from '../config';
import type { MapDiscovery } from '../progression/mapDiscovery';
import { fractalNoise } from '../utils/noise';
import { FogMask } from './fogMask';
import type { MapFrame } from './mapView';

/** Graine du bruit des taches du parchemin. */
const STAIN_SEED = 37;
/** Octaves des taches : [longueur d'onde (× MAP_FOG.stainScale), poids] ; bruit qui va de « pas de tache » à « tache pleine ». */
const STAIN_OCTAVES = [[1, 0.6], [0.35, 0.4]] as const;
const STAIN_RANGE = [-0.15, 0.45] as const;
/** Texels de l'image des taches par longueur d'onde (elles sont très douces : une petite image suffit). */
const STAIN_DETAIL = 10;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Brume de la carte (M) : la mer inconnue est couverte d'un lavis de parchemin vierge (« terra incognita »), taché comme
 * un vieux papier, aux bords doux et irréguliers, plus sombres côté inconnu, comme un pigment qui s'accumule au bord
 * d'un lavis. Le parchemin (une petite image de taches, faite une fois) est posé sur un calque de la taille de la
 * carte, assombri puis découpé par le masque de la découverte (fogMask.ts), et le calque est posé sur la carte : quatre
 * images par dessin, sans calcul par pixel tant que la découverte ne change pas.
 */
export class MapFog {
  private readonly mask: FogMask;
  private stains: HTMLCanvasElement | null = null;
  private readonly layer = document.createElement('canvas');
  private readonly paper = `rgb(${MAP_FOG.paper.join(', ')})`;

  constructor(discovery: MapDiscovery) {
    this.mask = new FogMask(discovery);
  }

  /** Pose le lavis sur la carte au cadrage `frame` (centre et échelle de paintMap), là où la mer est inconnue. */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number, frame: MapFrame) {
    const mask = this.mask.update();
    const stains = (this.stains ??= this.paintStains());
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
    }
    const l = this.layer.getContext('2d')!;
    const { midX, midZ, scale } = frame;
    const { maxX, maxZ, span, texel, texels } = this.mask;
    // Coin nord-ouest de la grille à l'écran, et son côté (px).
    const left = w / 2 - (maxX - midX) * scale;
    const top = h / 2 - (maxZ - midZ) * scale;
    const side = span * scale;
    l.globalCompositeOperation = 'source-over';
    l.imageSmoothingEnabled = true;
    l.imageSmoothingQuality = 'high';
    l.fillStyle = this.paper;
    l.fillRect(0, 0, w, h);
    l.drawImage(stains, left, top, side, side);
    // Seule la partie visible du masque (un texel de marge, pour le lissage).
    const i0 = Math.max(0, Math.floor((maxX - (midX + w / 2 / scale)) / texel) - 1);
    const i1 = Math.min(texels, Math.ceil((maxX - (midX - w / 2 / scale)) / texel) + 1);
    const j0 = Math.max(0, Math.floor((maxZ - (midZ + h / 2 / scale)) / texel) - 1);
    const j1 = Math.min(texels, Math.ceil((maxZ - (midZ - h / 2 / scale)) / texel) + 1);
    if (i1 > i0 && j1 > j0) {
      const t = texel * scale;
      const args = [i0, j0, i1 - i0, j1 - j0, left + i0 * t, top + j0 * t, (i1 - i0) * t, (j1 - j0) * t] as const;
      // Bord assombri, puis découpe : le calque ne garde le parchemin que là où le masque est opaque.
      l.globalCompositeOperation = 'multiply';
      l.drawImage(mask, ...args);
      l.globalCompositeOperation = 'destination-in';
      l.drawImage(mask, ...args);
      l.globalCompositeOperation = 'source-over';
      // Au-delà de la grille (que la découpe vient d'effacer), tout est inconnu, jusque sous le bord du masque.
      const inset = Math.min(side / 2, t * 2);
      l.beginPath();
      l.rect(0, 0, w, h);
      l.rect(left + inset, top + inset, side - 2 * inset, side - 2 * inset);
      l.fill('evenodd');
    }
    ctx.drawImage(this.layer, 0, 0, width, height);
  }

  /** Parchemin vierge, opaque, sur toute la grille : taches qui s'effacent vers son bord (MAP_FOG.stainFade m). */
  private paintStains(): HTMLCanvasElement {
    const { maxX, maxZ, span } = this.mask;
    const n = Math.ceil((span * STAIN_DETAIL) / MAP_FOG.stainScale);
    const step = span / n;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const image = new ImageData(n, n);
    const octaves = STAIN_OCTAVES.map(([wave, weight]) => [wave * MAP_FOG.stainScale, weight] as const);
    const { paper, stain, stainStrength, stainFade } = MAP_FOG;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const border = Math.min(i + 0.5, j + 0.5, n - i - 0.5, n - j - 0.5) * step;
        const noise = fractalNoise(maxX - (i + 0.5) * step, maxZ - (j + 0.5) * step, octaves, STAIN_SEED);
        const s = smoothstep(STAIN_RANGE[0], STAIN_RANGE[1], noise) * smoothstep(0, stainFade, border) * stainStrength;
        const o = (j * n + i) * 4;
        for (let k = 0; k < 3; k++) image.data[o + k] = paper[k] + (stain[k] - paper[k]) * s;
        image.data[o + 3] = 255;
      }
    }
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return canvas;
  }
}
