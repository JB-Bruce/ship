import type { BossId, EmblemId, GunType, IslandId, TradeGood, TreasureHuntId } from '../../config';
import type { Crew } from '../../fleet/crew';
import type { Fleet, FleetMember } from '../../fleet/fleet';
import type { TradeRoutes } from '../../fleet/tradeRoutes';
import type { Good } from '../../progression/goods';
import type { Contracts } from '../../progression/contracts';
import type { IslandState, IslandUpgradeId } from '../../progression/islandState';
import type { Ledger } from '../../progression/ledger';
import type { PlayerState } from '../../progression/playerState';
import type { UpgradeId } from '../../progression/upgrades';
import type { ShipType } from '../../shipTypes';

/** Les lieux du port, chacun sa vue (`PlaceMenu`), ouverts depuis les enseignes du quai. */
export type PlaceTab = 'shipyard' | 'market' | 'tavern' | 'harbormaster';
export const PLACE_TABS: readonly PlaceTab[] = ['shipyard', 'market', 'tavern', 'harbormaster'];

export type { TradeGood };

/** Actions du port, exécutées par le jeu (qui paie, range dans les cales, affiche les messages). */
export interface PortActions {
  buyUpgrade(id: UpgradeId): void;
  /** Allonge le navire piloté (frégate). */
  extendShip(): void;
  buyShip(type: ShipType): void;
  sellShip(member: FleetMember): void;
  buySlot(): void;
  /** Rachète l'île de l'escale. */
  buyIsland(): void;
  buyIslandUpgrade(id: IslandUpgradeId): void;
  /** Récupère la réserve de l'île de l'escale. */
  collectReserve(): void;
  /** `amount` : nombre d'unités, ou Infinity pour « tout » (dans la limite de ce qui est possible). */
  trade(good: TradeGood, side: 'buy' | 'sell', amount: number): void;
  acceptContract(id: number): void;
  /** Achète la rumeur d'une chasse au trésor (taverne de l'escale). */
  buyRumor(id: TreasureHuntId): void;
  abandonContract(id: number): void;
  claimContract(id: number): void;
  /** Engage un candidat de la taverne de l'escale. */
  recruit(id: number): void;
  /** Affecte un officier à un navire, ou le débarque (null). */
  assignOfficer(officerId: number, memberId: number | null): void;
  /** Type de canons d'une batterie du navire piloté. */
  setGuns(battery: 'main' | 'deck', type: GunType): void;
  paintEmblem(id: EmblemId | null): void;
  /** Hisse ou retire le pavillon d'un boss coulé. */
  toggleTrophy(memberId: number, boss: BossId): void;
  /** Confie un navire à une route commerciale entre ce port et `to` (marchandise de l'aller, du retour). */
  startRoute(memberId: number, to: IslandId, out: Good | null, back: Good | null): void;
  recallRoute(memberId: number): void;
  /** Envoie un navire pêcheur au banc le plus proche ; il revient vendre le poisson ici. */
  startFishing(memberId: number): void;
}

export interface PortContext {
  readonly state: PlayerState;
  readonly fleet: Fleet;
  /** Île de l'escale en cours. */
  readonly island: IslandState;
  readonly contracts: Contracts;
  readonly ledger: Ledger;
  readonly crew: Crew;
  readonly routes: TradeRoutes;
  readonly actions: PortActions;
}
