import { FLEET, LOOT, type Cost } from '../config';

/** Ressources du joueur et taille maximale de sa flotte (conservées après un naufrage). */
export class PlayerState {
  gold = 0;
  wood = 0;
  /** Nombre de bateaux que la flotte peut compter. */
  slots = FLEET.startSlots;

  canAfford(cost: Cost): boolean {
    return this.gold >= cost.gold && this.wood >= cost.wood;
  }

  /** Paie `cost`. Renvoie false (sans rien prélever) si les ressources manquent. */
  spend(cost: Cost): boolean {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost.gold;
    this.wood -= cost.wood;
    return true;
  }

  earn(cost: Cost) {
    this.gold += cost.gold;
    this.wood += cost.wood;
  }

  /** Prix de la prochaine place de flotte, ou null si le maximum est atteint. */
  nextSlotPrice(): number | null {
    return this.slots < FLEET.maxSlots ? FLEET.slotPrices[this.slots - FLEET.startSlots] : null;
  }

  buySlot(): boolean {
    const price = this.nextSlotPrice();
    if (price === null || !this.spend({ gold: price, wood: 0 })) return false;
    this.slots++;
    return true;
  }

  /** Pénalité quand toute la flotte a coulé : une part de l'or est perdue. Renvoie l'or perdu. */
  loseGoldOnDeath(): number {
    const lost = Math.floor(this.gold * LOOT.deathGoldLoss);
    this.gold -= lost;
    return lost;
  }
}
