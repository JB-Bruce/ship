import type { DayCycle } from '../../world/dayCycle';
import { formatHour, periodOf } from '../dayClock';
import type { SettingsContext } from './settingsMenu';

/** Touches du jeu (ZQSD en AZERTY = WASD en QWERTY). */
const CONTROLS: readonly [string, string][] = [
  ['Z / S (maintenir)', 'Hisser / affaler la voile'],
  ['Q / D', 'Barre'],
  ['Glisser la souris · molette', 'Tourner la caméra · zoom'],
  ['E (près d’un quai)', 'Port'],
  ['Tab (près d’un quai)', 'Chantier naval'],
  ['T', 'Flotte'],
  ['M', 'Carte'],
  ['F (près d’un banc)', 'Pêcher'],
  ['Échap', 'Paramètres (pause)'],
];

/** Heure et moment de la journée, à côté du curseur d'heure. */
export const clockLabel = (clock: DayCycle) => `${formatHour(clock.hour)} (${periodOf(clock).toLowerCase()})`;

/** Onglet Jeu : reprendre la partie, heure du jour, affichage du compteur d'images, rappel des touches. */
export function gameTab(ctx: SettingsContext): string {
  const showFps = ctx.settings.showFps;
  const controls = CONTROLS.map(([key, action]) => `<div><span>${action}</span><b>${key}</b></div>`).join('');
  return `
    <p class="subtitle">Le jeu est en pause.</p>
    <div class="choices settings-resume"><button class="choice on" data-action="resume">Reprendre la partie</button></div>
    <h3 class="section">Heure du jour</h3>
    <div class="settings-list">
      <div class="setting">
        <div class="setting-label">
          <b>Il est <span class="clock-label">${clockLabel(ctx.clock)}</span></b>
          <p>De l’aube à l’aube suivante, sans changer de journée : les offres des tavernes restent celles du jour. La nuit, les rencontres sont plus rares.</p>
        </div>
        <input class="clock-slider" type="range" min="0" max="23.75" step="0.25" value="${ctx.clock.sinceDawn}" aria-label="Heure du jour" />
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
