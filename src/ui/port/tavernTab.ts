import { CONTRACTS, ISLAND_INFO, type IslandId } from '../../config';
import { fleetStock } from '../../fleet/holds';
import { missionTag, starsText, type Contract, type Contracts } from '../../progression/contracts';
import type { Fleet } from '../../fleet/fleet';
import { costHtml } from '../parchmentMenu';
import { resourcesHtml, type PortContext } from './portContext';

/** Avancement d'un contrat : nombre atteint, et s'il est prêt à être payé. */
export function contractProgress(c: Contract, contracts: Contracts, fleet: Fleet): { count: number; ready: boolean } {
  if (c.kind === 'deliver' && c.good) {
    const count = Math.min(c.target, fleetStock(fleet.hand, c.good));
    return { count, ready: count >= c.target };
  }
  return { count: Math.min(c.target, c.progress), ready: contracts.isDone(c) };
}

/**
 * Onglet Taverne : contrats en cours (de toutes les tavernes) et primes à toucher, offres du jour de cette île (avec le
 * temps avant les suivantes), puis ses missions spéciales.
 */
/** Présentation de la taverne de chaque île. */
const TAVERNS: Record<IslandId, string> = {
  tortuga: 'À la taverne du Perroquet Borgne, armateurs et marchands offrent des primes aux capitaines audacieux.',
  sabre: 'À la taverne du Sabre Rouillé, les Frères du Sabre cherchent des capitaines pour leurs coups durs.',
  dauphin: 'À la cantine de l’ancien poste de garde, pêcheurs et matelots du Dauphin cherchent des capitaines pour leurs affaires.',
  royale: 'À l’Ancre Royale, ancienne cantine des officiers du roi, tes nouveaux voisins cherchent des capitaines pour tenir l’île.',
};

export function tavernTab(ctx: PortContext): string {
  const { contracts, island } = ctx;
  const full = contracts.active.length >= CONTRACTS.maxActive;
  const active = contracts.active.length
    ? contracts.active.map((c) => activeCard(ctx, c)).join('')
    : '<p class="effect">Aucun contrat en cours.</p>';
  const tavern = TAVERNS[island.id];
  return `
    <p class="subtitle">${tavern}</p>
    ${resourcesHtml(ctx)}
    <h3 class="section">Tes contrats <span class="count">${contracts.active.length} / ${CONTRACTS.maxActive}</span></h3>
    <div class="list">${active}</div>
    <h3 class="section">Offres du jour <span class="count">nouvelles à l’aube, dans ${Math.max(1, Math.ceil(contracts.dayLeft / 60))} min</span></h3>
    <div class="list">${contracts.offers[island.id].map((c) => offerCard(c, full)).join('')}</div>
    <h3 class="section">Missions spéciales</h3>
    <p class="effect">Uniques et mieux payées : une fois réussies, elles ne reviennent pas. La suivante apparaît après chaque réussite.</p>
    <div class="list">${specialsHtml(contracts, island.id, full)}</div>`;
}

function specialsHtml(contracts: Contracts, island: IslandId, full: boolean): string {
  const specials = contracts.specials(island);
  if (specials.length) return specials.map((c) => offerCard(c, full)).join('');
  return contracts.specialsFinished(island)
    ? '<p class="effect">Tu as accompli toutes les missions spéciales de cette île.</p>'
    : '<p class="effect">Termine la mission spéciale en cours pour en découvrir d’autres.</p>';
}

function reward(c: Contract): string {
  return costHtml(c.reward.gold, c.reward.wood);
}

function offerCard(c: Contract, full: boolean): string {
  const tag = c.special ? '<span class="tag">Spéciale</span> ' : '';
  return `
    <div class="upgrade-card compact${c.special ? ' special' : ''}">
      <div class="body">
        <h2>${tag}${c.title} <span class="stars" title="Difficulté">${starsText(c.stars)}</span>${missionTag(c)}</h2>
        <p>${c.description}</p>
        <p class="effect">Prime : ${reward(c)}</p>
      </div>
      <div class="buy"><button data-action="accept" data-arg="${c.id}"${full ? ' disabled' : ''}>${full ? 'Trop de contrats' : 'Accepter'}</button></div>
    </div>`;
}

function activeCard(ctx: PortContext, c: Contract): string {
  const { count, ready } = contractProgress(c, ctx.contracts, ctx.fleet);
  const delivery = c.kind === 'deliver';
  const here = c.claimAt === ctx.island.id;
  const where = here ? '' : ` · à ${ISLAND_INFO[c.claimAt].portName}`;
  const label = delivery ? 'Livrer' : ready ? 'Toucher la prime' : 'En cours';
  const progress = `${count} / ${c.target}${delivery ? ' dans tes cales' : ''}${where}`;
  const tag = c.special ? '<span class="tag">Spéciale</span> ' : '';
  return `
    <div class="upgrade-card compact${c.special ? ' special' : ''}">
      <div class="body">
        <h2>${tag}${c.title} <span class="stars" title="Difficulté">${starsText(c.stars)}</span>${missionTag(c)}</h2>
        <p>${c.description}</p>
        <div class="ship-health contract"><div style="width:${(count / c.target) * 100}%"></div></div>
        <p class="effect">${progress} · prime : ${reward(c)}</p>
      </div>
      <div class="buy">
        <button data-action="claim" data-arg="${c.id}"${ready && here ? '' : ' disabled'}>${label}</button>
        <button class="secondary" data-action="abandon" data-arg="${c.id}">Abandonner</button>
      </div>
    </div>`;
}
