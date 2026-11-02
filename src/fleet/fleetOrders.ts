import { ORDERS } from '../config';
import { nearest } from '../ai/steering';
import type { Ship } from '../ship/ship';

/**
 * Ordres donnés à la flotte depuis la roue (T) : « Attaquer » (tous les suiveurs sur un même ennemi, jusqu'à ce qu'il
 * coule ou s'éloigne trop) et « Rallier » (ils rompent le combat et reprennent leur place un moment). Les suiveurs les
 * lisent dans `AllyAI.update`.
 */
export class FleetOrders {
  /** L'ennemi désigné par « Attaquer », ou null. */
  attack: Ship | null = null;
  /** Temps qui reste au ralliement (s). */
  private rallyLeft = 0;

  /** `ships` : tous les bateaux du monde (liste partagée), où sont cherchés les ennemis. */
  constructor(private readonly ships: readonly Ship[]) {}

  get rallying(): boolean {
    return this.rallyLeft > 0;
  }

  /** L'ennemi qu'« Attaquer » désignerait : le plus proche du bateau piloté, à portée, ou null. */
  candidate(leader: Ship): Ship | null {
    return nearest(leader, this.ships, ORDERS.attackRange);
  }

  /** Désigne l'ennemi le plus proche du bateau piloté. Renvoie la cible, ou null s'il n'y en a pas à portée. */
  attackNearest(leader: Ship): Ship | null {
    this.attack = this.candidate(leader);
    if (this.attack) this.rallyLeft = 0;
    return this.attack;
  }

  rally() {
    this.attack = null;
    this.rallyLeft = ORDERS.rallyTime;
  }

  /** L'attaque cesse quand la cible a coulé ou s'est trop éloignée du bateau piloté ; le ralliement s'écoule. */
  update(dt: number, leader: Ship) {
    this.rallyLeft = Math.max(0, this.rallyLeft - dt);
    const target = this.attack;
    if (target && (!target.alive || target.distanceTo(leader) > ORDERS.attackLeash)) this.attack = null;
  }
}
