import { SAIL, TERRITORY } from '../config';
import type { GuardPost } from '../fleet/fleet';
import type { Ship } from '../ship/ship';
import { MerchantAI } from './merchantAI';
import { seaRoute } from './seaRoute';
import { bearingTo, broadside, clearLineOfFire, nearest, steerTo } from './steering';

/** Angle d'avance sur le cercle de ronde : il vise un point un peu devant lui sur le cercle (rad). */
const ORBIT_LEAD = 0.5;
/** Au-delà de cette part du rayon de ronde (en plus du rayon), il navigue jusqu'à son poste. */
const RETURN_FACTOR = 1.8;

/**
 * Pilote d'un navire de garde : il navigue jusqu'à son poste (route en mer), y fait sa ronde sur un cercle, et attaque
 * flanc à flanc tout ennemi qui entre dans son cercle (`radius`) ; l'ennemi parti, il reprend sa ronde. La terre est
 * évitée par `steerTo`.
 */
export class GuardAI {
  state: 'travel' | 'patrol' | 'fight' = 'travel';
  private route: MerchantAI | null = null;
  private routeTo: GuardPost | null = null;
  private side = 1;
  private readonly turn = Math.random() < 0.5 ? 1 : -1;

  constructor(private readonly ship: Ship) {}

  /** L'ennemi qu'il combat, ou null. */
  target: Ship | null = null;

  update(dt: number, post: GuardPost, radius: number, ships: readonly Ship[]) {
    const g = TERRITORY.guard;
    const ship = this.ship;
    const target = nearest(ship, ships, g.engage);
    this.target = target && Math.hypot(target.position.x - post.x, target.position.z - post.z) < radius + g.engage ? target : null;
    if (this.target) {
      this.state = 'fight';
      this.route = null;
      this.side = broadside(ship, this.target, this.side, SAIL.half);
      clearLineOfFire(ship);
      return;
    }
    const patrol = radius * g.patrol;
    const d = Math.hypot(ship.position.x - post.x, ship.position.z - post.z);
    if (d > patrol * RETURN_FACTOR) {
      this.state = 'travel';
      if (!this.route || this.routeTo !== post) {
        this.route = new MerchantAI(ship, seaRoute({ x: ship.position.x, z: ship.position.z }, post), g.sail);
        this.routeTo = post;
      }
      if (this.route.update(dt)) this.route = null;
      return;
    }
    this.route = null;
    this.state = 'patrol';
    const theta = Math.atan2(ship.position.x - post.x, ship.position.z - post.z) + this.turn * ORBIT_LEAD;
    steerTo(ship, bearingTo(ship, post.x + Math.sin(theta) * patrol, post.z + Math.cos(theta) * patrol), g.patrolSail);
  }
}
