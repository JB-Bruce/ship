import { FLEET } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { blueprints, revealTypes } from '../../progression/blueprints';
import { cannonCount } from '../../progression/upgrades';
import { PLAYER_SHIP_TYPES, SHIP_TYPES, typeName, type ShipType } from '../../shipTypes';
import { pipsHtml, priceHtml, tip } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { SHIP_ICONS, shipIcon } from '../shipIcons';

const MS_TO_KNOTS = 1.944;

/** Un navire de ta flotte : sa silhouette, et sa vente (pas celui qu'on pilote ni un navire en commerce). */
function memberCard(ctx: PortContext, m: FleetMember): string {
  const atHelm = m === ctx.fleet.controlled;
  const refund = { gold: Math.floor(m.spent.gold * FLEET.sellRatio), wood: Math.floor(m.spent.wood * FLEET.sellRatio) };
  const canSell = !atHelm && !m.trade && ctx.fleet.members.length > 1;
  const why = atHelm ? 'On ne vend pas le navire qu’on commande' : m.trade ? 'Reprends-le d’abord de sa route' : 'Sa cargaison part avec lui, ses officiers débarquent';
  return `
    <div class="yard-member${atHelm ? ' here' : ''}">
      <span class="yard-member-icon">${shipIcon(m.type, m.levels)}</span>
      <span class="yard-member-body"><b>${m.name}</b><span>${typeName(m.type, m.levels.extension)}${atHelm ? ' · à la barre' : m.trade ? ' · en commerce' : ''}</span></span>
      <button class="kit-btn ghost small" data-action="sell" data-arg="${m.id}" data-sell="${m.id}"${canSell ? '' : ' disabled'}${tip(why)}>Vendre ${priceHtml(refund, refund)}</button>
    </div>`;
}

/** Un type à acheter : silhouette, nom, chiffres clés et prix ; inconnu : sa silhouette pâle et les bouts de plan. */
function shopCard(ctx: PortContext, type: ShipType): string {
  if (!blueprints.isUnlocked(type)) {
    const n = blueprints.count(type);
    const need = blueprints.needed(type);
    return `<div class="yard-shop unknown"${tip('Plan incomplet : coule des navires de cette silhouette et repêche les bouts de plan')}><span class="yard-shop-icon">${SHIP_ICONS[type]}</span><b>Navire inconnu</b>${pipsHtml(n, need)}<span class="yard-next">${n} / ${need} bouts de plan</span></div>`;
  }
  const def = SHIP_TYPES[type];
  const s = def.stats;
  const price = ctx.island.shipPrice(def.price);
  const full = ctx.fleet.hand.length >= ctx.state.slots;
  const yard = ctx.island.shipyardFor(type);
  const locked = !ctx.island.canBuild(type);
  const action = locked
    ? `<span class="yard-done locked"${tip('Améliore le chantier naval de l’île (Capitainerie)')}>Chantier niv. ${yard}</span>`
    : full
      ? `<span class="yard-done locked"${tip('Achète une place de flotte, ou vends un navire')}>Flotte pleine</span>`
      : `<button class="kit-btn yard-buy" data-action="buy" data-arg="${type}" data-buy="${type}">${priceHtml(price, { gold: ctx.state.gold, wood: ctx.state.wood })}</button>`;
  return `
    <div class="yard-shop"${tip(revealTypes(def.description))}>
      <span class="yard-shop-icon">${SHIP_ICONS[type]}</span>
      <b>${def.name}</b>
      <span class="yard-next">Vie ${s.maxHealth} · ${cannonCount(s)} canons · ${Math.round(s.maxSpeed * MS_TO_KNOTS)} nœuds · cale ${def.hold}${def.canFish ? ' · pêche' : ''}</span>
      ${action}
    </div>`;
}

/**
 * Onglet « Acheter un navire » du Chantier : ta flotte (vente) et ses places (+1), puis les navires à construire ici
 * (prix avec la remise du chantier, chantier naval requis, plans inconnus en silhouette).
 */
export function shipShop(ctx: PortContext): string {
  const slotPrice = ctx.state.nextSlotPrice();
  const have = { gold: ctx.state.gold, wood: ctx.state.wood };
  const slot =
    slotPrice === null
      ? '<span class="yard-done">Taille maximale</span>'
      : `<button class="kit-btn yard-buy" data-action="slot" data-slot>+1 place ${priceHtml({ gold: slotPrice, wood: 0 }, have)}</button>`;
  return `
    <div class="yard-market">
      <div class="yard-fleet">
        <div class="yard-head"><h2>Ta flotte</h2><span>${ctx.fleet.hand.length} / ${ctx.state.slots} places</span></div>
        ${ctx.fleet.members.map((m) => memberCard(ctx, m)).join('')}
        ${slot}
      </div>
      <div class="yard-shops">${PLAYER_SHIP_TYPES.map((t) => shopCard(ctx, t)).join('')}</div>
    </div>`;
}
