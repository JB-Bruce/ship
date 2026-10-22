import { CONTRACTS, ISLAND_INFO, OFFICERS, type IslandId } from '../../config';
import { effectText, officerPrice, roleEffect, type Officer } from '../../fleet/officers';
import { revealTypes } from '../../progression/blueprints';
import { MISSION_TYPES, missionType, type Contract } from '../../progression/contracts';
import { contractProgress } from '../contractProgress';
import { COIN_ICON, gaugeHtml, priceHtml, skullsHtml, starsHtml, tip, WOOD_ICON } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { missionIcon } from './missionIcons';
import { POSTER_ART } from './posterArt';

/** Nom de la taverne de chaque île, et qui y offre des contrats (bulle du titre). */
export const TAVERNS: Record<IslandId, { name: string; about: string }> = {
  tortuga: { name: 'Le Perroquet Borgne', about: 'Armateurs et marchands y offrent des primes aux capitaines audacieux.' },
  sabre: { name: 'Le Sabre Rouillé', about: 'Les Frères du Sabre y cherchent des capitaines pour leurs coups durs.' },
  dauphin: { name: 'La Cantine du Dauphin', about: 'Pêcheurs et matelots de l’ancien poste de garde y cherchent des capitaines.' },
  royale: { name: 'L’Ancre Royale', about: 'Dans l’ancienne cantine des officiers du roi, tes nouveaux voisins cherchent des capitaines.' },
};

const MAX_STARS = 5;
/** Inclinaison des affiches (degrés), tirée de leur numéro pour rester la même d'un rendu à l'autre. */
const TILTS = [-4, 3, -2, 4, -3, 2];

const reward = (c: Contract) => `<span class="tav-reward">${c.reward.gold ? `${COIN_ICON}${c.reward.gold}` : ''}${c.reward.wood ? ` ${WOOD_ICON}${c.reward.wood}` : ''}</span>`;

/** Une affiche : son genre, sa silhouette, son titre, ses sceaux (étoiles) et sa prime ; la description en bulle. */
function poster(c: Contract, full: boolean): string {
  const type = missionType(c);
  const why = full ? `Tu as déjà ${CONTRACTS.maxActive} contrats : termine ou abandonne-en un` : revealTypes(c.description);
  return `
    <button class="tav-poster ${type}${c.special ? ' special' : ''}${full ? ' full' : ''}" style="--tilt:${TILTS[c.id % TILTS.length]}deg" data-action="accept" data-arg="${c.id}" data-poster="${c.id}"${tip(why)}>
      <span class="tav-pin"></span>
      ${c.special ? '<span class="tav-ribbon">Mission spéciale</span>' : ''}
      <span class="tav-kind">${missionIcon(type)}${MISSION_TYPES[type].name}</span>
      <svg class="tav-art" viewBox="0 0 150 60" aria-hidden="true"><path d="${POSTER_ART[type]}"/></svg>
      <b class="tav-title">${revealTypes(c.title)}</b>
      <span class="tav-seals">${skullsHtml(c.stars, MAX_STARS)}</span>
      ${reward(c)}
    </button>`;
}

/** Le tableau : les offres du jour de cette taverne et ses missions spéciales. */
export function boardHtml(ctx: PortContext): string {
  const { contracts, island } = ctx;
  const full = contracts.active.length >= CONTRACTS.maxActive;
  const posters = [...contracts.offers[island.id], ...contracts.specials(island.id)];
  const empty = contracts.specialsFinished(island.id) ? 'Plus aucune affiche pour aujourd’hui.' : 'Plus d’affiche pour l’instant : reviens à l’aube.';
  return posters.length ? posters.map((c) => poster(c, full)).join('') : `<p class="tav-empty">${empty}</p>`;
}

/** Tes contrats : avancement, où toucher la prime (ou livrer), et l'abandon en deux clics. */
export function slotsHtml(ctx: PortContext, confirm: number | null): string {
  const { contracts, island } = ctx;
  const slots = Array.from({ length: CONTRACTS.maxActive }, (_, i) => {
    const c = contracts.active[i];
    if (!c) return '<div class="tav-slot empty">Place libre : arrache une affiche</div>';
    const type = missionType(c);
    const { count, ready } = contractProgress(c, contracts, ctx.fleet);
    const here = c.claimAt === island.id;
    const delivery = c.kind === 'deliver';
    const action =
      ready && here
        ? `<button class="kit-btn tav-claim" data-action="claim" data-arg="${c.id}" data-claim="${c.id}">${delivery ? 'Livrer' : 'Toucher la prime'}</button>`
        : `<span class="tav-where">${ready ? `Prime à ${ISLAND_INFO[c.claimAt].portName}` : delivery ? `${count} / ${c.target} dans tes cales` : `${count} / ${c.target}`}</span>`;
    return `
      <div class="tav-slot${ready ? ' ready' : ''}" data-slot="${c.id}">
        <div class="tav-slot-head"><span class="tav-slot-kind ${type}">${missionIcon(type)}${MISSION_TYPES[type].name}</span>${skullsHtml(c.stars, MAX_STARS)}<button class="tav-drop${confirm === c.id ? ' sure' : ''}" data-action="abandon" data-arg="${c.id}"${tip(confirm === c.id ? 'Clique encore pour abandonner' : 'Abandonner ce contrat')}>${confirm === c.id ? 'Sûr ?' : '×'}</button></div>
        <b>${revealTypes(c.title)}</b>
        ${gaugeHtml(count / c.target, 'mission')}
        <div class="tav-slot-foot">${reward(c)}${action}</div>
      </div>`;
  });
  return slots.join('');
}

/** Ce qu'apporte un officier par sa fonction (son trait est montré à part, sur sa carte). */
function effects(o: Officer): string {
  return effectText(roleEffect(o));
}

/** Les candidats de la taverne : fonction, talent, trait et prix d'engagement. */
export function recruitsHtml(ctx: PortContext): string {
  const list = ctx.crew.candidates[ctx.island.id];
  if (!list.length) return '<p class="tav-empty">Plus personne aujourd’hui.</p>';
  return list
    .map((o) => {
      const price = officerPrice(o);
      return `
        <button class="tav-recruit" data-action="recruit" data-arg="${o.id}" data-recruit="${o.id}"${tip(`${o.name} : ${effects(o)}`)}>
          <span class="tav-medal">${OFFICERS.roles[o.role].icon}</span>
          <b>${OFFICERS.roles[o.role].name}</b>
          ${starsHtml(o.talent, OFFICERS.maxTalent)}
          ${o.trait ? `<span class="tav-trait">${OFFICERS.traits[o.trait].name}</span><span class="tav-trait-fx">${effectText(OFFICERS.traits[o.trait].effect)}</span>` : ''}
          ${priceHtml({ gold: price, wood: 0 }, { gold: ctx.state.gold, wood: ctx.state.wood })}
        </button>`;
    })
    .join('');
}
