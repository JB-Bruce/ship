import { ISLAND_INFO, type IslandId, type TradeGood } from '../../config';
import { fleetHold } from '../../fleet/holds';
import type { Good } from '../../progression/goods';
import { playFx, type MenuFx } from '../kit/feedback';
import { cofferHtml } from '../kit/kit';
import { PlaceMenu } from '../port/placeMenu';
import type { MarketContext } from './marketContext';
import { GOOD_LABELS, holdSnapshot, holdsHtml, stallHtml, stockOf, type HoldSnapshot } from './marketStall';
import { fillPlan, planBlocker, routePanelHtml, type RoutePlan } from './routePanel';
import { routeMapHtml } from './routeMap';
import './market.css';

/**
 * Comptoir du port : l'étal (une caisse par marchandise, achat et vente en un clic, les pièces volent entre le coffre et
 * la caisse), les cales de la flotte (les parts glissent à chaque échange) et les routes commerciales sur une petite
 * carte des terres découvertes : « Tracer une route », clic sur le port de destination, navire et marchandises, puis
 * « Envoyer » (un petit navire parcourt la nouvelle route). Échap revient au port.
 */
export class MarketMenu extends PlaceMenu {
  private fx: MenuFx = {};
  /** Cales avant le dernier échange (les parts glissent jusqu'au nouveau contenu). */
  private before: HoldSnapshot | null = null;
  private plan: RoutePlan | null = null;
  /** Navire dont la route vient d'ouvrir. */
  private fresh: number | null = null;
  /** Listes qui défilent : elles gardent leur position d'un rendu à l'autre. */
  private static readonly SCROLLERS = ['.mk-plan', '.mk-holds', '.mk-route-list'];

  constructor(
    parent: HTMLElement,
    private readonly ctx: MarketContext,
    back: () => void,
  ) {
    super(parent, 'Comptoir', back);
    this.body.parentElement!.classList.add('mk-frame');
  }

  protected opened() {
    this.plan = null;
    this.fresh = null;
    this.before = null;
  }

  render() {
    const ctx = this.ctx;
    const hold = fleetHold(ctx.fleet.hand);
    const scrolls = MarketMenu.SCROLLERS.map((s) => this.body.querySelector(s)?.scrollTop ?? 0);
    this.body.innerHTML = `
      <div class="mk-head"><span class="mk-title">Comptoir de ${ISLAND_INFO[ctx.island.id].shortName}</span><span class="mk-sub">Prix de l’île · ${hold.capacity - hold.used} places libres dans tes cales</span>${cofferHtml({ gold: ctx.state.gold, wood: ctx.state.wood })}<button class="kit-btn ghost small mk-back" data-action="back">Retour au port</button></div>
      <div class="mk-main">
        <div class="mk-left">
          <div class="mk-stall">${stallHtml(ctx)}</div>
          <div class="mk-holds"><h2>Cales de la flotte</h2>${holdsHtml(ctx, this.before)}</div>
        </div>
        <aside class="mk-routes${this.plan?.to ? ' ready' : ''}">
          <h2>Routes commerciales</h2>
          ${routeMapHtml(ctx, { picking: !!this.plan, planTo: this.plan?.to ?? null, fresh: this.fresh })}
          ${routePanelHtml(ctx, this.plan)}
        </aside>
      </div>`;
    MarketMenu.SCROLLERS.forEach((s, i) => {
      const list = this.body.querySelector(s);
      if (list) list.scrollTop = scrolls[i];
    });
    const fx = this.fx;
    this.fx = {};
    this.before = null;
    this.fresh = null;
    // Ce qui luit (la route qui vient d'ouvrir) doit être en vue.
    if (fx.glow) this.body.querySelector(fx.glow)?.scrollIntoView({ block: 'nearest' });
    playFx(this.body, { ...fx, bars: true });
  }

  protected onAction(action: string, arg: string) {
    const a = this.ctx.actions;
    switch (action) {
      case 'back':
        this.setOpen(false);
        break;
      case 'buy':
      case 'sell': {
        const [good, amount] = arg.split(':');
        this.trade(good as TradeGood, action, Number(amount));
        break;
      }
      case 'route-plan':
        if (!planBlocker(this.ctx)) this.plan = { to: null, ship: null, out: null, back: null };
        break;
      case 'route-to':
        if (!this.plan) break;
        this.plan.to = arg as IslandId;
        this.plan.out = this.plan.back = null;
        fillPlan(this.ctx, this.plan);
        break;
      case 'route-pick': {
        if (!this.plan) break;
        const [field, value] = arg.split(':');
        if (field === 'ship') this.plan.ship = Number(value);
        else if (field === 'out' || field === 'back') this.plan[field] = value as Good | 'none';
        fillPlan(this.ctx, this.plan);
        break;
      }
      case 'route-cancel':
        this.plan = null;
        break;
      case 'route-start':
        this.start();
        break;
      case 'route-recall': {
        const member = this.ctx.fleet.members.find((m) => m.id === Number(arg));
        a.recallRoute(Number(arg));
        if (member && !member.trade) this.fx = { glow: '.mk-holds', rise: { at: '.mk-holds h2', text: `${member.name} rejoint ta flotte`, tone: 'good' } };
        break;
      }
    }
  }

  /** Achat ou vente à l'étal : les pièces volent, le chiffre s'envole, les cales glissent ; refusé, la caisse tremble. */
  private trade(good: TradeGood, side: 'buy' | 'sell', amount: number) {
    const ctx = this.ctx;
    const crate = `[data-crate="${good}"]`;
    const gold = ctx.state.gold;
    const stock = stockOf(ctx, good);
    this.before = holdSnapshot(ctx);
    ctx.actions.trade(good, side, amount);
    const moved = Math.abs(stockOf(ctx, good) - stock);
    const label = GOOD_LABELS[good].toLowerCase();
    if (!moved) {
      this.before = null;
      const price = ctx.island.price(good);
      const why = side === 'sell' ? 'Rien à vendre' : price.buy !== null && gold < price.buy ? 'Pas assez d’or' : 'Cales pleines';
      this.fx = { shake: crate, rise: { at: crate, text: why, tone: 'bad' } };
      return;
    }
    const wood = good === 'wood';
    this.fx =
      side === 'buy'
        ? { spend: crate, woodIn: wood ? crate : undefined, rise: { at: crate, text: `+${moved} ${label}`, tone: 'good' } }
        : { earn: crate, woodOut: wood ? crate : undefined, rise: { at: crate, text: `+${ctx.state.gold - gold} or`, tone: 'good' } };
  }

  /** Envoie le navire choisi sur la route tracée : elle s'ouvre sur la carte et son petit navire la parcourt. */
  private start() {
    const plan = this.plan;
    if (!plan?.to || plan.ship === null) return;
    const good = (g: Good | 'none' | null) => (g && g !== 'none' ? g : null);
    this.ctx.actions.startRoute(plan.ship, plan.to, good(plan.out), good(plan.back));
    const member = this.ctx.fleet.members.find((m) => m.id === plan.ship);
    if (!member?.trade) return;
    this.plan = null;
    this.fresh = member.id;
    const card = `[data-route="${member.id}"]`;
    this.fx = { glow: card, rise: { at: card, text: 'Route ouverte !', tone: 'good' } };
  }
}
