import { BOSS_IDS, BOSSES, ISLAND_INFO } from '../../config';
import { blueprints, revealTypes, shipTypeLabel } from '../../progression/blueprints';
import { MISSION_TYPES, missionType, type Contract } from '../../progression/contracts';
import { SHIP_SIZE_ORDER } from '../../shipTypes';
import { gaugeHtml, pipsHtml, starsHtml, tip } from '../kit/kit';
import { contractProgress } from '../contractProgress';
import { SHIP_ICONS } from '../shipIcons';
import type { CabinContext, CabinView } from './cabinContext';

const MAX_STARS = 5;

/**
 * Page Journal : les contrats en cours (avancement, où toucher la prime, abandon en deux clics), les plans de navires
 * (bouts gagnés) et le registre (exploits et pavillons des boss).
 */
export function logPage(ctx: CabinContext, view: CabinView): string {
  const contracts = ctx.contracts.active.map((c) => contractCard(ctx, view, c)).join('') || '<p class="cabin-muted">Aucun contrat : les tavernes en proposent chaque jour.</p>';
  const plans = SHIP_SIZE_ORDER.filter((t) => blueprints.needed(t) > 0)
    .map((t) => {
      const known = blueprints.isUnlocked(t);
      const n = blueprints.count(t);
      const need = blueprints.needed(t);
      return `<div class="cabin-plan${known ? ' known' : ''}"${tip(known ? `${shipTypeLabel(t)} : plan complet` : `Plan inconnu : ${n} / ${need} bouts`)}><span class="cabin-plan-icon">${SHIP_ICONS[t]}</span><span>${known ? shipTypeLabel(t) : `${n} / ${need}`}</span>${known ? '' : pipsHtml(n, need)}</div>`;
    })
    .join('');
  const l = ctx.ledger;
  const facts: [string, string][] = [
    ['Navires coulés', `${l.totalSunk}`],
    ['Dont d’élite', `${l.elites}`],
    ['Contrats remplis', `${l.contractsDone}`],
    ['Or gagné', l.goldEarned.toLocaleString('fr-FR')],
    ['Bénéfice des routes', l.tradeProfit.toLocaleString('fr-FR')],
    ['Distance à la barre', `${(l.distanceSailed / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`],
  ];
  const flags = BOSS_IDS.map((id) => {
    const taken = (l.bossFlags[id] ?? 0) > 0;
    return `<span class="cabin-flag${taken ? ' taken' : ''}"${tip(taken ? `Pavillon de ${BOSSES[id].name}` : `${BOSSES[id].name} : ${revealTypes(BOSSES[id].rumor)}`)}>${taken ? '☠' : '?'}</span>`;
  }).join('');
  return `
    <div class="cabin-log">
      <div class="cabin-log-col">
        <div class="cabin-section-head"><h2>Contrats</h2><span>${ctx.contracts.active.length} en cours</span></div>
        <div class="cabin-contracts">${contracts}</div>
      </div>
      <div class="cabin-log-col">
        <div class="cabin-section-head"><h2>Plans de navires</h2></div>
        <div class="cabin-plans">${plans}</div>
      </div>
      <div class="cabin-log-col">
        <div class="cabin-section-head"><h2>Registre</h2></div>
        <div class="cabin-facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="cabin-flags"><span class="cabin-muted">Pavillons des boss</span>${flags}</div>
      </div>
    </div>`;
}

function contractCard(ctx: CabinContext, view: CabinView, c: Contract): string {
  const type = MISSION_TYPES[missionType(c)];
  const { count, ready } = contractProgress(c, ctx.contracts, ctx.fleet);
  const port = ISLAND_INFO[c.claimAt].portName;
  const note = ready ? `Prime à toucher à ${port}` : (ctx.missionStatus(c) ?? `Prime à ${port}`);
  const confirm = view.confirmAbandon === c.id;
  return `
    <div class="cabin-card cabin-contract${ready ? ' ready' : ''}">
      <div class="cabin-contract-head"><span class="tag mission ${missionType(c)}">${type.icon} ${type.name}</span>${starsHtml(c.stars, MAX_STARS)}</div>
      <b>${ready ? '✔ ' : ''}${revealTypes(c.title)}</b>
      <div class="cabin-mini-row">${gaugeHtml(count / c.target, 'mission')}<b>${count} / ${c.target}</b></div>
      <div class="cabin-mini-foot"><span class="cabin-muted">${note}</span><button class="kit-btn ${confirm ? 'red' : 'ghost'} small" data-action="abandon" data-arg="${c.id}">${confirm ? 'Sûr ?' : 'Abandonner'}</button></div>
    </div>`;
}
