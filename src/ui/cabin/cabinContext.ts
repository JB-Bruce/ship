import type { BossId, IslandId } from '../../config';
import type { Crew } from '../../fleet/crew';
import type { Fleet, FleetMember } from '../../fleet/fleet';
import type { TradeRoutes } from '../../fleet/tradeRoutes';
import type { Contract, Contracts } from '../../progression/contracts';
import type { Good } from '../../progression/goods';
import type { Ledger } from '../../progression/ledger';
import type { PlayerState } from '../../progression/playerState';
import type { UpgradeId } from '../../progression/upgrades';

/** Pages de la Cabine du capitaine. */
export type CabinPage = 'ship' | 'crew' | 'fleet' | 'log';

/** Ce que la Cabine fait faire au jeu (le port paie, la flotte change de barre…). */
export interface CabinActions {
  /** Amélioration du navire piloté : seulement à quai (la Cabine n'offre le bouton que là). */
  buyUpgrade(id: UpgradeId): void;
  /** Affecte un officier à un navire, ou le débarque (null) : partout, même en mer. */
  assignOfficer(officerId: number, memberId: number | null): void;
  takeHelm(member: FleetMember): void;
  abandonContract(id: number): void;
  /** Hisse ou retire le pavillon d'un boss coulé par ce navire. */
  toggleTrophy(memberId: number, boss: BossId): void;
}

/** Ce que la Cabine lit du jeu. */
export interface CabinContext {
  readonly state: PlayerState;
  readonly fleet: Fleet;
  readonly crew: Crew;
  readonly contracts: Contracts;
  readonly ledger: Ledger;
  readonly routes: TradeRoutes;
  readonly actions: CabinActions;
  /** Le bateau piloté est-il à quai (achats possibles) ? */
  atPort(): boolean;
  /** État d'une mission en cours (escorte, siège…), pour le Journal. */
  missionStatus(contract: Contract): string | null;
}

/** Choix en cours dans la Cabine, gardés d'une ouverture à l'autre. */
export interface CabinView {
  page: CabinPage;
  /** Navire consulté (pages Navire et Équipage). */
  memberId: number;
  /** Route en cours de modification (page Flotte) : navire, destination et marchandises choisies. */
  edit: { memberId: number; to: IslandId; out: Good | null; back: Good | null } | null;
  /** Contrat dont l'abandon attend une confirmation (second clic). */
  confirmAbandon: number | null;
}

/** Le navire consulté, ou celui qu'on pilote s'il n'existe plus (vendu). */
export function viewedMember(ctx: CabinContext, view: CabinView): FleetMember {
  return ctx.fleet.members.find((m) => m.id === view.memberId) ?? ctx.fleet.controlled;
}
