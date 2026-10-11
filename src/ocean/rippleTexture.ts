import * as THREE from 'three';

/** Générateur pseudo-aléatoire déterministe : la texture est identique à chaque lancement. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Texture de petites rides, générée au démarrage (aucun fichier à charger).
 * Somme de sinus à fréquences entières : elle se raccorde parfaitement en mosaïque.
 * R, G = pentes de la surface (x, z) ; A = hauteur, sert de bruit pour découper l'écume.
 */
export function createRippleTexture(size = 256, waveCount = 40): THREE.DataTexture {
  const rand = mulberry32(1337);
  const TWO_PI = Math.PI * 2;
  const waves = Array.from({ length: waveCount }, () => {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((rand() * 2 - 1) * 9);
      ky = Math.round((rand() * 2 - 1) * 9);
    }
    return { kx, ky, amp: 1 / Math.pow(Math.hypot(kx, ky), 1.4), phase: rand() * TWO_PI };
  });

  const n = size * size;
  const dx = new Float32Array(n);
  const dz = new Float32Array(n);
  const h = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      for (const w of waves) {
        const a = TWO_PI * ((w.kx * x + w.ky * y) / size) + w.phase;
        const c = Math.cos(a) * w.amp * TWO_PI;
        h[i] += Math.sin(a) * w.amp;
        dx[i] += c * w.kx;
        dz[i] += c * w.ky;
      }
    }
  }

  let maxSlope = 0;
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < n; i++) {
    maxSlope = Math.max(maxSlope, Math.abs(dx[i]), Math.abs(dz[i]));
    minH = Math.min(minH, h[i]);
    maxH = Math.max(maxH, h[i]);
  }
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round((dx[i] / maxSlope) * 127.5 + 127.5);
    data[i * 4 + 1] = Math.round((dz[i] / maxSlope) * 127.5 + 127.5);
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = Math.round(((h[i] - minH) / (maxH - minH)) * 255);
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  // Les mipmaps lissent les rides au loin : pas de scintillement parasite à l'horizon.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
