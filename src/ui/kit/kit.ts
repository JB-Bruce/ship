import type { Cost } from '../../config';
import './kit.css';
import './tooltip';

/**
 * Socle commun des menus refaits (Cabine, puis les lieux du port) : petites pièces d'interface en HTML, à assembler
 * dans le `render` d'un menu. Les effets qui bougent (tampon, pièces qui volent, chiffre qui s'envole) sont dans
 * `feedback.ts`. Les styles sont dans `kit.css`.
 */

/** Pièce d'or et bûche, pour les prix et le coffre. */
export const COIN_ICON = '<svg class="kit-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#d9a514" stroke="#7a5a0c" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#7a5a0c" stroke-width="1.5"/></svg>';
export const WOOD_ICON = '<svg class="kit-icon" viewBox="0 0 26 24" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="5" fill="#8a5a2b" stroke="#4a2c12" stroke-width="2"/><ellipse cx="21" cy="12" rx="3" ry="5" fill="#c8945a" stroke="#4a2c12" stroke-width="1.5"/></svg>';

/** Texte sûr dans un attribut ou du HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Bulle d'aide au survol (attribut à poser sur l'élément) : les explications quittent le texte de la page. */
export const tip = (text: string) => ` data-tip="${escapeHtml(text)}"`;

/** Pastilles de niveau : `level` pleines sur `max` ; `fresh` = celle qui vient de se remplir (coup de tampon). */
export function pipsHtml(level: number, max: number, fresh = -1): string {
  let html = '';
  for (let i = 0; i < max; i++) html += `<span class="kit-pip${i < level ? ' on' : ''}${i === fresh ? ' fx-stamp' : ''}"></span>`;
  return `<span class="kit-pips">${html}</span>`;
}

const pct = (r: number) => `${Math.round(Math.min(1, Math.max(0, r)) * 100)}%`;

/**
 * Barre de caractéristique : libellé, valeur affichée, part remplie (0 à 1) et, en aperçu, la part après une
 * amélioration (`next`, en vert clair derrière). `from` : part d'avant un changement ; la barre est dessinée là, puis
 * glisse jusqu'à `ratio` (`settleBars` de feedback.ts, après le rendu).
 */
export function statBarHtml(label: string, value: string, ratio: number, next?: number, from?: number): string {
  const ghost = next !== undefined && next > ratio ? `<span class="kit-bar-next" style="width:${pct(next)}"></span>` : '';
  const fill = from !== undefined && Math.abs(from - ratio) > 1e-3 ? `style="width:${pct(from)}" data-to="${pct(ratio)}"` : `style="width:${pct(ratio)}"`;
  return `
    <div class="kit-stat">
      <div class="kit-stat-head"><span>${label}</span><b>${value}</b></div>
      <div class="kit-bar">${ghost}<span class="kit-bar-fill" ${fill}></span></div>
    </div>`;
}

/** Jauge pleine largeur (vie, cale…) : `tone` choisit la couleur (`life` vire au rouge sous la moitié). */
export function gaugeHtml(ratio: number, tone: 'life' | 'hold' | 'plan' | 'mission' = 'life'): string {
  const r = Math.min(1, Math.max(0, ratio));
  const low = tone === 'life' && r < 0.5 ? ' low' : '';
  return `<span class="kit-gauge ${tone}${low}"><span style="width:${Math.round(r * 100)}%"></span></span>`;
}

/** Prix : pièces et bûches, en rouge ce que tu n'as pas (`have`). Rien à payer : chaîne vide. */
export function priceHtml(cost: Cost, have: Cost): string {
  const part = (n: number, mine: number, icon: string) => (n ? `<span class="kit-price-part${mine < n ? ' short' : ''}">${icon}${n}</span>` : '');
  return `<span class="kit-price">${part(cost.gold, have.gold, COIN_ICON)}${part(cost.wood, have.wood, WOOD_ICON)}</span>`;
}

/** Coffre du joueur (en-tête des menus) : les éléments portent `data-coffer` pour que les pièces y volent. */
export function cofferHtml(have: Cost): string {
  return `<span class="kit-coffer" data-coffer><span class="kit-coffer-part" data-coffer-gold>${COIN_ICON}<b>${have.gold.toLocaleString('fr-FR')}</b></span><span class="kit-coffer-part" data-coffer-wood>${WOOD_ICON}<b>${have.wood.toLocaleString('fr-FR')}</b></span></span>`;
}

const SKULL = '<svg class="kit-skull" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2C5.6 2 3 5 3 8.6c0 2.2 1 3.7 2.4 4.6V16h2v-1.6h1.2V16h2.8v-1.6h1.2V16h2v-2.8C16 12.3 17 10.8 17 8.6 17 5 14.4 2 10 2Z"/><circle cx="7.2" cy="9" r="1.9" class="kit-skull-eye"/><circle cx="12.8" cy="9" r="1.9" class="kit-skull-eye"/><path d="M10 11.2 9 13h2Z" class="kit-skull-eye"/></svg>';

/** Difficulté d'une mission en têtes de mort, pleines puis pâles jusqu'à `max`. */
export function skullsHtml(n: number, max = n): string {
  let html = '';
  for (let i = 0; i < max; i++) html += `<span class="kit-skull-slot${i < n ? ' on' : ''}">${SKULL}</span>`;
  return `<span class="kit-skulls" aria-label="${n} sur ${max}">${html}</span>`;
}

/** Étoiles de talent ou de difficulté, pleines puis vides jusqu'à `max`. */
export function starsHtml(n: number, max = n): string {
  return `<span class="kit-stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, max - n))}</span></span>`;
}
