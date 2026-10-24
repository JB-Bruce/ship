import { EMBLEMS, GUNS, type EmblemId, type GunType } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { capacityOf } from '../../fleet/holds';
import { gunCost } from '../../progression/modifiers';
import { cannonCount, deriveStats, describeLevel, extensionLevels, holdCapacity, maxLevel, nextCost, type UpgradeId, type UpgradeLevels } from '../../progression/upgrades';
import { SHIP_TYPES, UPGRADE_INFO } from '../../shipTypes';
import type { ShipStats } from '../../config';
import { pipsHtml, priceHtml, statBarHtml, tip } from '../kit/kit';
import { emblemPreview } from '../emblemPreview';
import { treasures } from '../../progression/treasures';
import type { PortContext } from '../port/portContext';
import { UPGRADE_ICONS } from '../upgradeIcons';
import { extensionIcon } from '../shipIcons';
import type { ShipPart } from './shipAnchors';

const MS_TO_KNOTS = 1.944;
const GUN_TYPES = Object.keys(GUNS.types) as GunType[];
const EMBLEM_IDS = Object.keys(EMBLEMS.designs) as EmblemId[];

/** Améliorations de chaque partie du navire. */
export const PART_UPGRADES: Record<ShipPart, readonly UpgradeId[]> = {
  sails: ['sails'],
  emblem: [],
  cannons: ['cannons', 'accuracy', 'range'],
  hull: ['hull'],
  hold: ['hold', 'nets'],
};

export const PART_NAMES: Record<ShipPart, string> = { sails: 'Voiles', emblem: 'Emblème', cannons: 'Canons', hull: 'Coque', hold: 'Cale' };

/** La caractéristique qu'une amélioration fait monter, avec sa valeur d'après les stats (null : seulement le texte). */
const GAUGES: Partial<Record<UpgradeId, { label: string; value: (s: ShipStats, hold: number) => number; text: (v: number) => string }>> = {
  sails: { label: 'Vitesse', value: (s) => s.maxSpeed * MS_TO_KNOTS, text: (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} nœuds` },
  cannons: { label: 'Canons', value: (s) => cannonCount(s), text: (v) => `${v}` },
  range: { label: 'Portée', value: (s) => s.cannon.range, text: (v) => `${Math.round(v)} m` },
  accuracy: { label: 'Précision', value: (s) => 1 / s.cannon.spread, text: (v) => `${Math.round(v)}` },
  hull: { label: 'Vie', value: (s) => s.maxHealth, text: (v) => `${Math.round(v)}` },
  hold: { label: 'Cale', value: (_s, hold) => hold, text: (v) => `${v} places` },
};

/**
 * Une amélioration : ses pastilles (celles que l'allongement ouvre, en vert-de-gris), l'effet du niveau suivant, la barre
 * de ce qu'elle change (maintenant, et en vert clair après achat) et le prix à cliquer. `fresh` : elle vient d'être
 * achetée (coup de tampon), `before` : la part de sa barre avant l'achat (elle glisse).
 */
function upgradeRow(ctx: PortContext, m: FleetMember, id: UpgradeId, fresh: boolean, before?: number): string {
  const { type, levels } = m;
  const level = levels[id];
  const all = SHIP_TYPES[type].upgrades[id].costs.length;
  const open = maxLevel(type, id, levels);
  const cost = nextCost(type, id, levels);
  const waiting = !cost && level < all;
  const next = cost ? `Niveau ${level + 1} : ${describeLevel(type, id, level + 1)}` : waiting ? `Allonge le navire pour le niveau ${level + 1}` : 'Niveau maximal';
  const g = gaugeValues(m, id);
  const gauge = GAUGES[id];
  const bar =
    g && gauge
      ? statBarHtml(gauge.label, cost ? `${gauge.text(g.now)} → <span class="yard-up">${gauge.text(g.after)}</span>` : gauge.text(g.now), g.now / g.top, g.after / g.top, before)
      : '';
  const buy = cost
    ? `<button class="kit-btn yard-buy" data-action="upgrade" data-arg="${id}" data-upgrade="${id}">${priceHtml(cost, { gold: ctx.state.gold, wood: ctx.state.wood })}</button>`
    : `<span class="yard-done">${waiting ? 'Allongement requis' : 'Max'}</span>`;
  return `
    <div class="yard-row" data-row="${id}">
      <span class="yard-row-icon">${UPGRADE_ICONS[id]}</span>
      <div class="yard-row-body">
        <div class="yard-row-head"><b${tip(UPGRADE_INFO[id].description)}>${UPGRADE_INFO[id].name}</b>${pipsHtml(level, open, fresh ? level - 1 : -1)}${open < all ? `<span class="yard-locked"${tip('Niveaux ouverts par l’allongement')}>+${all - open}</span>` : ''}</div>
        <span class="yard-next">${next}</span>
        ${bar}
      </div>
      ${buy}
    </div>`;
}

/** Allongement du navire (coque) : le suivant, ses effets et ce qu'il ouvre, ou « Taille maximale ». */
function extensionRow(ctx: PortContext, m: FleetMember): string {
  const { type, levels } = m;
  const def = SHIP_TYPES[type];
  const all = def.extensions;
  if (!all?.length) return '';
  const done = levels.extension >= all.length;
  const index = Math.min(levels.extension, all.length - 1);
  const ext = all[index];
  const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;
  const unlocks = (Object.keys(ext.extraLevels) as UpgradeId[])
    .filter((id) => ext.extraLevels[id])
    .map((id) => UPGRADE_INFO[id].name.toLowerCase())
    .join(', ');
  const effects = `${ext.length > 0 ? `+${ext.length} m · ` : ''}vie ${pct(ext.healthFactor)} · vitesse ${pct(ext.speedFactor)}${ext.turnFactor !== 1 ? ` · virage ${pct(ext.turnFactor)}` : ''}`;
  const buy = done
    ? '<span class="yard-done">Taille maximale</span>'
    : `<button class="kit-btn yard-buy" data-action="extend" data-extend>${priceHtml(ext.cost, { gold: ctx.state.gold, wood: ctx.state.wood })}</button>`;
  return `
    <div class="yard-row yard-extension">
      <span class="yard-row-icon">${extensionIcon(type, index)}</span>
      <div class="yard-row-body">
        <div class="yard-row-head"><b${tip(ext.description)}>${done ? 'Allongé' : ext.name}</b>${pipsHtml(levels.extension, all.length)}</div>
        <span class="yard-next">${done ? 'Le navire est à sa taille maximale' : effects}</span>
        ${!done && unlocks ? `<span class="yard-next ext">Ouvre de nouveaux niveaux : ${unlocks}</span>` : ''}
      </div>
      ${buy}
    </div>`;
}

/** Une batterie : ses trois types de canons, celui en place, le prix des autres (un type déjà payé se remonte gratuitement). */
function gunRow(ctx: PortContext, m: FleetMember, battery: 'main' | 'deck', label: string): string {
  const current = m.guns[battery];
  const cost = gunCost(m.type, battery);
  const choices = GUN_TYPES.map((t) => {
    const g = GUNS.types[t];
    const owned = m.ownedGuns.has(`${battery}:${t}`);
    const state = t === current ? '<span class="yard-done">En place</span>' : owned ? '<span class="yard-free">Remonter</span>' : priceHtml(cost, { gold: ctx.state.gold, wood: ctx.state.wood });
    return `<button class="yard-choice${t === current ? ' on' : ''}" data-action="guns" data-arg="${battery}:${t}" data-gun="${battery}-${t}"${tip(g.description)}><b>${g.name}</b>${state}</button>`;
  }).join('');
  return `<div class="yard-sub"><span class="yard-sub-title">${label}</span><div class="yard-choices">${choices}</div></div>`;
}

/** Emblème de la grande voile : les dessins, celui en place, le prix d'un nouveau. */
function emblemRow(ctx: PortContext, m: FleetMember): string {
  // L'emblème d'un trésor n'apparaît qu'une fois le trésor trouvé, et il est offert.
  const choices = EMBLEM_IDS.filter((id) => treasures.emblemAvailable(id)).map((id) => {
    const on = m.emblem === id;
    const owned = m.ownedEmblems.has(id) || treasures.isTreasureEmblem(id);
    const state = on ? '<span class="yard-done">En place</span>' : owned ? '<span class="yard-free">Repeindre</span>' : priceHtml({ gold: EMBLEMS.price, wood: 0 }, { gold: ctx.state.gold, wood: ctx.state.wood });
    return `<button class="yard-emblem${on ? ' on' : ''}" data-action="emblem" data-arg="${id}" data-emblem="${id}"${tip(EMBLEMS.designs[id].name)}><img src="${emblemPreview(id)}" alt="">${state}</button>`;
  }).join('');
  const clear = m.emblem ? '<button class="kit-btn ghost small" data-action="emblem" data-arg="none">Effacer</button>' : '';
  return `<div class="yard-sub"><span class="yard-sub-title">Emblème de la grande voile ${clear}</span><span class="yard-next">Il passe et s’écaille avec l’ancienneté du navire.</span><div class="yard-emblems">${choices}</div></div>`;
}

/** Effets à jouer dans le panneau après une action. */
export interface PanelFx {
  fresh: UpgradeId | null;
  before: number | null;
}

/** Panneau d'une partie du navire : ses améliorations, plus l'allongement (coque), les types de canons, l'emblème. */
export function partPanel(ctx: PortContext, part: ShipPart, fx: PanelFx): string {
  const m = ctx.fleet.controlled;
  const rows = PART_UPGRADES[part]
    .filter((id) => maxLevel(m.type, id, m.levels) > 0 || extensionLevels(m.type, id) > 0)
    .map((id) => upgradeRow(ctx, m, id, fx.fresh === id, fx.fresh === id ? (fx.before ?? undefined) : undefined))
    .join('');
  let extra = '';
  if (part === 'hull') extra = extensionRow(ctx, m);
  if (part === 'cannons') {
    const stats = m.ship.stats;
    const labels = SHIP_TYPES[m.type].gunLabels;
    // Le mortier du brick n'a pas de type de canons à choisir.
    const second = stats.deckCannon !== undefined && !stats.deckCannon.shell;
    extra = gunRow(ctx, m, 'main', second ? (labels?.main ?? 'Batterie') : 'Type de canons') + (second ? gunRow(ctx, m, 'deck', labels?.deck ?? 'Canons des gaillards') : '');
  }
  if (part === 'sails' || part === 'emblem') extra = emblemRow(ctx, m);
  if (part === 'emblem') return `<h2>${PART_NAMES[part]}</h2>${extra}`;
  return `<h2>${PART_NAMES[part]}</h2>${rows || (extra ? '' : '<p class="yard-next">Rien à améliorer ici sur ce navire.</p>')}${extra}`;
}

/**
 * Valeurs de la barre d'une amélioration : maintenant, après le prochain niveau, et au bout (ce navire allongé au maximum,
 * l'amélioration au dernier niveau). Calculées sur les stats de base puis portées sur celles du navire (officiers, rang).
 */
function gaugeValues(m: FleetMember, id: UpgradeId): { now: number; after: number; top: number } | null {
  const gauge = GAUGES[id];
  if (!gauge) return null;
  const { type, levels } = m;
  const def = SHIP_TYPES[type];
  const value = (l: UpgradeLevels) => gauge.value(deriveStats(type, def.stats, l), holdCapacity(type, l));
  const now = gauge.value(m.ship.stats, capacityOf(m));
  const nowBase = value(levels);
  const k = nowBase ? now / nowBase : 1;
  const after = nextCost(type, id, levels) ? k * value({ ...levels, [id]: levels[id] + 1 }) : now;
  const top = Math.max(now, after, k * value({ ...levels, extension: def.extensions?.length ?? 0, [id]: def.upgrades[id].costs.length }));
  return { now, after, top };
}

/** Part remplie de la barre d'une amélioration (pour la faire glisser après l'achat). */
export function gaugeRatio(m: FleetMember, id: UpgradeId): number | null {
  const g = gaugeValues(m, id);
  return g ? g.now / g.top : null;
}
