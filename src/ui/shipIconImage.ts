/** Images des silhouettes de navires (SVG de shipIcons.ts) pour les cartes dessinées sur toile, par dessin et couleur. */
const cache = new Map<string, HTMLImageElement>();

/**
 * La silhouette `svg` (trait de `shipIcons.ts`) en image, tracée en `color` ; null tant qu'elle n'est pas chargée
 * (`loaded` est alors appelé une fois prête, pour redessiner).
 */
export function shipIconImage(svg: string, color: string, loaded: () => void): HTMLImageElement | null {
  const key = `${color}|${svg}`;
  let image = cache.get(key);
  if (!image) {
    const styled = svg.replace(
      '<svg ',
      `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" `,
    ).replace('>', `><style>.solid{fill:${color}}</style>`);
    image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(styled)}`;
    cache.set(key, image);
  }
  if (image.complete && image.naturalWidth > 0) return image;
  image.addEventListener('load', loaded, { once: true });
  return null;
}
