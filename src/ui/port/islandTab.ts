import { ALLEGIANCE_NAMES } from '../../config';
import { ISLAND_UPGRADE_INFO, type IslandUpgradeId } from '../../progression/islandState';
import { costHtml } from '../parchmentMenu';
import { islandInSentence, resourcesHtml, type PortContext } from './portContext';
import { traderCard } from './routesTab';

const ICONS: Record<IslandUpgradeId, string> = {
  fort: `<svg viewBox="0 0 48 48"><path d="M8 44V16h6v-6h6v6h8v-6h6v6h6v28z"/><path d="M20 44v-9a4 4 0 0 1 8 0v9M14 24h4M30 24h4"/></svg>`,
  dock: `<svg viewBox="0 0 48 48"><path d="M3 30h42M8 30v12M20 30v12M32 30v12M44 30v12"/><path d="M12 30l4-12h18l4 12M25 18V5M25 7l10 5-10 4"/></svg>`,
  workshop: `<svg viewBox="0 0 48 48"><circle cx="16" cy="30" r="10"/><path d="M16 20v20M6 30h20M9 23l14 14M23 23L9 37"/><path d="M30 14c6-4 12 0 14 4-2 4-8 8-14 4l-4 3v-14z"/></svg>`,
  shipyard: `<svg viewBox="0 0 48 48"><path d="M4 32h40l-6 8H10z"/><path d="M10 32V14l14-8 14 8v18M10 14h28M17 32V20M24 32V20M31 32V20"/></svg>`,
  lighthouse: `<svg viewBox="0 0 48 48"><path d="M18 44l3-28h6l3 28zM17 16h14M20 16l1-6h6l1 6M24 10V6"/><path d="M8 10l8 3M40 10l-8 3M6 18h8M42 18h-8"/></svg>`,
  citadel: `<svg viewBox="0 0 48 48"><path d="M4 44V22l6-4 6 4V14h6V8h4v6h6v8l6-4 6 4v22z"/><path d="M20 44v-8a4 4 0 0 1 8 0v8M9 30h4M35 30h4M22 22h4"/></svg>`,
  counter: `<svg viewBox="0 0 48 48"><path d="M24 6v32M12 42h24M6 12h36"/><path d="M6 12L2 24h8zM42 12l-4 12h8z"/><path d="M2 24a4 3 0 0 0 8 0M38 24a4 3 0 0 0 8 0"/><circle cx="24" cy="6" r="2"/></svg>`,
  royalFort: `<svg viewBox="0 0 48 48"><path d="M24 4l6 10h12l-6 10 6 10H30l-6 10-6-10H6l6-10-6-10h12z"/><path d="M18 26l2-6 4 3 4-3 2 6zM18 29h12"/></svg>`,
  smuggling: `<svg viewBox="0 0 48 48"><path d="M8 20h32v22H8z"/><path d="M8 28h32M24 20v22M14 20l4-10h12l4 10"/><circle class="solid" cx="36" cy="10" r="3"/></svg>`,
  moorings: `<svg viewBox="0 0 48 48"><circle cx="24" cy="9" r="4"/><path d="M24 13v29M15 20h18M8 30c2 8 9 12 16 12s14-4 16-12M8 30l-3 4M8 30l4 3M40 30l3 4M40 30l-4 3"/></svg>`,
};

/** Onglet Île : allégeance, propriétaire, ressources, production et services du port. */
export function islandTab(ctx: PortContext): string {
  const { island } = ctx;
  const info = island.info;
  const fort = island.fortArmament;
  const fortName = info.fort.noun.charAt(0).toUpperCase() + info.fort.noun.slice(1);
  return `
    <p class="subtitle">${info.description}</p>
    ${resourcesHtml(ctx)}
    <div class="island-facts">
      <div><span>Allégeance</span><b>${ALLEGIANCE_NAMES[island.owned ? 'pirate' : info.allegiance]}</b></div>
      <div><span>Propriétaire</span><b>${island.owned ? 'Toi' : info.holders}</b></div>
      <div><span>Ressources</span><b>${info.resources.join(', ')}</b></div>
      <div><span>Réparation à quai</span><b>${Math.round(island.repairRate * 100)} % de la vie par seconde</b></div>
      <div><span>${fortName}</span><b>${fort.guns} canons · portée ${fort.range} m</b></div>
    </div>
    ${purchase(ctx)}
    ${moorings(ctx)}`;
}

/** Mouillage d'une île à toi : ses emplacements de navires en commerce, et ceux qui y ont le leur. */
function moorings(ctx: PortContext): string {
  const { island, routes } = ctx;
  if (!island.owned) return '';
  const homed = routes.homedAt(island.id);
  const list = homed.length ? homed.map((m) => traderCard(ctx, m)).join('') : '<p class="effect">Aucun navire en commerce n’a son emplacement ici : envoie-en un depuis l’onglet Routes.</p>';
  return `
    <h3 class="section">Mouillage <span class="count">${homed.length} / ${island.tradeSlots} emplacements</span></h3>
    <div class="list">${list}</div>`;
}

/** Onglet Améliorations de l'île (seulement si elle t'appartient). */
export function islandUpgradesTab(ctx: PortContext): string {
  return `
    <p class="subtitle">${capitalize(islandInSentence(ctx))} t’appartient : investis dans ses défenses et sa production.</p>
    ${resourcesHtml(ctx)}
    <div class="list">${ctx.island.info.upgrades.map((id) => card(ctx, id)).join('')}</div>`;
}

/** Rachat de l'île (si elle est à vendre), ou sa réserve si elle t'appartient. */
function purchase(ctx: PortContext): string {
  const { island, state } = ctx;
  if (island.owned) return reserve(ctx);
  const price = island.info.price;
  if (!price) return '';
  return `
    <h3 class="section">Racheter l’île</h3>
    <div class="upgrade-card">
      <div class="icon">${ICONS.citadel}</div>
      <div class="body">
        <h2>${island.info.portName}</h2>
        <p>${island.info.holders} te cèdent l’île : sa citadelle et son port deviennent les tiens, et tu pourras y investir.</p>
        <p class="effect">Débloque : ${island.info.upgrades.map((id) => ISLAND_UPGRADE_INFO[id].name).join(', ')}</p>
      </div>
      <div class="buy"><div class="cost">${costHtml(price.gold, price.wood, state.gold, state.wood)}</div>
        <button data-action="buy-island"${state.canAfford(price) ? '' : ' disabled'}>Racheter</button></div>
    </div>`;
}

/** Réserve de l'île : or des marchands alliés et bois de la scierie, à récupérer. */
function reserve(ctx: PortContext): string {
  const { island } = ctx;
  const r = island.reserve;
  const sawmill = island.levels.workshop;
  const wood = island.info.upgrades.includes('workshop')
    ? `<p class="effect">Scierie : ${sawmill > 0 ? island.describe('workshop', sawmill) : 'pas encore construite'}</p>`
    : '';
  return `
    <h3 class="section">Réserve de l’île</h3>
    <div class="upgrade-card">
      <div class="icon">${ICONS.counter}</div>
      <div class="body">
        <h2>${r.gold} or · ${r.wood} bois</h2>
        <p>Les marchands alliés qui font escale ici y laissent de l’or ; la scierie y entrepose son bois.</p>
        <p class="effect">Marchands : ${island.tradeText(island.tradeLevel)}</p>
        ${wood}
      </div>
      <div class="buy"><button data-action="collect"${r.gold || r.wood ? '' : ' disabled'}>Récupérer</button></div>
    </div>`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function card(ctx: PortContext, id: IslandUpgradeId): string {
  const { island, state } = ctx;
  const level = island.levels[id];
  const max = island.maxLevel(id);
  const cost = island.nextCost(id);
  const pips = Array.from({ length: max }, (_, i) => `<span class="pip${i < level ? ' on' : ''}"></span>`).join('');
  const effect = cost ? `Niveau ${level + 1} : ${island.describe(id, level + 1)}` : `Niveau maximal : ${island.describe(id, level)}`;
  const buy = cost
    ? `<div class="buy"><div class="cost">${costHtml(cost.gold, cost.wood, state.gold, state.wood)}</div>
        <button data-action="island-upgrade" data-arg="${id}"${state.canAfford(cost) ? '' : ' disabled'}>Construire</button></div>`
    : '<div class="buy"><span class="done">Terminé</span></div>';
  return `
    <div class="upgrade-card${cost ? '' : ' maxed'}">
      <div class="icon">${ICONS[id]}</div>
      <div class="body">
        <h2>${ISLAND_UPGRADE_INFO[id].name} <span class="pips">${pips}</span></h2>
        <p>${ISLAND_UPGRADE_INFO[id].description}</p>
        <p class="effect">${effect}</p>
      </div>
      ${buy}
    </div>`;
}
