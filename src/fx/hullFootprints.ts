import type { Ship } from '../ship/ship';

/**
 * Empreintes des coques, recalculées à chaque image, pour retirer les particules qui y entrent.
 * Boîte orientée : longueur × largeur (+ une petite marge), et en hauteur jusqu'au-dessus du plat-bord.
 */
export class HullFootprints {
  private readonly boxes: { x: number; y: number; z: number; s: number; c: number; halfL: number; halfW: number }[] = [];
  private count = 0;

  update(ships: readonly Ship[]) {
    this.count = 0;
    for (const ship of ships) {
      const b = this.boxes[this.count] ?? (this.boxes[this.count] = { x: 0, y: 0, z: 0, s: 0, c: 0, halfL: 0, halfW: 0 });
      b.x = ship.position.x;
      b.y = ship.position.y;
      b.z = ship.position.z;
      b.s = Math.sin(ship.heading);
      b.c = Math.cos(ship.heading);
      b.halfL = ship.stats.length / 2 + 0.15;
      b.halfW = ship.stats.width / 2 + 0.1;
      this.count++;
    }
  }

  /**
   * La particule (x, y, z) est-elle dans une coque ? La silhouette s'affine comme une vraie coque :
   * en pointe vers la proue, plus large vers la poupe. L'écume posée sur l'eau est testée sans tenir compte de la hauteur.
   */
  readonly test = (x: number, y: number, z: number, onWater: boolean): boolean => {
    for (let i = 0; i < this.count; i++) {
      const b = this.boxes[i];
      const dx = x - b.x;
      const dz = z - b.z;
      const f = (dx * b.s + dz * b.c) / b.halfL; // -1 = poupe, 1 = proue
      if (Math.abs(f) > 1) continue;
      const taper = f > 0 ? 1 - f * f : 1 - f * f * f * f;
      if (Math.abs(dx * b.c - dz * b.s) > b.halfW * Math.sqrt(taper)) continue;
      if (onWater || (y > b.y - 1.5 && y < b.y + 3)) return true;
    }
    return false;
  };
}
