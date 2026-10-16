import * as THREE from 'three';
import { WORLD_EDGE } from '../config';
import type { Ship } from '../ship/ship';

const { smoothstep, lerp, clamp } = THREE.MathUtils;
const [CX, CZ] = WORLD_EDGE.center;

/** Le bord du monde (WORLD_EDGE) : un cercle au-delà duquel règne la tempête géante. */
export const worldEdge = {
  /** Profondeur dans la tempête (m) : négative en deçà du bord. */
  depth(x: number, z: number): number {
    return Math.hypot(x - CX, z - CZ) - WORLD_EDGE.radius;
  },

  /** Force de la tempête vue d'ici (0..1) : elle monte sur `approach` m avant le bord, entière au bord. */
  storm(x: number, z: number): number {
    return smoothstep(this.depth(x, z), -WORLD_EDGE.approach, 0);
  },

  /** Place libre en deçà de la limite que gardent les IA (m) : positive à l'intérieur. */
  room(x: number, z: number): number {
    return -WORLD_EDGE.margin - this.depth(x, z);
  },

  /** Ramène un point en deçà de la limite des IA, vers le centre (inchangé s'il y est déjà). */
  clampInside(x: number, z: number): { x: number; z: number } {
    const dx = x - CX;
    const dz = z - CZ;
    const d = Math.hypot(dx, dz);
    const max = WORLD_EDGE.radius - WORLD_EDGE.margin;
    if (d <= max) return { x, z };
    return { x: CX + (dx / d) * max, z: CZ + (dz / d) * max };
  },

  /** Direction (normalisée) vers le centre du monde, depuis (x, z) : le chemin le plus court hors de la tempête. */
  inward(x: number, z: number, out: { x: number; z: number }) {
    const d = Math.hypot(CX - x, CZ - z) || 1;
    out.x = (CX - x) / d;
    out.z = (CZ - z) / d;
    return out;
  },
};

/**
 * La foudre de la tempête du bord : chaque navire passé le bord est frappé, d'autant plus souvent qu'il s'enfonce
 * (WORLD_EDGE.strikeInterval) ; il n'est plus visé dès qu'il repasse en deçà. `strike` : effets et dégâts (Game).
 */
export class EdgeStorm {
  /** Délai avant le prochain coup, pour chaque navire dans la tempête. */
  private readonly timers = new Map<Ship, number>();

  constructor(private readonly strike: (ship: Ship) => void) {}

  update(dt: number, ships: readonly Ship[]) {
    for (const ship of this.timers.keys()) if (!ship.alive || worldEdge.depth(ship.position.x, ship.position.z) <= 0) this.timers.delete(ship);
    for (const ship of ships) {
      if (!ship.alive) continue;
      const depth = worldEdge.depth(ship.position.x, ship.position.z);
      if (depth <= 0) continue;
      const left = (this.timers.get(ship) ?? WORLD_EDGE.firstStrike) - dt;
      if (left > 0) {
        this.timers.set(ship, left);
        continue;
      }
      this.strike(ship);
      const [atEdge, deep] = WORLD_EDGE.strikeInterval;
      this.timers.set(ship, lerp(atEdge, deep, clamp(depth / WORLD_EDGE.band, 0, 1)));
    }
  }
}
