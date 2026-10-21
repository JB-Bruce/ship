import type { BossId, EmblemId, GunType, IslandId } from '../../config';
import type { Good } from '../../progression/goods';
import type { IslandUpgradeId } from '../../progression/islandState';
import type { UpgradeId } from '../../progression/upgrades';
import type { ShipType } from '../../shipTypes';
import { ParchmentMenu } from '../parchmentMenu';
import { crewTab } from './crewTab';
import { islandTab, islandUpgradesTab } from './islandTab';
import type { PortContext, PortTab, TradeGood } from './portContext';
import { pickRoute, routesTab } from './routesTab';
import { TAB_ICONS } from './tabIcons';
import { tavernTab } from './tavernTab';
import { tradeTab } from './tradeTab';

/** Onglets du panneau ; le Chantier (`render` null) ouvre sa propre vue, autour du navire en 3D. */
const TABS: { id: PortTab; name: string; render: ((ctx: PortContext) => string) | null }[] = [
  { id: 'island', name: 'Île', render: islandTab },
  { id: 'trade', name: 'Marché', render: tradeTab },
  { id: 'routes', name: 'Routes', render: routesTab },
  { id: 'shipyard', name: 'Chantier', render: null },
  { id: 'crew', name: 'Équipage', render: crewTab },
  { id: 'upgrades', name: 'Améliorations', render: islandUpgradesTab },
  { id: 'tavern', name: 'Taverne', render: tavernTab },
];

export interface PortAccess {
  /** Le bateau piloté est-il assez près du port pour y faire escale ? */
  inRange(): boolean;
  /** À l'ouverture du panneau (escale : offres de la taverne…). */
  onOpen(): void;
  /** Touche pressée loin du port. */
  refused(code: string): void;
  /** Ouvre le Chantier (vue autour du navire). */
  openShipyard(): void;
}

/**
 * Panneau du port où la flotte fait escale (P), seulement près d'un quai :
 * l'île et son allégeance (et son rachat), le marché, les routes, les améliorations de l'île (si elle t'appartient), la
 * taverne, et le Chantier (sa propre vue : `ShipyardMenu`). Le registre est dans le Journal de la Cabine (Tab).
 */
export class PortMenu extends ParchmentMenu {
  private tab: PortTab = 'island';

  constructor(
    parent: HTMLElement,
    private readonly ctx: PortContext,
    private readonly access: PortAccess,
  ) {
    super(parent, ctx.island.info.portName, 'P ou Échap pour reprendre la mer · Tab : Cabine du capitaine', ['KeyP']);
    this.body.parentElement!.classList.add('port-sheet');
  }

  /** Ouvre le panneau sur un onglet (bouton à l'écran, touche P…). */
  openOn(tab: PortTab = this.tab) {
    if (!this.access.inRange()) return;
    this.tab = tab;
    this.access.onOpen();
    this.setOpen(true);
  }

  protected toggle(code: string) {
    if (this.isOpen) this.setOpen(false);
    else if (this.access.inRange()) this.openOn(this.tab);
    else this.access.refused(code);
  }

  render() {
    this.setTitle(this.ctx.island.info.portName);
    const tabs = TABS.filter((t) => t.id !== 'upgrades' || this.ctx.island.owned);
    const bar = tabs
      .map((t) => `<button class="choice${t.id === this.tab ? ' on' : ''}" data-action="tab" data-arg="${t.id}">${TAB_ICONS[t.id]}${t.name}</button>`)
      .join('');
    const current = tabs.find((t) => t.id === this.tab && t.render) ?? tabs[0];
    this.body.innerHTML = `<div class="choices port-tabs">${bar}</div>${current.render!(this.ctx)}`;
  }

  protected onAction(action: string, arg: string) {
    const a = this.ctx.actions;
    const member = this.ctx.fleet.members.find((m) => String(m.id) === arg);
    switch (action) {
      case 'tab':
        if (arg === 'shipyard') this.access.openShipyard();
        else this.tab = arg as PortTab;
        break;
      case 'upgrade':
        a.buyUpgrade(arg as UpgradeId);
        break;
      case 'extend':
        a.extendShip();
        break;
      case 'buy':
      case 'sell': {
        // Marché : « marchandise:quantité » ; chantier : un type de navire.
        const [good, amount] = arg.split(':');
        if (amount !== undefined) a.trade(good as TradeGood, action, Number(amount));
        else if (action === 'buy') a.buyShip(arg as ShipType);
        else if (member) a.sellShip(member);
        break;
      }
      case 'slot':
        a.buySlot();
        break;
      case 'buy-island':
        a.buyIsland();
        break;
      case 'collect':
        a.collectReserve();
        break;
      case 'island-upgrade':
        a.buyIslandUpgrade(arg as IslandUpgradeId);
        break;
      case 'accept':
        a.acceptContract(Number(arg));
        break;
      case 'abandon':
        a.abandonContract(Number(arg));
        break;
      case 'claim':
        a.claimContract(Number(arg));
        break;
      case 'recruit':
        a.recruit(Number(arg));
        break;
      case 'assign': {
        // « officier:navire », ou « officier:none » pour le débarquer.
        const [officer, target] = arg.split(':');
        a.assignOfficer(Number(officer), target === 'none' ? null : Number(target));
        break;
      }
      case 'emblem':
        a.paintEmblem(arg === 'none' ? null : (arg as EmblemId));
        break;
      case 'guns': {
        const [battery, type] = arg.split(':');
        a.setGuns(battery as 'main' | 'deck', type as GunType);
        break;
      }
      case 'route-pick':
        pickRoute(arg);
        break;
      case 'route-start': {
        // « navire:destination:aller:retour », 'none' = à vide.
        const [ship, to, out, back] = arg.split(':');
        const good = (g: string) => (g === 'none' ? null : (g as Good));
        a.startRoute(Number(ship), to as IslandId, good(out), good(back));
        break;
      }
      case 'route-recall':
        a.recallRoute(Number(arg));
        break;
      case 'trophy': {
        const [ship, boss] = arg.split(':');
        a.toggleTrophy(Number(ship), boss as BossId);
        break;
      }
    }
  }
}
