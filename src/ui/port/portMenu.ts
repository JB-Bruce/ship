import type { IslandId } from '../../config';
import type { Good } from '../../progression/goods';
import type { IslandUpgradeId } from '../../progression/islandState';
import { ParchmentMenu } from '../parchmentMenu';
import { islandTab, islandUpgradesTab } from './islandTab';
import type { PlaceTab, PortContext, PortTab, TradeGood } from './portContext';
import { pickRoute, routesTab } from './routesTab';
import { TAB_ICONS } from './tabIcons';
import { tradeTab } from './tradeTab';

/** Onglets du panneau ; le Chantier et la Taverne (`render` null) ouvrent leur propre vue (`PlaceMenu`). */
const TABS: { id: PortTab; name: string; render: ((ctx: PortContext) => string) | null }[] = [
  { id: 'island', name: 'Île', render: islandTab },
  { id: 'trade', name: 'Marché', render: tradeTab },
  { id: 'routes', name: 'Routes', render: routesTab },
  { id: 'shipyard', name: 'Chantier', render: null },
  { id: 'upgrades', name: 'Améliorations', render: islandUpgradesTab },
  { id: 'tavern', name: 'Taverne', render: null },
];

export interface PortAccess {
  /** Le bateau piloté est-il assez près du port pour y faire escale ? */
  inRange(): boolean;
  /** À l'ouverture du panneau (escale : offres de la taverne…). */
  onOpen(): void;
  /** Touche pressée loin du port. */
  refused(code: string): void;
  /** Ouvre un lieu du port qui a sa propre vue (Chantier autour du navire, Taverne). */
  openPlace(place: PlaceTab): void;
}

/**
 * Panneau du port où la flotte fait escale (P), seulement près d'un quai :
 * l'île et son allégeance (et son rachat), le marché, les routes, les améliorations de l'île (si elle t'appartient), et
 * deux lieux à part : le Chantier (`ShipyardMenu`) et la Taverne (`TavernMenu`). Le registre et les affectations des
 * officiers sont dans la Cabine (Tab).
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
    switch (action) {
      case 'tab':
        if (arg === 'shipyard' || arg === 'tavern') this.access.openPlace(arg);
        else this.tab = arg as PortTab;
        break;
      case 'buy':
      case 'sell': {
        // Marché : « marchandise:quantité ».
        const [good, amount] = arg.split(':');
        a.trade(good as TradeGood, action, Number(amount));
        break;
      }
      case 'buy-island':
        a.buyIsland();
        break;
      case 'collect':
        a.collectReserve();
        break;
      case 'island-upgrade':
        a.buyIslandUpgrade(arg as IslandUpgradeId);
        break;
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
    }
  }
}
