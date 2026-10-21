import { ISLAND_INFO, type IslandId } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { freeSpace } from '../../fleet/holds';
import type { Good } from '../../progression/goods';
import { COIN_ICON, tip } from '../kit/kit';
import { knownPorts, portLabel, type MarketContext } from './marketContext';
import { GOOD_LABELS } from './marketStall';

/** La route qu'on trace : destination (choisie sur la carte), navire, marchandise de l'aller et du retour ('none' : à vide). */
export interface RoutePlan {
  to: IslandId | null;
  ship: number | null;
  out: Good | 'none' | null;
  back: Good | 'none' | null;
}

const goodName = (g: Good | null) => (g ? GOOD_LABELS[g].toLowerCase() : 'à vide');
const places = (n: number) => (n > 1 ? `${n} places libres` : n === 1 ? '1 place libre' : 'aucune place libre');

/** Navires qu'on peut confier au commerce : ceux de la flotte à flot, sauf celui qu'on pilote. */
export function routeShips(ctx: MarketContext): FleetMember[] {
  return ctx.fleet.hand.filter((m) => m !== ctx.fleet.controlled && m.inWorld && m.ship.alive);
}

/** Pourquoi on ne peut pas tracer de route d'ici (null : on peut). */
export function planBlocker(ctx: MarketContext): string | null {
  if (!ctx.island.owned) return 'Seules tes îles arment des routes : le navire y prend un emplacement.';
  if (ctx.routes.freeSlots(ctx.island.id) <= 0) return 'Mouillage plein : reprends un navire, ou agrandis le Mouillage.';
  if (!routeShips(ctx).length) return 'Il te faut un autre navire à flot que celui que tu pilotes.';
  if (!knownPorts(ctx).length) return 'Aucun autre port connu : explore l’archipel.';
  return null;
}

/** Complète le plan : premier navire, marchandises les plus rentables. */
export function fillPlan(ctx: MarketContext, plan: RoutePlan) {
  if (!plan.to) return;
  const here = ctx.island.id;
  const ships = routeShips(ctx);
  if (!ships.some((m) => m.id === plan.ship)) plan.ship = ships[0]?.id ?? null;
  const best = (from: IslandId, to: IslandId, current: Good | 'none' | null) => {
    const goods = ctx.routes.goods(from, to);
    if (current && (current === 'none' || goods.includes(current))) return current;
    const margin = (g: Good) => ctx.routes.margin(g, from, to) ?? -Infinity;
    const top = [...goods].sort((x, y) => margin(y) - margin(x))[0];
    return top && margin(top) > 0 ? top : 'none';
  };
  plan.out = best(here, plan.to, plan.out);
  plan.back = best(plan.to, here, plan.back);
}

/** Le panneau des routes : celles en cours, l'emplacement de l'île, et la route qu'on trace. */
export function routePanelHtml(ctx: MarketContext, plan: RoutePlan | null): string {
  return plan ? planHtml(ctx, plan) : listHtml(ctx);
}

function listHtml(ctx: MarketContext): string {
  const traders = ctx.fleet.members.filter((m) => m.trade);
  const cards = traders.length ? traders.map((m) => routeCard(ctx, m)).join('') : '<p class="mk-muted">Aucun navire ne commerce pour toi.</p>';
  const here = ctx.island;
  const mooring = here.owned
    ? `<span class="mk-mooring">Mouillage de ${ISLAND_INFO[here.id].shortName} : ${places(ctx.routes.freeSlots(here.id))} sur ${here.tradeSlots}</span>`
    : '<span class="mk-mooring"></span>';
  const blocker = planBlocker(ctx);
  const button = blocker
    ? `<span class="mk-blocked">${blocker}</span>`
    : '<button class="kit-btn mk-trace" data-action="route-plan">Tracer une route</button>';
  return `<div class="mk-route-list">${cards}</div>${mooring}${button}`;
}

/** Une route en cours : où elle va, ce qu'elle porte, où en est le navire, et sa reprise (au port de son île). */
function routeCard(ctx: MarketContext, m: FleetMember): string {
  const order = m.trade!;
  const [home, dest] = order.ports;
  const estimate = ctx.routes.estimate(m, order.ports, order.goods);
  const recall =
    home !== ctx.island.id
      ? `<span class="mk-muted"${tip('Arrêter ou modifier de loin : Cabine du capitaine (Tab), page Flotte')}>À reprendre à ${ISLAND_INFO[home].shortName}</span>`
      : ctx.routes.fleetHasRoom
        ? `<button class="kit-btn small ghost" data-action="route-recall" data-arg="${m.id}">Reprendre</button>`
        : `<span class="mk-muted"${tip('Il faut une place libre dans ta flotte')}>Flotte pleine</span>`;
  return `
    <div class="mk-route-card" data-route="${m.id}">
      <b>${m.name} : ${portLabel(home)} ⇄ ${portLabel(dest)}</b>
      <span>Aller : ${goodName(order.goods[0])} · retour : ${goodName(order.goods[1])} · ≈ ${COIN_ICON}${estimate}</span>
      <span class="mk-muted">${order.returning ? 'Rejoint ta flotte après la vente au prochain port' : ctx.routes.status(m)}</span>
      <div class="mk-route-foot">${recall}</div>
    </div>`;
}

function planHtml(ctx: MarketContext, plan: RoutePlan): string {
  const here = ctx.island.id;
  const cancel = '<button class="kit-btn ghost small" data-action="route-cancel">Annuler</button>';
  if (!plan.to)
    return `<div class="mk-plan"><b>Nouvelle route depuis ${ISLAND_INFO[here].shortName}</b><p class="mk-step">Clique sur la carte le port où l’envoyer.</p>${cancel}</div>`;
  const to = plan.to;
  const choice = (field: string, value: string, label: string, on: boolean, hint = '') =>
    `<button class="kit-btn small${on ? ' on' : ''}" data-action="route-pick" data-arg="${field}:${value}"${hint ? tip(hint) : ''}>${label}</button>`;
  const ships = routeShips(ctx)
    .map((m) => choice('ship', String(m.id), m.name, m.id === plan.ship, `${freeSpace(m)} places libres dans sa cale`))
    .join('');
  const goods = (field: 'out' | 'back', from: IslandId, dest: IslandId, current: Good | 'none' | null) =>
    [
      ...ctx.routes.goods(from, dest).map((g) => {
        const margin = ctx.routes.margin(g, from, dest) ?? 0;
        return choice(field, g, `${GOOD_LABELS[g]} <small>${margin >= 0 ? '+' : ''}${margin}</small>`, g === current, `Gain par unité : achat à ${ISLAND_INFO[from].shortName}, vente à ${ISLAND_INFO[dest].shortName}`);
      }),
      choice(field, 'none', 'À vide', current === 'none'),
    ].join('');
  const ship = ctx.fleet.members.find((m) => m.id === plan.ship);
  const good = (g: Good | 'none' | null) => (g && g !== 'none' ? g : null);
  const estimate = ship ? ctx.routes.estimate(ship, [here, to], [good(plan.out), good(plan.back)]) : 0;
  const empty = !good(plan.out) && !good(plan.back);
  return `
    <div class="mk-plan">
      <b>${portLabel(here)} ⇄ ${portLabel(to)}</b>
      <div class="mk-field"><span>Navire</span><div class="mk-choices">${ships}</div></div>
      <div class="mk-field"><span>Aller</span><div class="mk-choices">${goods('out', here, to, plan.out)}</div></div>
      <div class="mk-field"><span>Retour</span><div class="mk-choices">${goods('back', to, here, plan.back)}</div></div>
      <div class="mk-estimate"${tip('Cale pleine, aux prix d’aujourd’hui. Les achats se paient au départ de chaque port.')}>≈ ${COIN_ICON}<b>${estimate}</b> par aller-retour</div>
      <div class="mk-plan-foot">${cancel}<button class="kit-btn" data-action="route-start"${empty || !ship ? ' disabled' : ''}>Envoyer ${ship?.name ?? ''}</button></div>
    </div>`;
}
