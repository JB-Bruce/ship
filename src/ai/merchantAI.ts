import { MERCHANT } from '../config';
import type { Ship } from '../ship/ship';
import { Wander } from './seaRoute';
import { bearingTo, steerTo } from './steering';

/** À moins de cette distance d'une étape de sa route, le marchand passe à la suivante (m). */
const WAYPOINT_REACHED = 45;

/**
 * Pilote d'un navire marchand (escorté, ou qui commerce avec tes îles) : il suit sa route d'étape en étape (le cap ondule un peu), à mi-voile (pour que
 * la flotte puisse l'accompagner), sans jamais attaquer (ses canons se défendent seuls). La terre est évitée par `steerTo`.
 */
export class MerchantAI {
  private index = 0;
  private readonly wander = new Wander();

  constructor(
    private readonly ship: Ship,
    private readonly route: readonly { x: number; z: number }[],
    private readonly sail = MERCHANT.sail,
  ) {}

  /** Distance restant jusqu'au bout de la route (m). */
  get remaining(): number {
    let d = 0;
    let from: { x: number; z: number } = this.ship.position;
    for (let i = this.index; i < this.route.length; i++) {
      d += Math.hypot(this.route[i].x - from.x, this.route[i].z - from.z);
      from = this.route[i];
    }
    return d;
  }

  /** Renvoie true une fois arrivé au bout de la route (il s'y arrête). */
  update(dt: number): boolean {
    const last = this.route.length - 1;
    const p = this.route[this.index];
    const d = Math.hypot(p.x - this.ship.position.x, p.z - this.ship.position.z);
    if (this.index === last && d < MERCHANT.arrival) {
      steerTo(this.ship, this.ship.heading, 0);
      return true;
    }
    if (this.index < last && d < WAYPOINT_REACHED) this.index++;
    const next = this.route[this.index];
    const wander = this.index < last ? this.wander.update(dt) : 0;
    steerTo(this.ship, bearingTo(this.ship, next.x, next.z) + wander, this.sail);
    return false;
  }
}
