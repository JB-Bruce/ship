import { UI_TEXTURES } from '../../config';

/** Encre brune des textures (r, g, b). */
const INK = [64, 38, 13] as const;

/** Une tuile dessinée pixel par pixel : `alpha(x, y)` donne l'opacité de l'encre (0 à 1). */
function tile(width: number, height: number, alpha: (x: number, y: number) => number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      image.data[i] = INK[0];
      image.data[i + 1] = INK[1];
      image.data[i + 2] = INK[2];
      image.data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, alpha(x, y))));
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Textures du style d'époque, calculées une seule fois puis posées en variables CSS (`--grain`, `--woodgrain`) : une
 * image ordinaire ne coûte rien à redessiner, contrairement à un bruit SVG recalculé à chaque peinture.
 */
export function installTextures() {
  const { grain, grainAlpha, wood, woodAlpha, veins } = UI_TEXTURES;
  // Grain : des points d'encre au hasard, plus ou moins appuyés.
  const grainUrl = tile(grain, grain, () => Math.random() ** 3 * grainAlpha);
  // Bois : des veines horizontales ondulées (somme de sinus, tuilable en largeur), plus un peu de grain.
  const [w, h] = wood;
  const waves = Array.from({ length: veins }, () => ({ y: Math.random() * h, amp: 2 + Math.random() * 6, k: 1 + Math.floor(Math.random() * 3), phase: Math.random() * Math.PI * 2, width: 0.6 + Math.random() * 2 }));
  const woodUrl = tile(w, h, (x, y) => {
    let a = Math.random() * 0.12;
    for (const v of waves) {
      const cy = v.y + v.amp * Math.sin((x / w) * Math.PI * 2 * v.k + v.phase);
      const d = Math.min(Math.abs(y - cy), h - Math.abs(y - cy));
      a += Math.max(0, 1 - d / v.width) * 0.8;
    }
    return a * woodAlpha;
  });
  const root = document.documentElement.style;
  if (grainUrl) root.setProperty('--grain', `url(${grainUrl})`);
  if (woodUrl) root.setProperty('--woodgrain', `url(${woodUrl})`);
}
