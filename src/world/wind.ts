import * as THREE from 'three';
import { WIND } from '../config';

/** Vent : direction et force dérivent lentement (sommes de sinus lents, donc sans à-coups). */
export class Wind {
  /** Direction vers laquelle souffle le vent (rad, même convention que les caps : 0 = vers +Z / nord). */
  direction = 0;
  /** Force relative : 1 = WIND.referenceKnots nœuds. */
  strength = 0.6;
  /** Plage de force (nœuds) imposée par le temps qu'il fait, réglée par Weather. */
  minKnots: number = WIND.clearKnots[0];
  maxKnots: number = WIND.clearKnots[1];
  private time = Math.random() * 1000;
  private readonly baseDirection = Math.random() * Math.PI * 2;

  constructor() {
    this.update(0);
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    this.direction = this.baseDirection + 0.9 * Math.sin(t * 0.011) + 0.35 * Math.sin(t * 0.037 + 1.7);
    // Variation lente entre 0 et 1, placée dans la plage de force du moment.
    const variation = THREE.MathUtils.clamp(0.55 + 0.3 * Math.sin(t * 0.019) + 0.15 * Math.sin(t * 0.061 + 0.5), 0, 1);
    this.strength = THREE.MathUtils.lerp(this.minKnots, this.maxKnots, variation) / WIND.referenceKnots;
  }

  get knots(): number {
    return Math.round(this.strength * WIND.referenceKnots);
  }

  /** Multiplicateur de vitesse pour un cap donné : vent arrière = plus vite, vent de face = plus lent (davantage par gros temps). */
  speedFactor(heading: number): number {
    const effect = Math.min(WIND.effectPerStrength * this.strength, WIND.maxEffect);
    return 1 + effect * Math.cos(heading - this.direction);
  }
}
