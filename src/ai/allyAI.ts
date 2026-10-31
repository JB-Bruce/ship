import { ALLY, BROADSIDE, SAIL } from '../config';
import type { CannonTarget } from '../combat/cannons';
import type { FleetOrders } from '../fleet/fleetOrders';
import { isHostile, type Ship } from '../ship/ship';
import { bearingTo, broadside, clearLineOfFire, firingRange, nearest, steerTo } from './steering';

/** Au-delà de cette distance (en plus des demi-longueurs), un ami n'est même pas examiné (m). */
const AVOID_RANGE = 45;

/**
 * Pilote d'un bateau de la flotte que le joueur ne commande pas : il tient sa place dans la formation,
 * la quitte pour attaquer les ennemis proches, puis revient (sans trop s'éloigner du bateau piloté). Plus d'ennemi à
 * portée et le bateau piloté devant un fort de la Marine : il vient le bombarder avec lui. Les ordres de la roue passent
 * avant : « Attaquer » le lance sur la cible désignée, « Rallier » le ramène à sa place sans combattre.
 */
export class AllyAI {
  state: 'follow' | 'engage' = 'follow';
  private side = 1;

  constructor(private readonly ship: Ship) {}

  /**
   * `leader` : le bateau piloté par le joueur. `slotX`, `slotZ` : la place à tenir dans la formation.
   * `ships` : tous les bateaux (les ennemis y sont repérés par leur camp). `pickup` : butin proche à aller
   * ramasser hors combat (choisi par la flotte), ou null. `orders` : les ordres de la roue (T).
   */
  update(leader: Ship, slotX: number, slotZ: number, ships: readonly Ship[], pickup: { x: number; z: number } | null = null, orders?: FleetOrders) {
    const ship = this.ship;
    const rallying = orders?.rallying ?? false;
    const target = orders?.attack ?? (!rallying && ship.distanceTo(leader) < ALLY.leash ? nearest(ship, ships, ALLY.engageRadius) : null);
    this.state = target ? 'engage' : 'follow';
    if (target) {
      this.side = broadside(ship, target, this.side, SAIL.half);
      clearLineOfFire(ship);
      this.avoidFriends(ships);
      return;
    }
    const fort = rallying ? null : this.fortUnderFire(leader);
    if (fort) {
      // Par le travers, à la distance tenue au combat, comptée depuis les murs.
      this.state = 'engage';
      this.side = broadside(ship, fort, this.side, SAIL.half, firingRange(ship) * BROADSIDE.holdFraction + (fort.radius ?? 0));
      clearLineOfFire(ship);
      this.avoidFriends(ships);
      return;
    }
    if (pickup && !rallying) {
      steerTo(ship, bearingTo(ship, pickup.x, pickup.z), SAIL.half);
      this.avoidFriends(ships);
      return;
    }

    // Écart à la place, dans le repère du chef : `ahead` > 0 = la place est devant nous, `lateral` > 0 = à bâbord.
    const dx = slotX - ship.position.x;
    const dz = slotZ - ship.position.z;
    const distance = Math.hypot(dx, dz);
    const fx = Math.sin(leader.heading);
    const fz = Math.cos(leader.heading);
    const ahead = dx * fx + dz * fz;
    const lateral = dx * fz - dz * fx;

    // En formation : proche de sa place et à peu près au même cap que le chef.
    const inFormation = distance < 25 && Math.cos(ship.heading - leader.heading) > 0.6;
    let sail: number;
    let heading: number;
    if (inFormation) {
      // Même voile que le chef, plus s'il faut rattraper, moins si on est en avance ; même cap, avec une
      // légère correction de l'écart sur le côté.
      sail = leader.controls.sail + ahead * 0.05;
      heading = leader.heading + Math.max(-0.7, Math.min(0.7, lateral * 0.08));
    } else {
      // On rejoint sa place (un peu en avance, puisque le chef avance), en gardant toujours assez de voile
      // pour pouvoir virer : un bateau arrêté ne tourne pas, et resterait planté sur la route du chef.
      heading = bearingTo(ship, slotX + leader.velocityX * 1.5, slotZ + leader.velocityZ * 1.5);
      const slotAheadOfMe = dx * Math.sin(ship.heading) + dz * Math.cos(ship.heading);
      sail = slotAheadOfMe > 20 ? SAIL.full : Math.max(ALLY.minSail, leader.controls.sail + ahead * 0.05);
    }
    steerTo(ship, heading, Math.min(SAIL.full, Math.max(0, sail)));
    this.avoidFriends(ships);
  }

  /** Le fort de la Marine que le bateau piloté bombarde, s'il en est assez près (ALLY.siegeRadius), sinon null. */
  private fortUnderFire(leader: Ship): CannonTarget | null {
    const fort = this.ship.siegeTarget;
    if (!fort || fort !== leader.siegeTarget) return null;
    return Math.hypot(leader.position.x - fort.position.x, leader.position.z - fort.position.z) < ALLY.siegeRadius ? fort : null;
  }

  /**
   * Tient un poste fixe (pêche) : s'y rend en ralentissant à l'approche, puis s'y arrête voile affalée.
   * Un bateau ne vire qu'en avançant : trop loin ou mal orienté, il garde un peu de voile pour manœuvrer.
   */
  holdStation(x: number, z: number, ships: readonly Ship[]) {
    const ship = this.ship;
    this.state = 'follow';
    const distance = Math.hypot(x - ship.position.x, z - ship.position.z);
    if (distance < ALLY.stationTolerance) {
      steerTo(ship, ship.heading, 0);
      return;
    }
    const sail = Math.min(SAIL.half, Math.max(ALLY.stationSail, distance / 40));
    steerTo(ship, bearingTo(ship, x, z), sail);
    this.avoidFriends(ships);
  }

  /**
   * Évitement : si un navire ami (dont celui du joueur) devant nous est trop proche, ou si on fonce
   * dessus (collision dans moins de ALLY.lookahead secondes), on braque pour le contourner du côté libre,
   * et on réduit la voile si on est déjà au contact. Naviguer côte à côte en formation ne déclenche rien.
   * Sans ça, un allié qui rejoint sa place de l'autre côté du chef lui fonce dedans et reste coincé.
   */
  private avoidFriends(ships: readonly Ship[]) {
    const ship = this.ship;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    let worst = 0;
    let dodgeToStarboard = false;
    let touching = false;
    for (const other of ships) {
      if (other === ship || !other.alive || isHostile(ship, other)) continue;
      const dx = other.position.x - ship.position.x;
      const dz = other.position.z - ship.position.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const contact = (ship.stats.length + other.stats.length) / 2;
      if (d > contact + AVOID_RANGE) continue;
      // 1 = droit devant nous, 0 = sur le côté : on ignore ce qui est derrière ou franchement de côté.
      const ahead = (dx * fx + dz * fz) / d;
      if (ahead < 0.15) continue;
      // Si chacun garde son cap et sa vitesse : dans combien de temps sera-t-on au plus près, et à quelle distance ?
      // Deux bateaux qui naviguent de conserve, ou qui se doublent à bonne distance, ne déclenchent rien.
      const rvx = ship.velocityX - other.velocityX;
      const rvz = ship.velocityZ - other.velocityZ;
      const v2 = rvx * rvx + rvz * rvz;
      const tClosest = v2 > 0.01 ? (dx * rvx + dz * rvz) / v2 : 0;
      const miss = Math.hypot(dx - rvx * tClosest, dz - rvz * tClosest);
      const tooClose = d < contact + 1;
      const collisionSoon = tClosest > 0 && tClosest < ALLY.lookahead && miss < contact / 2 + ALLY.clearance;
      if (!tooClose && !collisionSoon) continue;
      const threat = ahead * (tooClose ? 3 : 1 / (1 + tClosest));
      if (threat <= worst) continue;
      worst = threat;
      // L'autre est-il à bâbord (côté +X du bateau, (fz, -fx)) ? Alors on passe par tribord.
      dodgeToStarboard = dx * fz - dz * fx > 0;
      touching = tooClose;
    }
    if (worst === 0) return;
    const sail = touching ? Math.min(ship.controls.sail, ALLY.dodgeSail) : ship.controls.sail;
    steerTo(ship, ship.heading + (dodgeToStarboard ? -1 : 1), sail);
  }
}
