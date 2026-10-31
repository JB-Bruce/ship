import type { FleetMember } from '../../fleet/fleet';
import { extensionCount, extensionEffects, extensionGauges, extensionUnlocks, nextExtension } from '../extensionInfo';
import { pipsHtml, priceHtml, statBarHtml, tip } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { shipIcon } from '../shipIcons';

/** Les deux silhouettes du navire, aujourd'hui et une fois allongé, et leurs noms. */
function silhouettes(m: FleetMember): string {
  const next = nextExtension(m);
  const now = `<figure class="yard-ext-ship"><span>${shipIcon(m.type, m.levels)}</span><figcaption>${next ? next.before : 'Taille maximale'}</figcaption></figure>`;
  if (!next) return `<div class="yard-ext-ships">${now}</div>`;
  const after = shipIcon(m.type, { ...m.levels, extension: m.levels.extension + 1 });
  return `<div class="yard-ext-ships">${now}<span class="yard-ext-arrow">⟶</span><figure class="yard-ext-ship after"><span>${after}</span><figcaption>${next.after}</figcaption></figure></div>`;
}

/**
 * Panneau « Allongement » du Chantier : le navire aujourd'hui et ce qu'il devient (silhouettes et noms), ce qui change
 * (longueur, vie, vitesse, virage, canons qu'on pourra monter, en barres avant → après), les niveaux d'amélioration
 * qu'il ouvre, puis le grand bouton pour le faire. Taille maximale : le navire tel qu'il est.
 */
export function extensionPanel(ctx: PortContext, m: FleetMember): string {
  const total = extensionCount(m);
  if (!total) return `<h2>Allongement</h2><p class="yard-next">Ce navire ne peut pas être allongé.</p>`;
  const next = nextExtension(m);
  const gauges = extensionGauges(m)
    .map((g) => statBarHtml(g.label, next && g.after !== g.now ? `${g.text(g.now)} → <span class="yard-up">${g.text(g.after)}</span>` : g.text(g.now), g.now / g.top, next ? g.after / g.top : undefined))
    .join('');
  const head = `<h2>Allongement</h2><div class="yard-ext-progress"${tip('Allongements faits sur ce navire')}>${pipsHtml(m.levels.extension, total)}<span>${m.levels.extension} / ${total}</span></div>${silhouettes(m)}`;
  if (!next) return `${head}<p class="yard-next">Le chantier ne peut plus l’agrandir : il est à sa taille maximale.</p><div class="yard-ext-bars">${gauges}</div>`;
  const unlocks = extensionUnlocks(next.ext)
    .map((u) => `<li>${u}</li>`)
    .join('');
  const have = { gold: ctx.state.gold, wood: ctx.state.wood };
  const ready = ctx.state.canAfford(next.ext.cost);
  return `${head}
    <p class="yard-ext-desc">${next.ext.description}</p>
    <p class="yard-next">${extensionEffects(next.ext)}</p>
    <div class="yard-ext-bars">${gauges}</div>
    ${unlocks ? `<div class="yard-ext-unlocks"><b>Nouveaux niveaux d’amélioration</b><ul>${unlocks}</ul></div>` : ''}
    <button class="kit-btn yard-ext-buy${ready ? '' : ' poor'}" data-action="extend" data-extend>
      <span>Allonger le navire</span>${priceHtml(next.ext.cost, have)}
    </button>`;
}

/** Rappel dans la vue d'ensemble : l'allongement suivant, s'il y en a un (un clic ouvre son panneau). */
export function extensionCallout(ctx: PortContext, m: FleetMember): string {
  const next = nextExtension(m);
  if (!next) return '';
  const ready = ctx.state.canAfford(next.ext.cost);
  const after = shipIcon(m.type, { ...m.levels, extension: m.levels.extension + 1 });
  return `
    <button class="yard-ext-callout${ready ? ' ready' : ''}" data-action="part" data-arg="extension">
      <span class="yard-ext-callout-icon">${after}</span>
      <span class="yard-ext-callout-body"><small>Allongement ${next.done + 1} / ${next.total}</small><b>${next.after}</b></span>
      ${priceHtml(next.ext.cost, { gold: ctx.state.gold, wood: ctx.state.wood })}
    </button>`;
}
