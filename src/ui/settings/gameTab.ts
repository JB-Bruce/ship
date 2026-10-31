import { clockLabel } from '../dayClock';
import { hourDialHtml } from './hourDialView';
import type { VolumeKey } from '../../settings/settings';
import type { SettingsContext } from './settingsMenu';

/** Touches du jeu (ZQSD en AZERTY = WASD en QWERTY). */
const CONTROLS: readonly [string, string][] = [
  ['Z / S (maintenir)', 'Hisser / affaler la voile'],
  ['Q / D', 'Barre'],
  ['Souris (clic pour la prendre)', 'Regarder (première personne)'],
  ['V (à la barre)', 'Vue de loin / première personne'],
  ['Clic gauche maintenu · molette', 'Longue-vue (première personne) · grossissement'],
  ['Glisser la souris · molette', 'Vue de loin : tourner la caméra · zoom'],
  ['E', 'Quitter la barre · la reprendre devant la roue · grimper au hauban'],
  ['Z Q S D · Maj · Espace (à pied)', 'Marcher · courir · sauter'],
  ['Tab', 'Cabine du capitaine (navire, équipage, flotte, journal)'],
  ['P (près d’un quai)', 'Port'],
  ['T (maintenu)', 'Roue d’ordres de la flotte'],
  ['M', 'Carte'],
  ['F (près d’un banc)', 'Pêcher'],
  ['R puis clic (allié proche)', 'Trahir un pirate ou un marchand allié'],
  ['Échap', 'Paramètres (pause)'],
];

/** Les quatre curseurs de volume : réglage, nom, ce qu'il règle. */
const VOLUMES: readonly [VolumeKey, string, string][] = [
  ['master', 'Volume général', 'Tout le son du jeu.'],
  ['music', 'Musique', 'Airs du port, de la mer, des combats et des boss.'],
  ['sfx', 'Effets', 'Canons, impacts, équipage et menus.'],
  ['ambience', 'Ambiance', 'Mer, vent, pluie, tonnerre, grincements du navire.'],
];

/**
 * Onglet Jeu : reprendre la partie, heure du jour, volumes du son, affichage du compteur d'images, rappel des touches.
 * `title` : dans le menu principal, sans partie en cours (ni pause, ni heure du jour).
 */
export function gameTab(ctx: SettingsContext, title = false): string {
  const showFps = ctx.settings.showFps;
  const controls = CONTROLS.map(([key, action]) => `<div><span>${action}</span><b>${key}</b></div>`).join('');
  return `${title ? '' : pauseHtml(ctx)}
    <h3 class="section">Son</h3>
    <div class="settings-list">
      ${VOLUMES.map(([key, label, about]) => `
      <div class="setting">
        <div class="setting-label"><b>${label} <span class="volume-value">${Math.round(ctx.settings.volumes[key] * 100)} %</span></b><p>${about}</p></div>
        <input type="range" min="0" max="100" step="1" value="${Math.round(ctx.settings.volumes[key] * 100)}" data-volume="${key}" aria-label="${label}">
      </div>`).join('')}
      <div class="setting">
        <div class="setting-label"><b>Couper le son</b><p>Tout le son du jeu, d’un coup.</p></div>
        <div class="choices">
          <button class="choice${ctx.settings.muted ? ' on' : ''}" data-action="mute" data-arg="true">Oui</button>
          <button class="choice${ctx.settings.muted ? '' : ' on'}" data-action="mute" data-arg="false">Non</button>
        </div>
      </div>
    </div>
    <h3 class="section">Affichage</h3>
    <div class="settings-list">
      <div class="setting">
        <div class="setting-label"><b>Afficher les images par seconde</b><p>Un petit compteur en haut à gauche de l’écran.</p></div>
        <div class="choices">
          <button class="choice${showFps ? ' on' : ''}" data-action="fps" data-arg="true">Oui</button>
          <button class="choice${showFps ? '' : ' on'}" data-action="fps" data-arg="false">Non</button>
        </div>
      </div>
    </div>
    <h3 class="section">Commandes</h3>
    <p class="effect">En QWERTY : W / S pour la voile, A / D pour la barre. Les canons tirent seuls.</p>
    <div class="island-facts">${controls}</div>`;
}

/** En partie : la pause, « Reprendre », et l'heure du jour. */
function pauseHtml(ctx: SettingsContext): string {
  return `
    <p class="subtitle">Le jeu est en pause.</p>
    <div class="choices settings-resume"><button class="choice on" data-action="resume">Reprendre la partie</button></div>
    <h3 class="section">Heure du jour</h3>
    <div class="settings-list">
      <div class="setting">
        <div class="setting-label">
          <b>Il est <span class="clock-label">${clockLabel(ctx.clock)}</span></b>
          <p>Faites glisser le soleil (ou la lune) sur sa course, ou réglez-le aux flèches. De l’aube à l’aube suivante, sans changer de journée : les offres des tavernes restent celles du jour. La nuit, les rencontres sont plus rares.</p>
        </div>
        ${hourDialHtml(ctx.clock)}
      </div>
    </div>`;
}
