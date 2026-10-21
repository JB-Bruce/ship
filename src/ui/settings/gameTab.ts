import { clockLabel } from '../dayClock';
import { hourDialHtml } from './hourDialView';
import type { SettingsContext } from './settingsMenu';

/** Touches du jeu (ZQSD en AZERTY = WASD en QWERTY). */
const CONTROLS: readonly [string, string][] = [
  ['Z / S (maintenir)', 'Hisser / affaler la voile'],
  ['Q / D', 'Barre'],
  ['Souris (clic pour la prendre)', 'Regarder (première personne)'],
  ['V (à la barre)', 'Vue de loin / première personne'],
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
          <p>Faites glisser le soleil (ou la lune) sur sa course, ou réglez-le aux flèches. De l’aube à l’aube suivante, sans changer de journée : les offres des tavernes restent celles du jour. La nuit, les rencontres sont plus rares.</p>
        </div>
        ${hourDialHtml(ctx.clock)}
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
