import type * as THREE from 'three';
import { COLORS, rand, reset } from './particleKit';
import type { ParticleSystem } from './particles';

/** Effets de mer forte : paquets de mer sur l'étrave (grosse tempête). */
export class SeaSpray {
  constructor(private readonly lit: ParticleSystem) {}

  /**
   * Paquet de mer : une crête déferle par-dessus l'étrave. Gerbe projetée vers le haut et vers l'arrière, sur
   * toute la largeur du pont (ces gouttes-là ont le droit de survoler la coque). `fx, fz` : direction de la proue.
   */
  wash(p: THREE.Vector3, fx: number, fz: number, width: number) {
    for (let i = 0; i < 30; i++) {
      const side = rand(-0.5, 0.5) * width;
      const s = reset(p.x + fz * side, p.y + 0.3, p.z - fx * side, i % 3 ? COLORS.water : COLORS.foam);
      const back = rand(2, 6);
      const out = side * rand(0.6, 1.4);
      Object.assign(s, { vx: -fx * back + fz * out, vy: rand(4, 8), vz: -fz * back - fx * out, life: rand(0.8, 1.3), size: rand(0.15, 0.32), sizeEnd: 0.06, gravity: 9, drag: 0.4 });
      this.lit.spawn(s);
    }
  }
}
