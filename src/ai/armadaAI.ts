import { CONTRACTS, ENEMIES, SAIL } from '../config';
import type { Ship } from '../ship/ship';
import type { FlotillaSlot } from './enemyAI';
import type { Waypoint } from './seaRoute';
import { bearingTo, broadside, nearest, steerTo } from './steering';

/** Ce que l'armada partage : en route ou non, son chef du moment, l'ennemi qu'elle va chercher. */
export interface ArmadaOrders {
  /** En route vers l'escadre ennemie (sinon : au rendez-vous, ancre jetée). */
  readonly sailing: boolean;
  /** Le premier de ses navires encore à flot. */
  readonly leader: Ship;
  /** Le navire ennemi le plus proche du chef, ou null s'il n'en reste plus. */
  readonly objective: Waypoint | null;
}

/**
 * Pilote d'un navire d'une armada pirate (aide au combat). Il ne fait que remplir `ship.controls`. Un ennemi à portée
 * d'engagement : bordées, sans jamais fuir (la bataille se gagne ou se perd). Sinon, au rendez-vous, il tient sa place,
 * voiles carguées ; en route, il suit le chef à sa place dans le V, et le chef met le cap sur l'escadre ennemie.
 */
export class ArmadaAI {
  private side = 1;

  constructor(
    private readonly ship: Ship,
    /** Sa place au rendez-vous. */
    private readonly post: Waypoint,
  ) {}

  /** `slot` : sa place derrière le chef (null pour le chef lui-même). */
  update(ships: readonly Ship[], orders: ArmadaOrders, slot: FlotillaSlot | null) {
    const ship = this.ship;
    const b = CONTRACTS.battle;
    const enemy = nearest(ship, ships, b.engageRange);
    if (enemy) {
      this.side = broadside(ship, enemy, this.side, SAIL.half);
      return;
    }
    if (!orders.sailing) {
      // Au rendez-vous : il regagne sa place, puis attend, voiles carguées.
      const gap = Math.hypot(this.post.x - ship.position.x, this.post.z - ship.position.z);
      if (gap > b.holdRadius) steerTo(ship, bearingTo(ship, this.post.x, this.post.z), SAIL.half);
      else steerTo(ship, ship.heading, 0);
      return;
    }
    const leader = orders.leader;
    if (slot && leader !== ship) {
      this.follow(leader, slot);
      return;
    }
    // Le chef ne met pas toute sa toile : ses suiveurs doivent pouvoir le rattraper.
    if (orders.objective) steerTo(ship, bearingTo(ship, orders.objective.x, orders.objective.z), b.cruiseSail);
    else steerTo(ship, ship.heading, SAIL.half);
  }

  /** Sa place dans le V, derrière le chef : plus de voile pour la rattraper, l'allure du chef une fois dessus. */
  private follow(leader: Ship, { side, back }: FlotillaSlot) {
    const fx = Math.sin(leader.heading);
    const fz = Math.cos(leader.heading);
    // Bâbord du chef en coordonnées monde : (fz, -fx).
    const tx = leader.position.x - fx * back + fz * side;
    const tz = leader.position.z - fz * back - fx * side;
    const gap = Math.hypot(tx - this.ship.position.x, tz - this.ship.position.z);
    const tolerance = ENEMIES.flotilla.slotTolerance;
    const heading = gap > tolerance ? bearingTo(this.ship, tx, tz) : leader.heading;
    const cruise = CONTRACTS.battle.cruiseSail;
    steerTo(this.ship, heading, Math.min(SAIL.full, Math.max(SAIL.half, cruise + (gap - tolerance) / 40)));
  }
}

/** Place du k-ième suiveur (k ≥ 1) dans le V, derrière le chef (même tracé que les flottilles de la Marine). */
export function armadaSlot(k: number): FlotillaSlot {
  const s = ENEMIES.flotilla.spacing;
  const rank = Math.ceil(k / 2);
  return { side: (k % 2 === 1 ? 1 : -1) * s * 0.8 * rank, back: s * rank };
}
