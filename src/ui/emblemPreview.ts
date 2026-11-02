import { EMBLEMS, type EmblemId } from '../config';
import { drawEmblem } from '../ship/parts/emblemDesigns';

const previews = new Map<EmblemId, string>();

/** Aperçu d'un emblème en couleurs (image PNG), dessiné une fois depuis son masque. */
export function emblemPreview(id: EmblemId): string {
  let url = previews.get(id);
  if (url) return url;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  drawEmblem(g, id);
  const image = g.getImageData(0, 0, 128, 128);
  const { main, second } = EMBLEMS.designs[id];
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [m, s] = [rgb(main), rgb(second)];
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const gr = d[i + 1] / 255;
    const a = Math.max(r, gr);
    // Fond de toile, puis la seconde couleur, puis la principale par-dessus (comme le shader des voiles).
    const mix = (k: number) => Math.round((232 * (1 - gr) + s[k] * gr) * (1 - r) + m[k] * r);
    d[i] = mix(0);
    d[i + 1] = mix(1);
    d[i + 2] = mix(2);
    d[i + 3] = a > 0 ? 255 : 0;
  }
  g.putImageData(image, 0, 0);
  url = canvas.toDataURL();
  previews.set(id, url);
  return url;
}
