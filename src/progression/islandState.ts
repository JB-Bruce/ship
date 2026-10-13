import { SHIP_TYPES, type ShipType } from '../shipTypes';
import {
  CITADEL,
  FORT,
  ISLAND_INFO,
  ISLAND_TRADE,
  ISLAND_UPGRADES,
  NAVY_HOLDS,
  PORT,
  RADAR,
  ROYAL_FORT,
  type Cost,
  type IslandId,
  type IslandInfoDef,
  type IslandUpgradeId,
  type Price,
  type TradeGood,
} from '../config';

export type { IslandUpgradeId };

export const ISLAND_UPGRADE_INFO: Record<IslandUpgradeId, { name: string; description: string }> = {
  fort: { name: 'Fort', description: 'Plus de canons sur les remparts, une meilleure poudre et des boulets plus lourds.' },
  citadel: { name: 'Citadelle', description: 'Les Frères du Sabre arment de nouveaux bastions : jusqu’à 8 canons, qui portent loin.' },
  royalFort: { name: 'Fort-Royal', description: 'Tes canonniers remettent en batterie les pièces de la Marine : jusqu’à 11 canons, les plus lourds de l’archipel.' },
  shipyard: { name: 'Chantier naval', description: 'Des cales de construction et des maîtres charpentiers : le port peut bâtir des navires plus grands (brigantin et corvette, puis frégate).' },
  dock: { name: 'Quai', description: 'Des charpentiers en nombre : réparations plus rapides, navires remis à flot plus vite et moins chers.' },
  workshop: { name: 'Scierie', description: 'Les bûcherons de l’île débitent du bois de charpente, même quand tu es au large. Il attend dans la réserve de l’île.' },
  counter: { name: 'Comptoir', description: 'Des négociants s’installent au port : les marchands alliés viennent plus souvent et laissent plus d’or dans la réserve de l’île.' },
  lighthouse: { name: 'Phare', description: 'Une lanterne plus haute et des vigies : le radar porte plus loin près de l’île, et la carte montre les ennemis qui l’approchent.' },
  smuggling: { name: 'Comptoir de contrebande', description: 'Des receleurs sûrs : le marché de l’île t’achète plus cher et te vend moins cher, et plus de marchands alliés y font escale.' },
};

/** Ce qu'une sauvegarde garde d'une île. */
export interface IslandSnapshot {
  owned: boolean;
  levels: Record<IslandUpgradeId, number>;
  stock: { gold: number; wood: number };
}

/**
 * Une île : son allégeance, son marché et, si elle t'appartient, ses améliorations et sa réserve (bois de la scierie,
 * or des marchands alliés), qu'on récupère au port.
 * Les effets des améliorations sont lus ici (fort, réparation, prix…) : niveau 0 = valeurs de base.
 */
export class IslandState {
  readonly info: IslandInfoDef;
  owned: boolean;
  readonly levels: Record<IslandUpgradeId, number> = { fort: 0, citadel: 0, royalFort: 0, dock: 0, shipyard: 0, workshop: 0, counter: 0, lighthouse: 0, smuggling: 0 };
  /** Réserve en attente (fractions comprises). */
  private readonly stock = { gold: 0, wood: 0 };

  constructor(readonly id: IslandId) {
    this.info = ISLAND_INFO[id];
    this.owned = this.info.owned;
  }

  /** État à sauvegarder : allégeance, améliorations et réserve. */
  snapshot(): IslandSnapshot {
    return { owned: this.owned, levels: { ...this.levels }, stock: { ...this.stock } };
  }

  restore(s: IslandSnapshot) {
    this.owned = s.owned;
    Object.assign(this.levels, s.levels);
    Object.assign(this.stock, s.stock);
  }

  /** Tenue par la Marine : port fermé, fort ennemi. */
  get navyHeld(): boolean {
    return !this.owned && this.info.allegiance === 'navy';
  }

  /** L'île est prise à la Marine : elle t'appartient, avec ce qui est déjà bâti (arsenal). */
  capture() {
    this.owned = true;
    for (const [id, level] of Object.entries(this.info.captureLevels ?? {}) as [IslandUpgradeId, number][]) this.levels[id] = Math.max(this.levels[id], level);
  }

  /** La Marine reprend l'île : la réserve est perdue, les améliorations restent pour le jour où tu la reprendras. */
  lose() {
    this.owned = false;
    this.stock.gold = this.stock.wood = 0;
  }

  /** Butin d'une escadre repoussée, déposé dans la réserve (au-delà de sa limite). */
  addSpoils(spoils: Cost) {
    this.stock.gold += spoils.gold;
    this.stock.wood += spoils.wood;
  }

  /** Production de la scierie, dans la limite de la réserve. */
  update(dt: number) {
    const w = ISLAND_UPGRADES.workshop;
    const level = this.levels.workshop;
    if (level === 0) return;
    this.stock.wood = Math.min(this.stock.wood + (w.woodPerMinute[level - 1] * dt) / 60, w.woodPerMinute[level - 1] * w.storageMinutes);
  }

  /** Un marchand allié fait escale : son or va dans la réserve (dans sa limite). Renvoie l'or déposé. */
  deposit(): number {
    const gold = Math.max(0, Math.min(this.goldPerVisit, this.reserveCap - this.stock.gold));
    this.stock.gold += gold;
    return gold;
  }

  /** Ce qui attend dans la réserve (unités entières). */
  get reserve(): Cost {
    return { gold: Math.floor(this.stock.gold), wood: Math.floor(this.stock.wood) };
  }

  /** Vide la réserve et renvoie ce qu'on y a pris. */
  collect(): Cost {
    const taken = this.reserve;
    this.stock.gold -= taken.gold;
    this.stock.wood -= taken.wood;
    return taken;
  }

  maxLevel(id: IslandUpgradeId): number {
    return ISLAND_UPGRADES[id].costs.length;
  }

  /** Coût du prochain niveau, ou null au maximum. */
  nextCost(id: IslandUpgradeId): Cost | null {
    return ISLAND_UPGRADES[id].costs[this.levels[id]] ?? null;
  }

  /** Effet d'un niveau (1 = premier niveau), en texte pour le menu. */
  describe(id: IslandUpgradeId, level: number): string {
    const i = level - 1;
    const u = ISLAND_UPGRADES;
    switch (id) {
      case 'fort':
      case 'citadel':
      case 'royalFort':
        return `${u[id].guns[i]} canons · portée ${u[id].range[i]} m · ${u[id].damage[i]} dégâts`;
      case 'dock':
        return `Réparation ×${(u.dock.repairRate[i] / PORT.repairRate).toFixed(1)} · retour des navires −${Math.round((1 - u.dock.respawnFactor[i]) * 100)} % · navires −${Math.round(u.dock.shipDiscount[i] * 100)} %`;
      case 'shipyard': {
        const types = (Object.keys(u.shipyard.required) as ShipType[]).filter((t) => u.shipyard.required[t] === level);
        return `Construction : ${types.map((t) => SHIP_TYPES[t].name.toLowerCase()).join(', ')}`;
      }
      case 'workshop':
        return `${u.workshop.woodPerMinute[i]} bois par minute`;
      case 'counter':
        return this.tradeText(level);
      case 'lighthouse':
        return `Radar ${u.lighthouse.radarRange[i]} m à moins de ${u.lighthouse.coverage[i]} m de l'île`;
      case 'smuggling':
        return `Ventes +${Math.round(u.smuggling.sellBonus[i] * 100)} % · achats −${Math.round(u.smuggling.buyDiscount[i] * 100)} % · ${this.tradeText(level)}`;
    }
  }

  /** Marchands alliés selon le niveau du comptoir, en texte. */
  tradeText(level: number): string {
    const t = ISLAND_TRADE;
    return `un marchand toutes les ${t.interval[level]} s · ${t.goldPerVisit[level]} or par escale · réserve ${t.reserveCap[level]} or`;
  }

  /** Niveau du comptoir de l'île (comptoir de la Tortue ou comptoir de contrebande de Port-Sabre). */
  get tradeLevel(): number {
    return Math.max(this.levels.counter, this.levels.smuggling);
  }

  /** Temps entre deux marchands alliés (s). */
  get merchantInterval(): number {
    return ISLAND_TRADE.interval[this.tradeLevel];
  }

  get goldPerVisit(): number {
    return ISLAND_TRADE.goldPerVisit[this.tradeLevel];
  }

  get reserveCap(): number {
    return ISLAND_TRADE.reserveCap[this.tradeLevel];
  }

  // Effets des améliorations (niveau 0 = valeurs de base).
  private at<T>(values: readonly T[], id: IslandUpgradeId, base: T): T {
    return this.levels[id] > 0 ? values[this.levels[id] - 1] : base;
  }

  /** Armement du fort de l'île (fort de la Tortue, citadelle de Port-Sabre, fort d'une île de la Marine, Fort-Royal à toi). */
  get fortArmament(): { guns: number; range: number; damage: number } {
    const hold = NAVY_HOLDS[this.id];
    if (this.navyHeld && hold) return hold.fort;
    if (this.info.upgrades.includes('royalFort')) {
      const r = ISLAND_UPGRADES.royalFort;
      return { guns: this.at(r.guns, 'royalFort', ROYAL_FORT.guns), range: this.at(r.range, 'royalFort', ROYAL_FORT.range), damage: this.at(r.damage, 'royalFort', ROYAL_FORT.damage) };
    }
    if (this.info.upgrades.includes('citadel')) {
      const c = ISLAND_UPGRADES.citadel;
      return { guns: this.at(c.guns, 'citadel', CITADEL.guns), range: this.at(c.range, 'citadel', CITADEL.range), damage: this.at(c.damage, 'citadel', CITADEL.damage) };
    }
    const f = ISLAND_UPGRADES.fort;
    return { guns: this.at(f.guns, 'fort', FORT.guns), range: this.at(f.range, 'fort', FORT.range), damage: this.at(f.damage, 'fort', FORT.damage) };
  }

  get repairRate(): number {
    return this.at(ISLAND_UPGRADES.dock.repairRate, 'dock', PORT.repairRate);
  }

  get respawnFactor(): number {
    return this.at(ISLAND_UPGRADES.dock.respawnFactor, 'dock', 1);
  }

  /** Prix d'un navire après la remise du chantier. */
  /** Niveau de chantier naval qu'il faut pour construire `type` ici (0 : aucun). */
  shipyardFor(type: ShipType): number {
    return ISLAND_UPGRADES.shipyard.required[type] ?? 0;
  }

  /** Ce port peut-il construire `type` (chantier naval assez amélioré) ? */
  canBuild(type: ShipType): boolean {
    return this.levels.shipyard >= this.shipyardFor(type);
  }

  shipPrice(price: Cost): Cost {
    const f = 1 - this.at(ISLAND_UPGRADES.dock.shipDiscount, 'dock', 0);
    return { gold: Math.round(price.gold * f), wood: Math.round(price.wood * f) };
  }

  /** Prix du marché de l'île, après le comptoir de contrebande. */
  price(good: TradeGood): Price {
    const base = this.info.market[good];
    const s = ISLAND_UPGRADES.smuggling;
    const sell = 1 + this.at(s.sellBonus, 'smuggling', 0);
    const buy = 1 - this.at(s.buyDiscount, 'smuggling', 0);
    return {
      buy: base.buy === null ? null : Math.max(1, Math.round(base.buy * buy)),
      sell: base.sell === null ? null : Math.round(base.sell * sell),
    };
  }

  /** Zone couverte par le phare (distance à la côte, m), 0 sans phare. */
  get coverage(): number {
    return this.at(ISLAND_UPGRADES.lighthouse.coverage, 'lighthouse', 0);
  }

  /** Portée du radar pour un bateau à `coast` mètres de la côte de cette île. */
  radarRange(coast: number): number {
    return coast < this.coverage ? this.at(ISLAND_UPGRADES.lighthouse.radarRange, 'lighthouse', RADAR.range) : RADAR.range;
  }
}
