import { BOSSES, RANKS } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { capacityOf } from '../../fleet/holds';
import { rankName, rankOf } from '../../fleet/officers';
import { cannonCount, deriveStats, describeLevel, holdCapacity, maxLevel, maxLevels, nextCost, UPGRADE_IDS, type UpgradeId } from '../../progression/upgrades';
import type { ShipStats } from '../../config';
import { SHIP_SIZE_ORDER, SHIP_TYPES, typeName, UPGRADE_INFO } from '../../shipTypes';
import { gaugeHtml, pipsHtml, priceHtml, statBarHtml, tip } from '../kit/kit';
import { UPGRADE_ICONS } from '../upgradeIcons';
import { shipIcon } from '../shipIcons';
import { viewedMember, type CabinContext, type CabinView } from './cabinContext';

const MS_TO_KNOTS = 1.944;

/** Une caractéristique montrée en barre : son libellé, sa valeur (stats, places de cale) et son affichage. */
interface StatLine {
  readonly label: string;
  readonly value: (s: ShipStats, hold: number) => number;
  readonly text: (v: number) => string;
}

const LINES: readonly StatLine[] = [
  { label: 'Vie', value: (s) => s.maxHealth, text: (v) => `${Math.round(v)}` },
  { label: 'Vitesse', value: (s) => s.maxSpeed * MS_TO_KNOTS, text: (v) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} nœuds` },
  { label: 'Virage', value: (s) => s.turnRate, text: (v) => `${Math.round(v * 100)}` },
  { label: 'Portée', value: (s) => s.cannon.range, text: (v) => `${Math.round(v)} m` },
  { label: 'Canons', value: (s) => cannonCount(s), text: (v) => `${v}` },
  { label: 'Dégâts', value: (s) => s.cannon.damage, text: (v) => `${Math.round(v)} par boulet` },
  { label: 'Cale', value: (_s, hold) => hold, text: (v) => `${v} places` },
];

/** Le plus haut de chaque caractéristique dans le jeu (navire le plus fort, tout amélioré) : le bout de chaque barre. */
let tops: number[] | null = null;
function statTops(): number[] {
  if (tops) return tops;
  const best = LINES.map(() => 0);
  for (const type of SHIP_SIZE_ORDER) {
    const levels = maxLevels(type);
    const stats = deriveStats(type, SHIP_TYPES[type].stats, levels);
    const hold = holdCapacity(type, { ...levels, hold: maxLevel(type, 'hold', levels) });
    LINES.forEach((line, i) => (best[i] = Math.max(best[i], line.value(stats, hold))));
  }
  return (tops = best);
}

/** Effets à jouer sur la page après une action : pastille qui vient de se remplir, barres d'avant. */
export interface ShipPageFx {
  fresh: UpgradeId | null;
  /** Parts remplies des barres avant le changement (par libellé). */
  before: Record<string, number> | null;
}

/** Parts remplies des barres du navire (0 à 1), par libellé : pour animer celles qui changent. */
export function statRatios(m: FleetMember): Record<string, number> {
  const t = statTops();
  return Object.fromEntries(LINES.map((line, i) => [line.label, line.value(m.ship.stats, capacityOf(m)) / t[i]]));
}

/**
 * Page Navire : la fiche du navire consulté (silhouette, rang, vie, état), ses caractéristiques en barres et ses
 * améliorations en pastilles. À quai, le navire piloté s'améliore d'ici ; sinon le prix rappelle ce qu'il faudra au
 * Chantier.
 */
export function shipPage(ctx: CabinContext, view: CabinView, fx: ShipPageFx): string {
  const m = viewedMember(ctx, view);
  const ship = m.ship;
  const t = statTops();
  const stars = rankOf(m.kills);
  const atHelm = m === ctx.fleet.controlled;
  const afloat = m.inWorld && ship.alive;
  const status = m.trade?.fishing ? 'À la pêche' : m.trade ? 'En route commerciale' : !m.inWorld ? `Coulé : de retour dans ${Math.ceil(m.respawnIn)} s` : !ship.alive ? 'En train de couler…' : atHelm ? 'Tu es à la barre' : 'Suit la flotte';
  const helm = !atHelm && afloat && !m.trade ? `<button class="kit-btn" data-action="helm" data-arg="${m.id}">Prendre la barre</button>` : '';
  const next = RANKS.levels[stars + 1];
  const rankTip = `${rankName(stars)}${next ? ` · ${next.name} à ${next.kills} victoires` : ''}`;
  // Pavillons des boss coulés par ce navire, hissés sous son pavillon ou retirés.
  const trophies = m.trophies
    .map((id) => {
      const shown = !m.hiddenTrophies.has(id);
      return `<button class="cabin-trophy${shown ? ' on' : ''}" data-action="trophy" data-arg="${m.id}:${id}"${tip(`Pavillon de ${BOSSES[id].name} : ${shown ? 'hissé (clic pour le retirer)' : 'retiré (clic pour le hisser)'}`)}>☠</button>`;
    })
    .join('');
  const bars = LINES.map((line, i) => {
    const v = line.value(ship.stats, capacityOf(m));
    return statBarHtml(line.label, line.text(v), v / t[i], undefined, fx.before?.[line.label]);
  }).join('');
  const canBuy = ctx.atPort() && atHelm;
  const have = { gold: ctx.state.gold, wood: ctx.state.wood };
  const upgrades = UPGRADE_IDS.filter((id) => maxLevel(m.type, id, m.levels) > 0)
    .map((id) => {
      const level = m.levels[id];
      const max = maxLevel(m.type, id, m.levels);
      const cost = nextCost(m.type, id, m.levels);
      const next = cost ? `Niveau ${level + 1} : ${describeLevel(m.type, id, level + 1)}` : 'Niveau maximal';
      const affordable = !!cost && ctx.state.canAfford(cost);
      const buy = !cost
        ? '<span class="cabin-done">Max</span>'
        : canBuy
          ? `<button class="kit-btn${affordable ? '' : ' poor'}" data-action="upgrade" data-arg="${id}" data-upgrade="${id}">${priceHtml(cost, have)}</button>`
          : `<span class="cabin-chip${affordable ? ' ok' : ''}"${tip('À acheter au Chantier d’un port')}>${priceHtml(cost, have)}</span>`;
      return `
        <div class="cabin-upgrade"${tip(`${UPGRADE_INFO[id].description} ${next}.`)}>
          <span class="cabin-upgrade-icon">${UPGRADE_ICONS[id]}</span>
          <span class="cabin-upgrade-body"><b>${UPGRADE_INFO[id].name}</b>${pipsHtml(level, max, fx.fresh === id ? level - 1 : -1)}</span>
          ${buy}
        </div>`;
    })
    .join('');
  return `
    <div class="cabin-ship">
      <div class="cabin-ship-left">
        <div class="cabin-card cabin-ship-card">
          <div class="cabin-ship-icon">${shipIcon(m.type, m.levels)}</div>
          <div class="cabin-ship-title"><span class="cabin-name">${m.name}</span><span>${typeName(m.type, m.levels.extension)}</span></div>
          <div class="cabin-ship-meta"><span${tip(`${m.kills} navires coulés`)}>☠ ${m.kills}</span>${stars ? `<span class="kit-stars"${tip(rankTip)}>${'★'.repeat(stars)}</span>` : `<span${tip(rankTip)}>${rankName(stars)}</span>`}<span>${status}</span>${trophies}</div>
          <div class="cabin-life"><span>Vie</span>${gaugeHtml(afloat ? ship.health / ship.stats.maxHealth : 0)}<b>${afloat ? Math.ceil(ship.health) : 0} / ${ship.stats.maxHealth}</b></div>
          ${helm}
        </div>
        <div class="cabin-stats">${bars}</div>
      </div>
      <div class="cabin-ship-right">
        <div class="cabin-section-head"><h2>Améliorations</h2><span>${canBuy ? 'À quai : clique un prix pour améliorer' : atHelm ? 'À acheter au Chantier d’un port' : 'Prends sa barre au port pour l’améliorer'}</span></div>
        <div class="cabin-upgrades">${upgrades}</div>
      </div>
    </div>`;
}
