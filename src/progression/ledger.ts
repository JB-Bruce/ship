import type { BossId } from '../config';
import type { ShipType } from '../shipTypes';

/** Registre du capitaine : tout ce qui s'est passé depuis le début de la partie (onglet Registre du port). */
export class Ledger {
  /** Ennemis coulés par type (élites et boss compris). */
  readonly sunk: Partial<Record<ShipType, number>> = {};
  elites = 0;
  /** Pavillons pris à chaque boss (trophées). */
  readonly bossFlags: Partial<Record<BossId, number>> = {};
  /** Or gagné : butin, ventes, primes, réserves des îles. */
  goldEarned = 0;
  fishCaught = 0;
  /** Marchandises vendues au port (unités). */
  goodsSold = 0;
  contractsDone = 0;
  /** Navires allongés au chantier. */
  shipsExtended = 0;
  /** Escales des marchands alliés dans tes îles. */
  merchantVisits = 0;
  /** Bénéfice des routes commerciales (ventes moins achats). */
  tradeProfit = 0;
  /** Navires de ta flotte qui ont sombré. */
  shipsLost = 0;

  get totalSunk(): number {
    return Object.values(this.sunk).reduce((sum, n) => sum + n, 0);
  }

  recordSunk(type: ShipType, elite: boolean, boss: BossId | null) {
    this.sunk[type] = (this.sunk[type] ?? 0) + 1;
    if (elite) this.elites++;
    if (boss) this.bossFlags[boss] = (this.bossFlags[boss] ?? 0) + 1;
  }
}
