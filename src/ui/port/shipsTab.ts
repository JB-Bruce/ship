import { BOSSES, FLEET, OFFICERS, RANKS } from '../../config';
import { rankName, rankOf } from '../../fleet/officers';
import type { FleetMember } from '../../fleet/fleet';
import { isExtended } from '../../progression/upgrades';
import { PLAYER_SHIP_TYPES, SHIP_TYPES, typeName, type ShipType } from '../../shipTypes';
import { costHtml } from '../parchmentMenu';
import { SHIP_ICONS, shipIcon } from '../shipIcons';
import { resourcesHtml, type PortContext } from './portContext';

const MS_TO_KNOTS = 1.944;

/** Onglet Navires : achat et vente de navires, places supplémentaires dans la flotte. */
export function shipsTab(ctx: PortContext): string {
  const { gold, slots } = ctx.state;
  const members = ctx.fleet.members;
  const slotPrice = ctx.state.nextSlotPrice();
  const slotButton =
    slotPrice === null
      ? '<span class="done">Taille maximale</span>'
      : `<button data-action="slot"${gold < slotPrice ? ' disabled' : ''}>+1 place · ${costHtml(slotPrice, 0, gold)}</button>`;
  return `
    <p class="subtitle">Le chantier de la Tortue construit et rachète les navires.</p>
    ${resourcesHtml(ctx)}
    <h3 class="section">Tes navires <span class="count">${members.length} / ${slots}</span> ${slotButton}</h3>
    <div class="list">${members.map((m) => memberCard(ctx, m)).join('')}</div>
    <h3 class="section">Acheter un navire</h3>
    <div class="list">${PLAYER_SHIP_TYPES.map((t) => shopCard(ctx, t)).join('')}</div>`;
}

function memberCard(ctx: PortContext, m: FleetMember): string {
  const atHelm = m === ctx.fleet.controlled;
  const refund = { gold: Math.floor(m.spent.gold * FLEET.sellRatio), wood: Math.floor(m.spent.wood * FLEET.sellRatio) };
  const canSell = !atHelm && !m.trade && ctx.fleet.members.length > 1;
  return `
    <div class="upgrade-card compact${atHelm ? ' at-helm' : ''}">
      <div class="icon">${shipIcon(m.type, m.levels)}</div>
      <div class="body">
        <h2>${m.name} <span class="tag${isExtended(m.levels) ? ' extended' : ''}">${typeName(m.type, m.levels.extension)}</span>${atHelm ? '<span class="tag helm">À la barre</span>' : ''}${m.trade ? '<span class="tag trade">⚖ En commerce</span>' : ''}</h2>
        <p class="effect">${rankLine(m)}</p>
        <p class="effect">${officersLine(ctx, m)}</p>
        ${trophies(m)}
        <p>${atHelm ? 'On ne vend pas le navire qu’on commande.' : m.trade ? 'Rappelle-le d’abord de sa route commerciale (onglet Routes).' : 'Sa cargaison est perdue s’il est vendu (et ses officiers débarquent) : vends-la d’abord au marché.'}</p>
      </div>
      <div class="buy">
        <button class="secondary" data-action="sell" data-arg="${m.id}"${canSell ? '' : ' disabled'}>Vendre · ${costHtml(refund.gold, refund.wood) || '0 or'}</button>
      </div>
    </div>`;
}

/** « ★★ Élite · 57 victoires · Légende à 100 » */
function rankLine(m: FleetMember): string {
  const stars = rankOf(m.kills);
  const next = RANKS.levels[stars + 1];
  const nextText = next ? ` · ${next.name} à ${next.kills}` : '';
  return `${stars ? `${'★'.repeat(stars)} ` : ''}${rankName(stars)} · ${m.kills} victoire${m.kills > 1 ? 's' : ''}${nextText}`;
}

function officersLine(ctx: PortContext, m: FleetMember): string {
  const aboard = ctx.crew.aboard(m.id);
  const names = aboard.map((o) => `${OFFICERS.roles[o.role].icon} ${o.name}`).join(', ');
  return `Officiers ${aboard.length} / ${OFFICERS.slots[m.type]}${names ? ` : ${names}` : ''}`;
}

/** Pavillons des boss coulés par ce navire, chacun hissé ou retiré. */
function trophies(m: FleetMember): string {
  if (!m.trophies.length) return '';
  const buttons = m.trophies
    .map((id) => {
      const shown = !m.hiddenTrophies.has(id);
      return `<button class="choice${shown ? ' on' : ''}" data-action="trophy" data-arg="${m.id}:${id}">☠ ${BOSSES[id].name} · ${shown ? 'hissé' : 'retiré'}</button>`;
    })
    .join('');
  return `<div class="choices trophies">${buttons}</div>`;
}

function shopCard(ctx: PortContext, type: ShipType): string {
  const def = SHIP_TYPES[type];
  const s = def.stats;
  const price = ctx.island.shipPrice(def.price);
  const full = ctx.fleet.members.length >= ctx.state.slots;
  const disabled = full || !ctx.state.canAfford(price) ? ' disabled' : '';
  return `
    <div class="upgrade-card">
      <div class="icon">${SHIP_ICONS[type]}</div>
      <div class="body">
        <h2>${def.name}</h2>
        <p>${def.description}</p>
        <p class="effect">Vie ${s.maxHealth} · ${s.cannonsPerSide * 2} canons · ${Math.round(s.maxSpeed * MS_TO_KNOTS)} nœuds · cale ${def.hold}${def.canFish ? ' · pêche' : ''}</p>
      </div>
      <div class="buy">
        <div class="cost">${costHtml(price.gold, price.wood, ctx.state.gold, ctx.state.wood)}</div>
        <button data-action="buy" data-arg="${type}"${disabled}>${full ? 'Flotte pleine' : 'Acheter'}</button>
      </div>
    </div>`;
}
