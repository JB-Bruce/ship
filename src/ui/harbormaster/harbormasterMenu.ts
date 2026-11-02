import { ISLAND_INFO, type IslandUpgradeId } from '../../config';
import { ISLAND_UPGRADE_INFO } from '../../progression/islandState';
import { playFx, type MenuFx } from '../kit/feedback';
import { cofferHtml } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { PlaceMenu } from '../port/placeMenu';
import { islandMapHtml } from './islandMap';
import { buildingHtml, islandFactsHtml, mooringHtml, purchaseHtml, reserveHtml } from './islandPanels';
import './harbormaster.css';

/**
 * Capitainerie du port : la carte de l'île (sa vraie côte) avec ses bâtiments, qu'on choisit d'un clic ; à côté, le
 * bâtiment choisi (effet, niveau, construction), la réserve de l'île et son Mouillage. Une île qui n'est pas à toi
 * montre ses bâtiments cadenassés et son rachat. Échap revient au port.
 */
export class HarbormasterMenu extends PlaceMenu {
  private fx: MenuFx = {};
  private selected: IslandUpgradeId | null = null;
  /** Pastille tout juste gagnée (coup de tampon), -1 sinon. */
  private fresh = -1;

  constructor(
    parent: HTMLElement,
    private readonly ctx: PortContext,
    back: () => void,
  ) {
    super(parent, 'Capitainerie', back);
    this.body.parentElement!.classList.add('hm-frame');
  }

  protected opened() {
    this.selected = null;
    this.fresh = -1;
  }

  render() {
    const ctx = this.ctx;
    const { island } = ctx;
    const ids = island.info.upgrades;
    if (!this.selected || !ids.includes(this.selected)) this.selected = ids[0];
    const side = island.owned
      ? `${buildingHtml(ctx, this.selected, this.fresh)}${reserveHtml(ctx)}${mooringHtml(ctx)}`
      : `${purchaseHtml(ctx)}${buildingHtml(ctx, this.selected, -1)}`;
    this.body.innerHTML = `
      <div class="hm-head"><span class="hm-title">Capitainerie de ${ISLAND_INFO[island.id].shortName}</span><span class="hm-facts">${islandFactsHtml(ctx)}</span>${cofferHtml({ gold: ctx.state.gold, wood: ctx.state.wood })}<button class="kit-btn ghost small hm-back" data-action="back">Retour au port</button></div>
      <div class="hm-main">
        <div class="hm-mapbox">${islandMapHtml(island, this.selected)}</div>
        <aside class="hm-side">${side}</aside>
      </div>`;
    const fx = this.fx;
    this.fx = {};
    this.fresh = -1;
    playFx(this.body, fx);
  }

  protected onAction(action: string, arg: string) {
    const ctx = this.ctx;
    const a = ctx.actions;
    const { island, state } = ctx;
    switch (action) {
      case 'back':
        this.setOpen(false);
        break;
      case 'pick':
        this.selected = arg as IslandUpgradeId;
        break;
      case 'build': {
        const id = arg as IslandUpgradeId;
        const level = island.levels[id];
        const cost = island.nextCost(id);
        a.buyIslandUpgrade(id);
        const pin = `[data-pin="${id}"]`;
        if (island.levels[id] > level) {
          this.fresh = level;
          this.fx = { spend: pin, glow: pin, rise: { at: pin, text: `${ISLAND_UPGRADE_INFO[id].name} : niveau ${island.levels[id]} !`, tone: 'good' } };
        } else {
          const why = cost && state.gold < cost.gold ? 'Pas assez d’or' : 'Pas assez de bois';
          this.fx = { shake: '.hm-build', rise: { at: '.hm-build', text: why, tone: 'bad' } };
        }
        break;
      }
      case 'collect': {
        const { gold, wood } = state;
        a.collectReserve();
        const got = [state.gold > gold ? `+${state.gold - gold} or` : '', state.wood > wood ? `+${state.wood - wood} bois` : ''].filter(Boolean);
        const at = '[data-reserve]';
        this.fx = got.length
          ? { earn: state.gold > gold ? at : undefined, woodIn: state.wood > wood ? at : undefined, rise: { at, text: got.join(' · '), tone: 'good' } }
          : { shake: at, rise: { at, text: 'Rien à récupérer', tone: 'bad' } };
        break;
      }
      case 'buy-island': {
        const price = island.info.price;
        a.buyIsland();
        const why = price && state.gold < price.gold ? 'Pas assez d’or' : 'Pas assez de bois';
        this.fx = island.owned
          ? { spend: '.hm-map', glow: '.hm-map', rise: { at: '.hm-map', text: 'L’île est à toi !', tone: 'good' } }
          : { shake: '.hm-buy', rise: { at: '.hm-buy', text: why, tone: 'bad' } };
        break;
      }
      case 'route-recall': {
        const member = ctx.fleet.members.find((m) => m.id === Number(arg));
        a.recallRoute(Number(arg));
        if (member && !member.trade) this.fx = { glow: '.hm-moorings', rise: { at: '.hm-moorings', text: `${member.name} rejoint ta flotte`, tone: 'good' } };
        break;
      }
    }
  }
}
