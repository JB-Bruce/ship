import type * as THREE from 'three';
import type { WakeMap } from '../ocean/wakeMap';
import { COLORS, rand, reset } from './particleKit';
import type { ParticleSystem } from './particles';

/** Effets du mortier : départ du coup (vers le ciel), traînée de l'obus, colonne d'eau quand il tombe à la mer. */
export class ShellFx {
  constructor(
    private readonly lit: ParticleSystem,
    private readonly glow: ParticleSystem,
    private readonly wakes: WakeMap,
  ) {}

  /** Départ du coup : gerbe de feu et gros nuage de fumée qui montent de la bouche du mortier. */
  launch(p: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      const s = reset(p.x, p.y, p.z, i < 4 ? COLORS.flash : COLORS.fire);
      Object.assign(s, { vx: rand(-2, 2), vy: rand(8, 16), vz: rand(-2, 2), life: rand(0.15, 0.3), size: rand(0.35, 0.55), sizeEnd: 0.1, drag: 4 });
      this.glow.spawn(s);
    }
    for (let i = 0; i < 18; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.smoke);
      Object.assign(s, { vx: rand(-2.5, 2.5), vy: rand(2, 7), vz: rand(-2.5, 2.5), life: rand(2, 3.2), size: rand(0.4, 0.7), sizeEnd: rand(1.6, 2.4), drag: 1.8, spin: rand(-1, 1) });
      this.lit.spawn(s);
    }
  }

  /** Traînée d'un obus en vol : fumée claire qui se dissipe vite, et parfois une étincelle de la mèche. */
  trail(p: THREE.Vector3) {
    const s = reset(p.x + rand(-0.15, 0.15), p.y + rand(-0.15, 0.15), p.z + rand(-0.15, 0.15), COLORS.foam);
    Object.assign(s, { vx: rand(-0.4, 0.4), vy: 0.4, vz: rand(-0.4, 0.4), life: rand(0.6, 0.9), size: rand(0.18, 0.26), sizeEnd: rand(0.55, 0.75), drag: 1, spin: rand(-2, 2) });
    this.lit.spawn(s);
    if (Math.random() > 0.4) return;
    const f = reset(p.x, p.y, p.z, COLORS.fire);
    Object.assign(f, { vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), life: rand(0.15, 0.25), size: 0.16, sizeEnd: 0.04 });
    this.glow.spawn(f);
  }

  /** Obus tombé à la mer : haute colonne d'eau, gouttes qui retombent loin, large anneau d'écume, eau noircie. */
  waterColumn(x: number, y: number, z: number) {
    for (let k = 0; k < 2; k++) this.wakes.splash(x + rand(-1, 1), z + rand(-1, 1));
    for (let i = 0; i < 70; i++) {
      const s = reset(x + rand(-0.8, 0.8), y, z + rand(-0.8, 0.8), i % 3 ? COLORS.foam : COLORS.water);
      Object.assign(s, { vx: rand(-1.8, 1.8), vy: rand(9, 22), vz: rand(-1.8, 1.8), life: rand(1.8, 2.8), size: rand(0.4, 0.75), sizeEnd: 0.2, gravity: 12, drag: 0.3, water: true });
      this.lit.spawn(s);
    }
    // Gouttes projetées loin autour de la colonne.
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(4, 8);
      const s = reset(x, y + 0.5, z, COLORS.water);
      Object.assign(s, { vx: Math.cos(a) * v, vy: rand(5, 10), vz: Math.sin(a) * v, life: rand(1.2, 1.8), size: rand(0.2, 0.35), sizeEnd: 0.1, gravity: 12, drag: 0.2, water: true });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const s = reset(x, y, z, COLORS.foam);
      Object.assign(s, { vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, life: rand(2, 3), size: 0.5, sizeEnd: 1.4, drag: 1.4, shapeY: 0.15, onWater: true, water: true });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 5; i++) {
      const s = reset(x, y + 1, z, COLORS.darkSmoke);
      Object.assign(s, { vx: rand(-1, 1), vy: rand(1.5, 3), vz: rand(-1, 1), life: rand(1.5, 2.5), size: 0.6, sizeEnd: rand(1.6, 2.2), drag: 1.2 });
      this.lit.spawn(s);
    }
  }
}
