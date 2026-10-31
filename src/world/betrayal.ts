import { BETRAYAL } from '../config';
import type { Ship } from '../ship/ship';
import type { Enemy, EnemySpawner } from './enemySpawner';
import type { MerchantTraffic } from './merchantTraffic';
import type { PirateTraffic } from './pirateTraffic';

/**
 * Trahison : un pirate allié indépendant ou un marchand des îles, à portée de vue, passe à l'ennemi. Il est remplacé
 * par sa copie exacte dans le camp ennemi (EnemySpawner.adopt), puis retiré de son trafic sans naufrage. Jamais un
 * navire de ta flotte ni le navire escorté d'une mission (ils ne sont dans aucun des deux trafics).
 */
export class Betrayal {
  /** Alliés qu'on peut trahir en ce moment (à flot, à portée de vue), tenus à jour par refresh sans allocation. */
  readonly candidates: Ship[] = [];

  constructor(
    private readonly pirates: PirateTraffic,
    private readonly merchants: MerchantTraffic,
    private readonly spawner: EnemySpawner,
  ) {}

  /** Recense les alliés trahissables autour du navire piloté ; `visibility` : portée de la brume (m). */
  refresh(leader: Ship, visibility: number) {
    this.candidates.length = 0;
    const range = Math.min(BETRAYAL.range, visibility);
    for (const { ship } of this.pirates.pirates) this.consider(ship, leader, range);
    for (const { ship, lost } of this.merchants.merchants) if (!lost) this.consider(ship, leader, range);
  }

  /** Un pirate allié (sinon un marchand des îles) ? */
  isPirate(ship: Ship): boolean {
    return this.pirates.has(ship);
  }

  /** Fait passer `ship` à l'ennemi. Renvoie l'ennemi qui le remplace, ou null s'il n'est pas (ou plus) trahissable. */
  betray(ship: Ship): Enemy | null {
    const index = this.candidates.indexOf(ship);
    if (index < 0 || !ship.alive) return null;
    // La copie d'abord : l'original est défait par son trafic juste après.
    const enemy = this.spawner.adopt(ship);
    if (!this.pirates.release(ship)) this.merchants.release(ship);
    this.candidates.splice(index, 1);
    return enemy;
  }

  private consider(ship: Ship, leader: Ship, range: number) {
    if (ship.alive && ship.distanceTo(leader) <= range) this.candidates.push(ship);
  }
}
