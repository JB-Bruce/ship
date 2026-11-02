import type * as THREE from 'three';
import type { WakeMap } from '../ocean/wakeMap';
import { COLORS, rand, reset } from './particleKit';
import type { ParticleSystem } from './particles';

/** Effets du Kraken : sang noir des tentacules touchées, gerbes géantes quand elles jaillissent ou retombent. */
export class KrakenFx {
  constructor(
    private readonly lit: ParticleSystem,
    private readonly wakes: WakeMap,
  ) {}

  /** Boulet dans la chair : giclée de sang noir-violet et lambeaux de chair qui retombent ; `scale` : taille. */
  ichor(p: THREE.Vector3, scale = 1) {
    for (let i = 0; i < 12; i++) {
      const s = reset(p.x, p.y, p.z, i % 4 ? COLORS.ichor : COLORS.flesh);
      Object.assign(s, {
        vx: rand(-4, 4) * scale, vy: rand(1, 6) * scale, vz: rand(-4, 4) * scale, life: rand(0.8, 1.4),
        size: rand(0.1, 0.2) * scale, sizeEnd: 0.05, gravity: 11, drag: 0.5, spin: rand(-6, 6), water: true,
      });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 4; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.ichor);
      Object.assign(s, { vx: rand(-0.8, 0.8), vy: rand(0.3, 1.2), vz: rand(-0.8, 0.8), life: rand(1, 1.6), size: 0.25 * scale, sizeEnd: rand(0.6, 0.8) * scale, drag: 1.6 });
      this.lit.spawn(s);
    }
  }

  /**
   * Une tentacule (ou la tête) qui jaillit ou s'abat : haute gerbe d'eau, gouttes qui retombent loin, large anneau
   * d'écume posé sur l'eau ; `scale` : taille (1 = une tentacule).
   */
  burst(x: number, y: number, z: number, scale = 1) {
    this.wakes.splash(x, z);
    for (let i = 0; i < 26 * scale; i++) {
      const s = reset(x + rand(-1, 1) * scale, y, z + rand(-1, 1) * scale, COLORS.water);
      Object.assign(s, {
        vx: rand(-3, 3) * scale, vy: rand(6, 15) * Math.sqrt(scale), vz: rand(-3, 3) * scale, life: rand(1.2, 2),
        size: rand(0.25, 0.5) * scale, sizeEnd: 0.15, gravity: 13, drag: 0.25, water: true,
      });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = reset(x, y, z, COLORS.foam);
      Object.assign(s, { vx: Math.cos(a) * 3.5 * scale, vz: Math.sin(a) * 3.5 * scale, life: rand(1.5, 2.2), size: 0.35 * scale, sizeEnd: 0.8 * scale, drag: 1.4, shapeY: 0.12, onWater: true, water: true });
      this.lit.spawn(s);
    }
  }

  /** Eau qui ruisselle d'une tentacule ou de la tête sortie de l'eau : une goutte qui tombe de `p`. */
  drip(p: THREE.Vector3) {
    const s = reset(p.x + rand(-0.3, 0.3), p.y, p.z + rand(-0.3, 0.3), COLORS.water);
    Object.assign(s, { vx: rand(-0.4, 0.4), vy: rand(-1, 0.5), vz: rand(-0.4, 0.4), life: rand(0.6, 1), size: rand(0.1, 0.18), sizeEnd: 0.06, gravity: 12, water: true });
    this.lit.spawn(s);
  }
}
