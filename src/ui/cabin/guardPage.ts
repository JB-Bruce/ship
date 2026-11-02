import { guardRadius, type GuardTrend } from '../../fleet/guards';
import type { FleetMember } from '../../fleet/fleet';
import { typeName } from '../../shipTypes';
import { tip } from '../kit/kit';
import { shipIcon } from '../shipIcons';
import type { CabinContext, CabinView } from './cabinContext';

/** Flèche de tendance : il gagne du terrain (vert, vers le haut), tient (trait gris), ou la Marine est trop forte (rouge). */
const TREND: Record<GuardTrend, { glyph: string; cls: string; text: string }> = {
  up: { glyph: '▲', cls: 'up', text: 'Il gagne du terrain' },
  flat: { glyph: '▬', cls: 'flat', text: 'Il tient sa zone' },
  down: { glyph: '▼', cls: 'down', text: 'La Marine est trop forte : il demande de l’aide' },
};

const one = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');

/**
 * Page Garde : la carte de déploiement (territoires, tes gardes et leur cercle, voir guardMap.ts), tes navires de garde
 * (puissance contre pression du front, tendance, rappel) et ceux qu'on peut poster. Choisir un navire puis cliquer sur la
 * carte le poste là (ou le déplace).
 */
export function guardPage(ctx: CabinContext, view: CabinView): string {
  const g = ctx.guards;
  const guards = g.members;
  const free = ctx.fleet.hand.filter((m) => g.canDeploy(m));
  const picking = ctx.fleet.members.find((m) => m.id === view.deploy);
  const hint = picking ? `Clique sur la carte pour poster <b>${picking.name}</b> (mer découverte).` : 'Molette : zoom · glisser : déplacer la carte · glisser un garde : le déplacer';
  const cards = guards.length ? guards.map((m) => guardCard(ctx, view, m)).join('') : '<p class="cabin-muted">Aucun navire en garde.</p>';
  const picks = free.length
    ? free
        .map(
          (m) =>
            `<button class="kit-btn small${view.deploy === m.id ? ' on' : ''}" data-action="guard-pick" data-arg="${m.id}"${tip(`Cercle de ${guardRadius(m.type)} m · puissance ${one(g.powerOf(m))}`)}>${m.name}</button>`,
        )
        .join('')
    : '<span class="cabin-muted">Aucun autre navire dans ta flotte (le navire que tu pilotes ne peut pas monter la garde).</span>';
  return `
    <div class="cabin-guard">
      <div class="cabin-section-head"><h2>Carte de déploiement</h2><span>${hint}</span></div>
      <div class="guard-map-slot"></div>
      <div class="guard-legend"><span><b class="up">▲</b> gagne du terrain</span><span><b class="flat">▬</b> tient</span><span><b class="down">▼</b> trop faible</span><span>Puissance / pression du front</span></div>
      <div class="cabin-section-head"><h2>Poster un navire</h2><span>Il quitte ta flotte ; on ne le reprend que s’il reste une place</span></div>
      <div class="guard-picks">${picks}</div>
      <div class="cabin-section-head"><h2>Tes gardes</h2><span>${guards.length} en poste</span></div>
      <div class="guard-cards">${cards}</div>
    </div>`;
}

function guardCard(ctx: CabinContext, view: CabinView, m: FleetMember): string {
  const g = ctx.guards;
  const info = g.info(m);
  const trend = TREND[info?.trend ?? 'flat'];
  const state = !m.inWorld ? `Coulé : de retour dans ${Math.ceil(m.respawnIn)} s` : !m.ship.alive ? 'Il coule…' : info?.state === 'fight' ? 'Au combat' : info?.state === 'patrol' ? 'En ronde à son poste' : 'En route vers son poste';
  const power = info ? `${one(info.total)} / ${one(info.pressure)}` : '…';
  const recall = g.fleetHasRoom
    ? `<button class="kit-btn small ghost" data-action="guard-recall" data-arg="${m.id}">Rappeler</button>`
    : `<button class="kit-btn small ghost" disabled${tip('Flotte pleine : il faut une place libre')}>Rappeler</button>`;
  const move = `<button class="kit-btn small${view.deploy === m.id ? ' on' : ''}" data-action="guard-pick" data-arg="${m.id}">Déplacer</button>`;
  return `
    <div class="cabin-card guard-card">
      <span class="cabin-mini-icon">${shipIcon(m.type, m.levels)}</span>
      <span class="guard-body"><b>${m.name}</b><span class="cabin-muted">${typeName(m.type, m.levels.extension)} · cercle de ${guardRadius(m.type)} m</span><span class="cabin-muted">${state}</span></span>
      <span class="guard-power"${tip(`${trend.text}. Puissance des gardes de ce poste / pression de la Marine (seul : ${one(info?.power ?? g.powerOf(m))})`)}><b class="guard-trend ${trend.cls}">${trend.glyph}</b>${power}</span>
      <span class="guard-actions">${move}${recall}</span>
    </div>`;
}
