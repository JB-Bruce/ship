import { OFFICERS } from '../../config';
import { effectText, roleEffect, starProgress, type Officer } from '../../fleet/officers';
import { gaugeHtml, starsHtml, tip } from '../kit/kit';
import { viewedMember, type CabinContext, type CabinView } from './cabinContext';
import { deckArt } from './deckArt';
import type { ShipType } from '../../shipTypes';

/** Hauteur de la page Équipage par unité de longueur du navire (px) : un navire long a un pont plus haut. */
const DECK_HEIGHT_PER_RATIO = 112;

/** Fond de la page Équipage : le pont du navire vu de dessus, à sa forme (deckArt.ts). */
function deckStyle(type: ShipType, extension: number): string {
  const { svg, ratio } = deckArt(type, extension);
  return `background-image:url(&quot;data:image/svg+xml,${encodeURIComponent(svg)}&quot;);min-height:${Math.round(ratio * DECK_HEIGHT_PER_RATIO)}px`;
}

/** Talent maximal d'un officier (étoiles affichées). */
const MAX_TALENT = OFFICERS.maxTalent;

/** Médaillon d'un officier : l'icône de sa fonction. */
const medal = (o: Officer) => `<span class="cabin-medal">${OFFICERS.roles[o.role].icon}</span>`;

/** Ce qu'apporte un officier : sa fonction, puis son trait. */
function effects(o: Officer): string {
  const trait = o.trait ? OFFICERS.traits[o.trait] : null;
  return effectText(roleEffect(o)) + (trait ? ` · ${trait.name} : ${effectText(trait.effect)}` : '');
}

/**
 * Page Équipage : les postes d'officiers du navire consulté (pleins ou libres), puis tous les officiers de la flotte, à
 * faire monter à bord ou à débarquer, même en mer. Le recrutement se fait à la Taverne. `fresh` : l'officier qui vient
 * de changer de navire (il « atterrit » à son poste).
 */
export function crewPage(ctx: CabinContext, view: CabinView, fresh: number | null): string {
  const m = viewedMember(ctx, view);
  const { crew } = ctx;
  const aboard = crew.aboard(m.id);
  const slots = OFFICERS.slots[m.type];
  const posts = Array.from({ length: slots }, (_, i) => {
    const o = aboard[i];
    if (!o) return '<div class="cabin-post empty"><span class="cabin-post-label">Poste libre</span><span>Fais monter un officier</span></div>';
    return `
      <div class="cabin-post${o.id === fresh ? ' fx-land' : ''}" data-officer="${o.id}">
        ${medal(o)}
        <span class="cabin-post-body"><b>${o.name}</b><span>${OFFICERS.roles[o.role].name} ${starsHtml(o.talent, MAX_TALENT)}</span><span class="cabin-good">${effects(o)}</span></span>
      </div>`;
  }).join('');
  const full = crew.freeSlots(m) <= 0;
  const officers = [...crew.officers]
    .sort((a, b) => Number(b.assignedTo === m.id) - Number(a.assignedTo === m.id))
    .map((o) => {
      const ship = ctx.fleet.members.find((s) => s.id === o.assignedTo);
      const here = o.assignedTo === m.id;
      const where = here ? `À bord de ${m.name}` : ship ? `Sur ${ship.name}` : 'À terre';
      const p = starProgress(o);
      const progress = p ? `<span class="cabin-xp"${tip(`Prochaine étoile : ${p.done} / ${p.needed} victoires de son navire`)}>${gaugeHtml(p.done / p.needed, 'plan')}</span>` : '';
      const button = here
        ? `<button class="kit-btn ghost" data-action="assign" data-arg="${o.id}:none">Débarquer</button>`
        : `<button class="kit-btn" data-action="assign" data-arg="${o.id}:${m.id}" data-board="${o.id}"${full ? ` disabled${tip('Tous les postes sont pris : débarque quelqu’un d’abord')}` : ''}>Faire monter</button>`;
      return `
        <div class="cabin-card cabin-officer${here ? ' here' : ''}">
          ${medal(o)}
          <span class="cabin-officer-body"><b>${o.name}</b><span>${OFFICERS.roles[o.role].name} ${starsHtml(o.talent, MAX_TALENT)}</span><span class="cabin-muted"${tip(effects(o))}>${where}</span>${progress}</span>
          ${button}
        </div>`;
    })
    .join('');
  return `
    <div class="cabin-crew">
      <div class="cabin-crew-left">
        <div class="cabin-section-head"><h2>À bord de ${m.name}</h2><span>${aboard.length} / ${slots} postes</span></div>
        <div class="cabin-deck" style="${deckStyle(m.type, m.levels.extension)}">${posts}</div>
      </div>
      <div class="cabin-crew-right">
        <div class="cabin-section-head"><h2>Officiers de la flotte</h2><span>Recrutement : à la Taverne d’un port</span></div>
        <div class="cabin-officers">${officers || '<p class="cabin-muted">Aucun officier pour l’instant : engage-en à la Taverne.</p>'}</div>
      </div>
    </div>`;
}
