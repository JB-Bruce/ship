import type { BossId } from '../config';
import { LEDGER } from '../config';
import type { Ship } from '../ship/ship';
import type { ShipType } from '../shipTypes';

/** Ce qu'une sauvegarde garde du registre. */
export interface LedgerSnapshot {
  sunk: Partial<Record<ShipType, number>>;
  bossFlags: Partial<Record<BossId, number>>;
  elites: number;
  goldEarned: number;
  fishCaught: number;
  goodsSold: number;
  contractsDone: number;
  shipsExtended: number;
  merchantVisits: number;
  tradeProfit: number;
  shipsLost: number;
  distanceSailed: number;
}

/** Registre du capitaine : tout ce qui s'est passé depuis le début de la partie (Journal de la Cabine). */
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
  /** Distance parcourue à la barre, avec le bateau que tu pilotes (m). */
  distanceSailed = 0;
  /** Dernière position connue du bateau piloté (pour mesurer la distance), ou null. */
  private lastShip: Ship | null = null;
  private lastX = 0;
  private lastZ = 0;

  /** État à sauvegarder (tout le registre). */
  snapshot(): LedgerSnapshot {
    const { elites, goldEarned, fishCaught, goodsSold, contractsDone, shipsExtended, merchantVisits, tradeProfit, shipsLost, distanceSailed } = this;
    return { sunk: { ...this.sunk }, bossFlags: { ...this.bossFlags }, elites, goldEarned, fishCaught, goodsSold, contractsDone, shipsExtended, merchantVisits, tradeProfit, shipsLost, distanceSailed };
  }

  restore(s: LedgerSnapshot) {
    const { sunk, bossFlags, ...counts } = s;
    Object.assign(this.sunk, sunk);
    Object.assign(this.bossFlags, bossFlags);
    Object.assign(this, counts);
  }

  get totalSunk(): number {
    return Object.values(this.sunk).reduce((sum, n) => sum + n, 0);
  }

  /**
   * Ajoute le chemin fait par le bateau piloté depuis l'image précédente. Un changement de barre, une réapparition ou
   * un saut (plus de LEDGER.maxStep m d'un coup) ne compte pas.
   */
  logSailing(ship: Ship) {
    const { x, z } = ship.position;
    const step = Math.hypot(x - this.lastX, z - this.lastZ);
    if (ship === this.lastShip && ship.alive && step < LEDGER.maxStep) this.distanceSailed += step;
    this.lastShip = ship;
    this.lastX = x;
    this.lastZ = z;
  }

  recordSunk(type: ShipType, elite: boolean, boss: BossId | null) {
    this.sunk[type] = (this.sunk[type] ?? 0) + 1;
    if (elite) this.elites++;
    if (boss) this.bossFlags[boss] = (this.bossFlags[boss] ?? 0) + 1;
  }
}
