import { EMBLEMS, GUNS, ISLAND_INFO, OFFICERS, TREASURE_HUNTS, type TreasureHuntId, type EmblemId, type BossId, type GunType, type IslandId, type TradeGood } from '../config';
import type { Crew } from '../fleet/crew';
import { officerPrice, type Officer } from '../fleet/officers';
import { treasures } from './treasures';
import { refit } from '../fleet/refit';
import type { Fleet, FleetMember } from '../fleet/fleet';
import { fleetStock, load, unload } from '../fleet/holds';
import type { TradeRoutes } from '../fleet/tradeRoutes';
import { SHIP_TYPES, UPGRADE_INFO, type ShipType } from '../shipTypes';
import { blueprints, revealTypes } from './blueprints';
import type { Contract, ContractOptions, Contracts } from './contracts';
import { goodText, type Good } from './goods';
import { ISLAND_UPGRADE_INFO, type IslandState, type IslandUpgradeId } from './islandState';
import type { Ledger } from './ledger';
import type { PlayerState } from './playerState';
import { gunCost } from './modifiers';
import { nextCost, type UpgradeId } from './upgrades';

export interface HarborEvents {
  say(text: string): void;
  /** Une ligne dans le fil des événements. */
  log(text: string): void;
  /** Une amélioration de l'île vient d'être construite, ou l'île vient d'être rachetée. */
  islandChanged(island: IslandState): void;
  /** Ce que les contrats peuvent demander en ce moment. */
  contractOptions(): ContractOptions;
  /** Un contrat vient d'être accepté (une mission peut commencer) ou abandonné. */
  contractAccepted(contract: Contract): void;
  contractAbandoned(contract: Contract): void;
  /** Une rumeur de trésor achetée : la chasse commence. */
  treasureRumor(id: TreasureHuntId): void;
}

/**
 * Tout ce qui se fait au port où la flotte fait escale (`island`) : chantier naval, achat et vente de navires,
 * marché, rachat et améliorations de l'île, contrats de la taverne. Le panneau du port (PortMenu) appelle ces actions.
 */
export class Harbor {
  /** Île de l'escale en cours (changée à chaque ouverture du panneau du port). */
  island: IslandState;

  constructor(
    private readonly state: PlayerState,
    private readonly fleet: Fleet,
    first: IslandState,
    private readonly contracts: Contracts,
    private readonly ledger: Ledger,
    private readonly crew: Crew,
    private readonly routes: TradeRoutes,
    private readonly events: HarborEvents,
  ) {
    this.island = first;
  }

  /** Escale à une île : sa taverne affiche ses offres et ses candidats. */
  visit(island: IslandState) {
    this.island = island;
    this.crew.fillCandidates(island.id);
    this.contracts.refresh(island.id, this.events.contractOptions());
  }

  /** Confie un navire à une route commerciale qui part d'ici. */
  startRoute(memberId: number, to: IslandId, out: Good | null, back: Good | null) {
    const member = this.fleet.members.find((m) => m.id === memberId);
    if (!member || !member.inWorld || !member.ship.alive) return;
    if (this.routes.start(member, this.island.id, to, out, back)) this.events.say(`${member.name} part commercer avec ${ISLAND_INFO[to].shortName}`);
  }

  /** Rappelle un navire en commerce dans la flotte : seulement au port de son île, s'il reste une place. */
  recallRoute(memberId: number) {
    const member = this.fleet.members.find((m) => m.id === memberId);
    if (!member || !this.routes.canRecall(member, this.island.id)) return;
    this.routes.recall(member);
    this.events.say(`${member.name} quitte sa route et rejoint la flotte`);
  }

  /** Récupère la réserve de l'île de l'escale (bois de la scierie, or des marchands). */
  collectReserve() {
    if (!this.island.owned) return;
    const taken = this.island.collect();
    if (!taken.gold && !taken.wood) return;
    this.state.earn(taken);
    this.ledger.goldEarned += taken.gold;
    this.events.say(`Réserve de l'île : +${taken.gold} or, +${taken.wood} bois`);
  }

  /** Allongement suivant du bateau piloté (frégate) : coque rallongée, nouveaux niveaux d'amélioration. */
  extendShip() {
    const member = this.fleet.controlled;
    const ext = SHIP_TYPES[member.type].extensions?.[member.levels.extension];
    if (!ext || !this.state.spend(ext.cost)) return;
    member.levels.extension++;
    member.spent.gold += ext.cost.gold;
    member.spent.wood += ext.cost.wood;
    refit(member, this.crew);
    this.ledger.shipsExtended++;
    this.events.say(`${member.name} reprend la mer en ${ext.name.toLowerCase()} !`);
    // Un gréement neuf (goélette à hunier) ne rallonge pas la coque.
    this.events.log(ext.length > 0 ? `⟷ Le chantier a allongé ${member.name} de ${ext.length} m` : `⟷ Le chantier a regréé ${member.name}`);
  }

  /** Achète le niveau suivant d'une amélioration pour le bateau piloté. */
  buyUpgrade(id: UpgradeId) {
    const member = this.fleet.controlled;
    const cost = nextCost(member.type, id, member.levels);
    if (!cost || !this.state.spend(cost)) return;
    member.levels[id]++;
    member.spent.gold += cost.gold;
    member.spent.wood += cost.wood;
    refit(member, this.crew);
    this.events.say(`Amélioration : ${UPGRADE_INFO[id].name}`);
  }

  buyShip(type: ShipType) {
    const price = this.island.shipPrice(SHIP_TYPES[type].price);
    // Les navires en commerce ne prennent pas de place dans la flotte (ils ont un emplacement dans leur île). Il faut
    // aussi le plan complet du navire.
    if (!blueprints.isUnlocked(type) || !this.island.canBuild(type) || this.fleet.hand.length >= this.state.slots || !this.state.spend(price)) return;
    const member = this.fleet.add(type, price);
    this.events.say(`${member.name} (${SHIP_TYPES[type].name}) rejoint ta flotte !`);
  }

  /** Vend un navire (sa cargaison part avec lui). */
  sellShip(member: FleetMember) {
    const refund = this.fleet.sell(member);
    if (!refund) return;
    this.state.earn(refund);
    this.crew.release(member.id);
  }

  /** Engage un candidat de la taverne de l'escale (il attend à terre son affectation). */
  recruit(id: number) {
    const candidate = this.crew.candidates[this.island.id].find((o) => o.id === id);
    if (!candidate || !this.state.spend({ gold: officerPrice(candidate), wood: 0 })) return;
    this.crew.recruit(this.island.id, id);
    this.events.say(`${candidate.name} rejoint ton équipage (${OFFICERS.roles[candidate.role].name})`);
  }

  /** Affecte un officier à un navire, ou le débarque (`memberId` null). */
  assignOfficer(officerId: number, memberId: number | null) {
    const officer = this.crew.officers.find((o) => o.id === officerId);
    if (!officer) return;
    const before = this.fleet.members.find((m) => m.id === officer.assignedTo) ?? null;
    const target = memberId === null ? null : (this.fleet.members.find((m) => m.id === memberId) ?? null);
    if (!this.crew.assign(officer, target)) return;
    for (const m of new Set([before, target])) if (m) refit(m, this.crew);
  }

  /** Type de canons d'une batterie du navire piloté : la première fois se paie, revenir à un type acheté est gratuit. */
  setGuns(battery: 'main' | 'deck', type: GunType) {
    const member = this.fleet.controlled;
    const key = `${battery}:${type}`;
    if (!member.ownedGuns.has(key)) {
      if (!this.state.spend(gunCost(member.type, battery))) return;
      member.ownedGuns.add(key);
    }
    member.guns = { ...member.guns, [battery]: type };
    refit(member, this.crew);
    this.events.say(`${member.name} : ${GUNS.types[type].name.toLowerCase()}${battery === 'deck' ? ' sur les gaillards' : ''}`);
  }

  /** Peint un emblème sur la grande voile du bateau piloté (null : l'efface) ; gratuit s'il l'a déjà eu. */
  paintEmblem(id: EmblemId | null) {
    const member = this.fleet.controlled;
    if (id === member.emblem) return;
    if (id && !treasures.emblemAvailable(id)) return;
    if (id && !member.ownedEmblems.has(id) && !treasures.isTreasureEmblem(id)) {
      if (!this.state.spend({ gold: EMBLEMS.price, wood: 0 })) return;
      member.ownedEmblems.add(id);
    }
    member.emblem = id;
    refit(member, this.crew);
    this.events.say(id ? `${member.name} arbore ${EMBLEMS.designs[id].name.toLowerCase()}` : `${member.name} : grande voile sans emblème`);
  }

  /** Hisse ou retire le pavillon d'un boss coulé par ce navire. */
  toggleTrophy(memberId: number, boss: BossId) {
    const member = this.fleet.members.find((m) => m.id === memberId);
    if (!member || !member.trophies.includes(boss)) return;
    if (member.hiddenTrophies.has(boss)) member.hiddenTrophies.delete(boss);
    else member.hiddenTrophies.add(boss);
    refit(member, this.crew);
  }

  buySlot() {
    this.state.buySlot();
  }

  /** Rachète l'île de l'escale à ceux qui la tiennent : elle t'appartient, ses améliorations deviennent possibles. */
  buyIsland() {
    const price = this.island.info.price;
    if (this.island.owned || !price || !this.state.spend(price)) return;
    this.island.owned = true;
    this.events.islandChanged(this.island);
    this.events.say(`${this.island.info.portName} est à toi !`);
  }

  buyIslandUpgrade(id: IslandUpgradeId) {
    const cost = this.island.nextCost(id);
    if (!this.island.owned || !this.island.info.upgrades.includes(id) || !cost || !this.state.spend(cost)) return;
    this.island.levels[id]++;
    this.events.islandChanged(this.island);
    this.events.say(`${ISLAND_UPGRADE_INFO[id].name} : niveau ${this.island.levels[id]}`);
  }

  /** Marché de l'île : le bois va dans la réserve commune, les marchandises dans les cales de la flotte. */
  trade(good: TradeGood, side: 'buy' | 'sell', amount: number) {
    const price = this.island.price(good);
    if (side === 'sell') {
      if (price.sell === null) return;
      const have = good === 'wood' ? this.state.wood : fleetStock(this.fleet.hand, good);
      const n = Math.min(have, amount);
      if (n <= 0) return;
      if (good === 'wood') this.state.wood -= n;
      else unload(this.fleet.hand, good, n);
      this.state.gold += n * price.sell;
      this.ledger.goldEarned += n * price.sell;
      this.ledger.goodsSold += n;
      return;
    }
    if (price.buy === null) return;
    let n = Math.min(amount, Math.floor(this.state.gold / price.buy));
    if (good === 'wood') this.state.wood += n;
    else n = load(this.fleet.hand, good, n, this.fleet.controlled);
    this.state.gold -= n * price.buy;
  }

  /** Achète la rumeur d'une chasse au trésor à la taverne de l'escale. */
  buyRumor(id: TreasureHuntId) {
    const hunt = TREASURE_HUNTS[id];
    if (!hunt || hunt.rumor.island !== this.island.id || !treasures.canStart(id)) return;
    if (!this.state.spend({ gold: hunt.rumor.price, wood: 0 })) return;
    this.events.treasureRumor(id);
  }

  acceptContract(id: number) {
    const contract = this.contracts.accept(id);
    if (!contract) return;
    this.contracts.refresh(this.island.id, this.events.contractOptions());
    this.events.contractAccepted(contract);
  }

  abandonContract(id: number) {
    const contract = this.contracts.active.find((c) => c.id === id);
    if (!contract) return;
    this.contracts.remove(contract);
    this.events.contractAbandoned(contract);
  }

  /** Touche la prime d'un contrat rempli (ou livre la marchandise commandée), à la taverne indiquée. */
  claimContract(id: number) {
    const c = this.contracts.active.find((k) => k.id === id);
    if (!c || c.claimAt !== this.island.id) return;
    if (c.kind === 'deliver' && c.good) {
      if (fleetStock(this.fleet.hand, c.good) < c.target) return;
      unload(this.fleet.hand, c.good, c.target);
      this.events.say(`Livraison : ${goodText(c.good, c.target)}`);
    } else if (!this.contracts.isDone(c)) {
      return;
    }
    this.contracts.complete(c);
    this.pay(c);
  }

  /**
   * Verse la prime d'un contrat (à la taverne, ou sur-le-champ pour une mission réussie). Une mission spéciale peut aussi
   * amener un officier unique : il est renvoyé (le message l'annonce).
   */
  pay(c: Contract): Officer | null {
    this.state.earn(c.reward);
    this.ledger.goldEarned += c.reward.gold;
    this.ledger.contractsDone++;
    const officer = c.special ? this.crew.grantUnique(c.special) : null;
    const joins = officer ? ` — ${officer.name} rejoint ton équipage !` : '';
    this.events.say(`Prime touchée : ${revealTypes(c.title)} (+${c.reward.gold} or${c.reward.wood ? `, +${c.reward.wood} bois` : ''})${joins}`);
    return officer;
  }
}
