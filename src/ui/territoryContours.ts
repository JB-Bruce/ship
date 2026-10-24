/** Un contour fermé : coordonnées x, z du monde, à la suite. */
export type Loop = number[];

/** Passes de lissage de Chaikin sur chaque contour (chacune double ses points et arrondit les angles). */
const SMOOTH_PASSES = 2;

/**
 * Contours où le champ `d` (grille de `w` × `h` points, au pas `step` m, le point (i, j) en X = `x0` − i × `step`,
 * Z = `z0` − j × `step`) passe par zéro : carrés qui marchent, segments raccordés en boucles fermées (le bord de la grille
 * doit être négatif), puis lissés. L'intérieur d'une boucle est du côté positif (remplir en `evenodd`).
 */
export function contours(d: Float32Array, w: number, h: number, x0: number, z0: number, step: number): Loop[] {
  // Points de passage sur les arêtes : arête horizontale (i, j)-(i+1, j) = 2 (j w + i), verticale (i, j)-(i, j+1) = +1.
  const px = new Map<number, [number, number]>();
  const point = (edge: number): [number, number] => {
    let p = px.get(edge);
    if (p) return p;
    const cell = edge >> 1;
    const i = cell % w;
    const j = (cell - i) / w;
    const a = d[j * w + i];
    const b = edge & 1 ? d[(j + 1) * w + i] : d[j * w + i + 1];
    const t = a / (a - b);
    p = edge & 1 ? [x0 - i * step, z0 - (j + t) * step] : [x0 - (i + t) * step, z0 - j * step];
    px.set(edge, p);
    return p;
  };
  // Pour chaque arête, l'arête suivante du contour.
  const next = new Map<number, number>();
  const link = (a: number, b: number) => next.set(a, b);
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const tl = d[j * w + i] > 0 ? 1 : 0;
      const tr = d[j * w + i + 1] > 0 ? 1 : 0;
      const br = d[(j + 1) * w + i + 1] > 0 ? 1 : 0;
      const bl = d[(j + 1) * w + i] > 0 ? 1 : 0;
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      const top = 2 * (j * w + i);
      const bottom = 2 * ((j + 1) * w + i);
      const left = 2 * (j * w + i) + 1;
      const right = 2 * (j * w + i + 1) + 1;
      // Sens constant : le côté positif toujours du même côté de la marche.
      switch (code) {
        case 1: link(left, bottom); break;
        case 2: link(bottom, right); break;
        case 3: link(left, right); break;
        case 4: link(right, top); break;
        case 6: link(bottom, top); break;
        case 7: link(left, top); break;
        case 8: link(top, left); break;
        case 9: link(top, bottom); break;
        case 11: link(top, right); break;
        case 12: link(right, left); break;
        case 13: link(right, bottom); break;
        case 14: link(bottom, left); break;
        case 5:
        case 10: {
          // Selle : le centre du carré décide si les deux coins positifs se rejoignent.
          const center = (d[j * w + i] + d[j * w + i + 1] + d[(j + 1) * w + i + 1] + d[(j + 1) * w + i]) / 4 > 0;
          if (code === 5) {
            if (center) { link(left, top); link(right, bottom); } else { link(right, top); link(left, bottom); }
          } else if (center) { link(top, right); link(bottom, left); } else { link(top, left); link(bottom, right); }
          break;
        }
      }
    }
  const loops: Loop[] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Loop = [];
    let e: number | undefined = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      const [x, z] = point(e);
      loop.push(x, z);
      e = next.get(e);
    }
    if (loop.length >= 6) loops.push(smooth(loop));
  }
  return loops;
}

/** Lissage de Chaikin d'une boucle fermée. */
function smooth(loop: Loop): Loop {
  let pts = loop;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const out: Loop = [];
    const n = pts.length / 2;
    for (let k = 0; k < n; k++) {
      const ax = pts[2 * k];
      const az = pts[2 * k + 1];
      const bx = pts[(2 * k + 2) % pts.length];
      const bz = pts[(2 * k + 3) % pts.length];
      out.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
    }
    pts = out;
  }
  return pts;
}

/** Les boucles en un seul chemin (coordonnées du monde). */
export function loopsPath(loops: readonly Loop[]): Path2D {
  const path = new Path2D();
  for (const loop of loops) {
    path.moveTo(loop[0], loop[1]);
    for (let k = 2; k < loop.length; k += 2) path.lineTo(loop[k], loop[k + 1]);
    path.closePath();
  }
  return path;
}
