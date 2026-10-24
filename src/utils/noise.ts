/** Directions des gradients (cercle découpé en parts égales), et rotation d'une octave à la suivante. */
const DIRECTIONS = 16;
const GRAD_X = new Float32Array(DIRECTIONS);
const GRAD_Z = new Float32Array(DIRECTIONS);
for (let k = 0; k < DIRECTIONS; k++) {
  GRAD_X[k] = Math.cos(((k + 0.5) / DIRECTIONS) * Math.PI * 2);
  GRAD_Z[k] = Math.sin(((k + 0.5) / DIRECTIONS) * Math.PI * 2);
}
/** Les octaves ne partagent pas les mêmes axes : chacune est tournée de cet angle (radians) par rapport à la précédente. */
const OCTAVE_TURN = 0.83;
const MAX_OCTAVES = 8;
const TURN_COS = Float32Array.from({ length: MAX_OCTAVES }, (_, k) => Math.cos(k * OCTAVE_TURN));
const TURN_SIN = Float32Array.from({ length: MAX_OCTAVES }, (_, k) => Math.sin(k * OCTAVE_TURN));

/** Contribution d'un coin de la case : produit scalaire de son gradient (tiré de ses coordonnées et de la graine) et de l'écart au point. */
function corner(ix: number, iz: number, dx: number, dz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const k = ((h ^ (h >>> 16)) >>> 0) % DIRECTIONS;
  return GRAD_X[k] * dx + GRAD_Z[k] * dz;
}

/**
 * Bruit de gradient lissé (environ -1 à 1), de période 1 : un gradient pseudo-aléatoire à chaque point entier,
 * toujours le même pour un même point et une même graine, interpolé en douceur. Ses formes ne s'alignent pas sur la
 * grille (contrairement à un bruit de valeurs).
 */
export function gradientNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = corner(ix, iz, fx, fz, seed);
  const b = corner(ix + 1, iz, fx - 1, fz, seed);
  const c = corner(ix, iz + 1, fx, fz - 1, seed);
  const d = corner(ix + 1, iz + 1, fx - 1, fz - 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * Math.SQRT2;
}

/** Somme d'octaves de bruit (environ -1 à 1) : [longueur d'onde (m), poids] pour chacune (au plus 8). */
export function fractalNoise(x: number, z: number, octaves: readonly (readonly [number, number])[], seed: number): number {
  let sum = 0;
  let weight = 0;
  for (let k = 0; k < octaves.length; k++) {
    const [wavelength, w] = octaves[k];
    const cos = TURN_COS[k];
    const sin = TURN_SIN[k];
    sum += gradientNoise((x * cos - z * sin) / wavelength, (x * sin + z * cos) / wavelength, seed + k) * w;
    weight += w;
  }
  return sum / weight;
}
