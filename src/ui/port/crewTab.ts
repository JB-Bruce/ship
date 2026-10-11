import { OFFICERS } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { effectText, officerEffect, officerPrice, starProgress, talentText, type Officer } from '../../fleet/officers';
import { typeName } from '../../shipTypes';
import { costHtml } from '../parchmentMenu';
import { resourcesHtml, type PortContext } from './portContext';

/**
 * Onglet Équipage : les candidats de la taverne de l'escale (renouvelés chaque journée), tes officiers (à bord ou à
 * terre) et leur affectation. Places : chaloupe et sloop 1, brigantin et corvette 2, frégate 3.
 */
export function crewTab(ctx: PortContext): string {
  const { crew } = ctx;
  const candidates = crew.candidates[ctx.island.id];
  const officers = [...crew.officers].sort((a, b) => Number(a.assignedTo === null) - Number(b.assignedTo === null));
  const ships = ctx.fleet.members.map((m) => `<span>${m.name} <b>${crew.aboard(m.id).length} / ${OFFICERS.slots[m.type]}</b></span>`).join('');
  return `
    <p class="subtitle">Des officiers de bord : chacun a une fonction, un talent (étoiles) et parfois un trait. Ils gagnent des étoiles quand leur navire coule des ennemis.</p>
    ${resourcesHtml(ctx)}
    <div class="footer crew-slots">${ships}</div>
    <h3 class="section">Tes officiers <span class="count">${officers.length}</span></h3>
    <div class="list">${officers.length ? officers.map((o) => officerCard(ctx, o)).join('') : '<p class="effect">Personne pour l’instant : engage des officiers ci-dessous.</p>'}</div>
    <h3 class="section">Candidats de la taverne</h3>
    <p class="effect">De nouveaux marins se présentent chaque journée.</p>
    <div class="list">${candidates.length ? candidates.map((o) => candidateCard(ctx, o)).join('') : '<p class="effect">Plus personne aujourd’hui.</p>'}</div>`;
}

/** Nom, fonction, talent et trait d'un officier, et ce qu'il apporte. */
function describe(o: Officer): string {
  const role = OFFICERS.roles[o.role];
  const trait = o.trait ? `<span class="tag">${OFFICERS.traits[o.trait].name}</span>` : '';
  const unique = o.unique ? '<span class="tag helm">Unique</span>' : '';
  return `
    <h2>${role.icon} ${o.name} <span class="stars" title="Talent">${talentText(o.talent)}</span> ${unique}</h2>
    <p>${role.name}${trait}</p>
    <p class="effect">${effectText(officerEffect(o))}</p>`;
}

function candidateCard(ctx: PortContext, o: Officer): string {
  const price = officerPrice(o);
  const disabled = ctx.state.gold < price ? ' disabled' : '';
  return `
    <div class="upgrade-card compact">
      <div class="body">${describe(o)}</div>
      <div class="buy">
        <div class="cost">${costHtml(price, 0, ctx.state.gold)}</div>
        <button data-action="recruit" data-arg="${o.id}"${disabled}>Engager</button>
      </div>
    </div>`;
}

function officerCard(ctx: PortContext, o: Officer): string {
  const ship = ctx.fleet.members.find((m) => m.id === o.assignedTo);
  const p = starProgress(o);
  // Barre de progression jusqu'à la prochaine étoile (victoires de son navire).
  const progress = p
    ? `<div class="ship-health contract" title="Victoires vers la prochaine étoile"><div style="width:${(p.done / p.needed) * 100}%"></div></div>
       <p class="effect">Prochaine étoile : ${p.done} / ${p.needed} victoires</p>`
    : '<p class="effect">Talent maximal</p>';
  const where = ship ? `À bord de <b>${ship.name}</b> (${typeName(ship.type, ship.levels.extension).toLowerCase()})` : 'À terre';
  // Navires où il peut embarquer : ceux qui ont une place libre (sauf le sien).
  const targets = ctx.fleet.members.filter((m: FleetMember) => m.id !== o.assignedTo && ctx.crew.freeSlots(m) > 0);
  const buttons = targets.map((m) => `<button data-action="assign" data-arg="${o.id}:${m.id}">→ ${m.name}</button>`).join('');
  const leave = ship ? `<button class="secondary" data-action="assign" data-arg="${o.id}:none">Débarquer</button>` : '';
  return `
    <div class="upgrade-card compact${ship ? '' : ' ashore'}">
      <div class="body">${describe(o)}<p class="effect">${where}</p>${progress}</div>
      <div class="buy crew-assign">${buttons}${leave}${!buttons && !leave ? '<span class="done">Aucune place libre</span>' : ''}</div>
    </div>`;
}
