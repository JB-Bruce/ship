import { ALLEGIANCE_NAMES, ISLAND_INFO, type IslandUpgradeId } from '../../config';
import { ISLAND_UPGRADE_INFO } from '../../progression/islandState';
import { COIN_ICON, pipsHtml, priceHtml, tip, WOOD_ICON } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { BUILDING_ICONS } from './buildingIcons';

const have = (ctx: PortContext) => ({ gold: ctx.state.gold, wood: ctx.state.wood });

/** En tête : allégeance et propriétaire, réparation au quai, fort ; les ressources de l'île en bulle. */
export function islandFactsHtml(ctx: PortContext): string {
  const { island } = ctx;
  const info = island.info;
  const fort = island.fortArmament;
  const owner = `${ALLEGIANCE_NAMES[island.owned ? 'pirate' : info.allegiance]} · ${island.owned ? 'à toi' : info.holders}`;
  return `
    <span class="hm-chip"${tip(`Ressources : ${info.resources.join(', ')}`)}>${owner}</span>
    <span class="hm-chip"${tip('Part de la vie rendue chaque seconde aux navires à quai')}>Réparation ${Math.round(island.repairRate * 100)} %/s</span>
    <span class="hm-chip"${tip(info.fort.name)}>${fort.guns} canons · ${fort.range} m</span>`;
}

/** Le bâtiment choisi : ce qu'il fait, son niveau, l'effet du suivant et sa construction. */
export function buildingHtml(ctx: PortContext, id: IslandUpgradeId, fresh: number): string {
  const { island } = ctx;
  const level = island.levels[id];
  const max = island.maxLevel(id);
  const cost = island.nextCost(id);
  const now = level > 0 ? `<div class="hm-effect"><span>Maintenant</span>${island.describe(id, level)}</div>` : '';
  const next = cost ? `<div class="hm-effect next"><span>Niveau ${level + 1}</span>${island.describe(id, level + 1)}</div>` : '';
  let action: string;
  if (!island.owned) action = '<span class="hm-note">Rachète l’île pour y construire.</span>';
  else if (!cost) action = '<span class="hm-done">Niveau maximal</span>';
  else {
    const short = !ctx.state.canAfford(cost);
    action = `<button class="kit-btn hm-build${short ? ' dim' : ''}" data-action="build" data-arg="${id}">${level ? 'Agrandir' : 'Construire'} ${priceHtml(cost, have(ctx))}</button>`;
  }
  return `
    <div class="hm-card hm-building">
      <div class="hm-building-head">${BUILDING_ICONS[id]}<h2>${ISLAND_UPGRADE_INFO[id].name}</h2>${pipsHtml(level, max, fresh)}</div>
      <p>${ISLAND_UPGRADE_INFO[id].description}</p>
      ${now}${next}
      ${action}
    </div>`;
}

/** La réserve de l'île : or des marchands alliés et bois de la scierie, à récupérer. */
export function reserveHtml(ctx: PortContext): string {
  const { island } = ctx;
  const r = island.reserve;
  const sawmill = island.info.upgrades.includes('workshop') ? ` · Scierie : ${island.levels.workshop > 0 ? island.describe('workshop', island.levels.workshop) : 'pas encore construite'}` : '';
  const why = `Marchands : ${island.tradeText(island.tradeLevel)}${sawmill}`;
  const empty = !r.gold && !r.wood;
  return `
    <div class="hm-card hm-reserve" data-reserve>
      <svg class="hm-chest" viewBox="0 0 70 56" aria-hidden="true"><path d="M6 22h58v30H6zM6 22C6 6 64 6 64 22M30 30h10v10H30z"/></svg>
      <div class="hm-reserve-body">
        <b${tip(why)}>Réserve de l’île</b>
        <span>${empty ? 'Vide pour l’instant' : `${COIN_ICON}${r.gold} · ${WOOD_ICON}${r.wood}`}</span>
      </div>
      <button class="kit-btn${empty ? ' dim' : ''}" data-action="collect">Récupérer</button>
    </div>`;
}

/** Le Mouillage : une place par emplacement de l'île, occupée par un navire en commerce ou libre. */
export function mooringHtml(ctx: PortContext): string {
  const { island, routes } = ctx;
  const homed = routes.homedAt(island.id);
  const places = Array.from({ length: Math.max(island.tradeSlots, homed.length) }, (_, i) => {
    const m = homed[i];
    if (!m) return '<div class="hm-berth free">Place libre<small>Comptoir : « Tracer une route »</small></div>';
    const order = m.trade!;
    const recall = routes.fleetHasRoom
      ? `<button class="kit-btn small ghost" data-action="route-recall" data-arg="${m.id}">Reprendre</button>`
      : `<small${tip('Il faut une place libre dans ta flotte')}>Flotte pleine</small>`;
    return `<div class="hm-berth" data-berth="${m.id}"${tip(routes.status(m))}><b>${m.name}</b><small>vers ${ISLAND_INFO[order.ports[1]].shortName}</small>${recall}</div>`;
  });
  return `
    <div class="hm-card hm-moorings">
      <b>Mouillage <small>${homed.length} / ${island.tradeSlots}</small></b>
      <div class="hm-berths">${places.join('')}</div>
    </div>`;
}

/** Rachat d'une île qui n'est pas encore à toi (ou ce qu'il en est si elle n'est pas à vendre). */
export function purchaseHtml(ctx: PortContext): string {
  const { island, state } = ctx;
  const price = island.info.price;
  if (!price) return '<div class="hm-card"><p>Cette île n’est pas à vendre.</p></div>';
  const short = !state.canAfford(price);
  return `
    <div class="hm-card hm-purchase" data-purchase>
      <h2>Racheter l’île</h2>
      <p>${island.info.holders} te cèdent l’île : son fort et son port deviennent les tiens, et tu pourras y construire.</p>
      <button class="kit-btn red hm-buy${short ? ' dim' : ''}" data-action="buy-island">Racheter ${priceHtml(price, have(ctx))}</button>
    </div>`;
}
