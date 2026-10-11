import { GUNS, type GunType } from '../../config';
import { capacityOf } from '../../fleet/holds';
import { gunCost } from '../../progression/modifiers';
import { describeLevel, extensionLevels, massSpeedLoss, maxLevel, nextCost, shipMass, UPGRADE_IDS, type UpgradeId } from '../../progression/upgrades';
import { SHIP_TYPES, typeName, UPGRADE_INFO } from '../../shipTypes';
import { costHtml } from '../parchmentMenu';
import { extensionIcon } from '../shipIcons';
import { resourcesHtml, type PortContext } from './portContext';

const MS_TO_KNOTS = 1.944;

/** Icônes dessinées au trait, façon gravure. */
const ICONS: Record<UpgradeId, string> = {
  accuracy: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><circle class="solid" cx="24" cy="24" r="2.5"/><path d="M24 2v10M24 36v10M2 24h10M36 24h10"/></svg>`,
  range: `<svg viewBox="0 0 48 48"><path d="M4 40c10-22 26-32 40-32"/><path d="M36 6l8 2-3 8"/><circle class="solid" cx="8" cy="38" r="3"/><path d="M18 44h4M28 44h4M38 44h4"/></svg>`,
  cannons: `<svg viewBox="0 0 48 48"><path d="M5 22l29-7 4 10-29 7z"/><path d="M38 17l5-1 2 8-5 1"/><circle cx="15" cy="35" r="6"/><circle class="solid" cx="15" cy="35" r="1.5"/></svg>`,
  hull: `<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z"/><path d="M8.5 18h31M10 29h28M24 4v40"/></svg>`,
  sails: `<svg viewBox="0 0 48 48"><path d="M24 3v41M10 9h28M12 37h24M7 44h34"/><path d="M12 9c-3 9-3 19 0 28h24c3-9 3-19 0-28"/></svg>`,
  hold: `<svg viewBox="0 0 48 48"><path d="M14 5h20c5 7 5 31 0 38H14c-5-7-5-31 0-38z"/><path d="M10 15h28M10 33h28M19 5c-2 9-2 29 0 38M29 5c2 9 2 29 0 38"/></svg>`,
};

const GUN_TYPES = Object.keys(GUNS.types) as GunType[];

/**
 * Onglet Chantier naval : améliore le bateau que tu pilotes (chaque bateau a ses propres améliorations), allonge le
 * brigantin, la corvette ou la frégate, et choisis le type de canons de chacune de ses batteries. Les chiffres du bas comptent aussi ses officiers
 * et son rang.
 */
export function shipyardTab(ctx: PortContext): string {
  const member = ctx.fleet.controlled;
  const { type, levels } = member;
  const stats = member.ship.stats;
  const penalty = Math.round(massSpeedLoss(type, levels) * 100);
  return `
    <p class="subtitle">Améliorations de <b>${member.name}</b> (${typeName(type, levels.extension)}). Prends la barre d'un autre navire (T) pour l'améliorer.</p>
    ${resourcesHtml(ctx)}
    <div class="list">${UPGRADE_IDS.filter((id) => maxLevel(type, id, levels) > 0).map((id) => card(ctx, id)).join('')}</div>
    ${extensionCard(ctx)}
    <h3 class="section">Type de canons</h3>
    ${gunRow(ctx, 'main', stats.deckCannon ? 'Batterie' : '')}${stats.deckCannon ? gunRow(ctx, 'deck', 'Canons des gaillards') : ''}
    <div class="footer">
      <span>Longueur <b>${stats.length} m</b></span>
      <span>Masse <b>${shipMass(type, levels)}</b>${penalty > 0 ? ` (−${penalty} % de vitesse)` : ''}</span>
      <span>Vitesse max <b>${Math.round(stats.maxSpeed * MS_TO_KNOTS)} nœuds</b></span>
      <span>Vie max <b>${stats.maxHealth}</b></span>
      <span>Canons <b>${stats.cannonsPerSide * 2}</b> · portée <b>${Math.round(stats.cannon.range)} m</b></span>
      <span>Cale <b>${capacityOf(member)} places</b></span>
    </div>`;
}

/**
 * Allongements (brigantin, corvette, frégate) : une fiche à part, aux couleurs des niveaux qu'ils ouvrent (vert-de-gris), pour le suivant
 * (ou le dernier fait). Ses effets, et les niveaux d'amélioration qu'il débloque, sont tirés de la définition du type.
 */
function extensionCard(ctx: PortContext): string {
  const { type, levels } = ctx.fleet.controlled;
  const def = SHIP_TYPES[type];
  const all = def.extensions;
  if (!all?.length) return '';
  const done = levels.extension >= all.length;
  const index = Math.min(levels.extension, all.length - 1);
  const ext = all[index];
  const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;
  const from = def.stats.length + all.slice(0, index).reduce((sum, e) => sum + e.length, 0);
  const effects = `Coque ${from} → ${from + ext.length} m · vie ${pct(ext.healthFactor)} · vitesse ${pct(ext.speedFactor)} · virage ${pct(ext.turnFactor)} · masse +${ext.mass}`;
  // Niveaux qu'il ouvre : ceux qui suivent les niveaux déjà ouverts avant lui.
  const unlocks = UPGRADE_IDS.filter((id) => ext.extraLevels[id])
    .map((id) => {
      const last = def.upgrades[id].costs.length - extensionLevels(type, id, index + 1);
      const first = last - (ext.extraLevels[id] ?? 0) + 1;
      return `${UPGRADE_INFO[id].name.toLowerCase()} ${first === last ? `niveau ${last}` : `niveaux ${first} et ${last}`}`;
    })
    .join(', ');
  const pips = all.map((_, i) => `<span class="pip ext${i < levels.extension ? ' on' : ''}"></span>`).join('');
  const buy = done
    ? '<div class="buy"><span class="done">Terminé</span></div>'
    : `<div class="buy"><div class="cost">${costHtml(ext.cost.gold, ext.cost.wood, ctx.state.gold, ctx.state.wood)}</div>
        <button data-action="extend"${ctx.state.canAfford(ext.cost) ? '' : ' disabled'}>Allonger</button></div>`;
  return `
    <h3 class="section">Allongement <span class="pips">${pips}</span></h3>
    <div class="upgrade-card extension${done ? ' done' : ''}">
      <div class="icon">${extensionIcon(type, index)}</div>
      <div class="body">
        <h2>${ext.name} <span class="tag extended">⟷ ${done ? 'Taille maximale' : `+${ext.length} m`}</span></h2>
        <p>${ext.description}</p>
        <p class="effect">${effects}</p>
        <p class="effect ext">Débloque : ${unlocks}</p>
      </div>
      ${buy}
    </div>`;
}

/** Une batterie : ses trois types de canons, chacun avec ses effets, le sien en évidence, le prix des autres. */
function gunRow(ctx: PortContext, battery: 'main' | 'deck', label: string): string {
  const member = ctx.fleet.controlled;
  const current = member.guns[battery];
  const cost = gunCost(member.type, battery);
  const cards = GUN_TYPES.map((t) => {
    const g = GUNS.types[t];
    const owned = member.ownedGuns.has(`${battery}:${t}`);
    const disabled = !owned && !ctx.state.canAfford(cost) ? ' disabled' : '';
    const button = (label: string, extra = '') => `<button${extra} data-action="guns" data-arg="${battery}:${t}"${disabled}>${label}</button>`;
    // Le prix au-dessus du bouton, comme les autres achats du port ; un type déjà acheté se remonte gratuitement.
    const action =
      t === current
        ? '<span class="done">En place</span>'
        : owned
          ? button('Remonter', ' class="secondary"')
          : `<div class="cost">${costHtml(cost.gold, cost.wood, ctx.state.gold, ctx.state.wood)}</div>${button('Installer')}`;
    return `<div class="gun-choice${t === current ? ' on' : ''}"><b>${g.name}</b><p>${g.description}</p><div class="buy">${action}</div></div>`;
  }).join('');
  return `${label ? `<h4 class="gun-battery">${label}</h4>` : ''}<div class="gun-choices">${cards}</div>`;
}

/** Une amélioration : ses points (ceux qu'ouvre l'allongement en vert-de-gris, cerclés tant qu'il manque), le prochain niveau. */
function card(ctx: PortContext, id: UpgradeId): string {
  const { type, levels } = ctx.fleet.controlled;
  const level = levels[id];
  const all = SHIP_TYPES[type].upgrades[id].costs.length;
  const base = all - extensionLevels(type, id);
  const open = maxLevel(type, id, levels);
  const cost = nextCost(type, id, levels);
  const pips = Array.from({ length: all }, (_, i) => {
    const ext = i >= base ? ` ext${i < open ? '' : ' locked'}` : '';
    return `<span class="pip${ext}${i < level ? ' on' : ''}"></span>`;
  }).join('');
  // Au bout des niveaux ordinaires d'une amélioration qui continue avec l'allongement : on le rappelle.
  const waiting = !cost && level < all;
  const effect = cost ? `Niveau ${level + 1} : ${describeLevel(type, id, level + 1)}` : waiting ? `Allonge le navire pour le niveau ${level + 1} : ${describeLevel(type, id, level + 1)}` : 'Niveau maximal atteint';
  let buy = `<div class="buy"><span class="done">${waiting ? 'Allongement requis' : 'Terminé'}</span></div>`;
  if (cost) {
    const disabled = ctx.state.canAfford(cost) ? '' : ' disabled';
    buy = `<div class="buy"><div class="cost">${costHtml(cost.gold, cost.wood, ctx.state.gold, ctx.state.wood)}</div>
      <button data-action="upgrade" data-arg="${id}"${disabled}>Améliorer</button></div>`;
  }
  return `
    <div class="upgrade-card${cost || waiting ? '' : ' maxed'}">
      <div class="icon">${ICONS[id]}</div>
      <div class="body">
        <h2>${UPGRADE_INFO[id].name} <span class="pips">${pips}</span></h2>
        <p>${UPGRADE_INFO[id].description}</p>
        <p class="effect${level >= base && cost ? ' ext' : ''}">${effect}</p>
      </div>
      ${buy}
    </div>`;
}
