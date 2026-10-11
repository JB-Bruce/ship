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

/** Onglet Jeu : reprendre la partie, affichage du compteur d'images, rappel des touches. */
export function gameTab(ctx: SettingsContext): string {
  const showFps = ctx.settings.showFps;
  const controls = CONTROLS.map(([key, action]) => `<div><span>${action}</span><b>${key}</b></div>`).join('');
  return `
    <p class="subtitle">Le jeu est en pause.</p>
    <div class="choices settings-resume"><button class="choice on" data-action="resume">Reprendre la partie</button></div>
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
