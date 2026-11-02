import { PORT, type IslandId } from '../config';
import { isHostile, type Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import { harbors } from '../world/harbors';
import { ISLAND_LIST } from '../world/island';
import type { IslandState } from './islandState';

/**
 * À quai, les navires de la flotte se réparent vite, mais seulement hors combat : aucun ennemi à moins de
 * PORT.combatRadius du port, et personne en chasse (un ennemi en chasse ou au combat, en rouge sur le radar, où
 * qu'il soit). Jamais dans un port tenu par la Marine. Renvoie l'état à afficher pour le bateau piloté abîmé au port,
 * sinon null.
 */
export function repairAtPort(dt: number, ships: readonly Ship[], leader: Ship, islands: Record<IslandId, IslandState>, enemies: readonly Enemy[]): string | null {
  let status: string | null = null;
  // Pris en chasse (ennemi en rouge sur le radar, où qu'il soit) : pas de réparation au quai.
  const hunted = enemies.some((e) => e.ship.alive && (e.ai.state === 'chase' || e.ai.state === 'engage'));
  for (const island of ISLAND_LIST) {
    if (!harbors.isOpen(island.id)) continue;
    const port = island.port;
    const inPort = (ship: Ship) => Math.hypot(ship.position.x - port.x, ship.position.z - port.z) < PORT.repairRadius;
    const threatened = ships.some(
      (s) => s.alive && isHostile(leader, s) && Math.hypot(s.position.x - port.x, s.position.z - port.z) < PORT.combatRadius,
    );
    if (!threatened && !hunted) {
      const rate = islands[island.id].repairRate;
      for (const ship of ships) {
        if (ship.faction !== 'player' || !ship.alive || !inPort(ship)) continue;
        ship.health = Math.min(ship.stats.maxHealth, ship.health + rate * ship.stats.maxHealth * dt);
      }
    }
    if (leader.alive && inPort(leader) && leader.health < leader.stats.maxHealth) {
      status = threatened ? 'Réparation suspendue : ennemis près du port' : hunted ? 'Réparation suspendue : tu es pris en chasse' : 'Réparation au quai…';
    }
  }
  return status;
}
