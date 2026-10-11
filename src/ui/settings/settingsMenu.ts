import { GRAPHICS, type GraphicsSettings, type QualityPreset } from '../../config';
import type { Display } from '../../render/display';
import type { Settings } from '../../settings/settings';
import { ParchmentMenu } from '../parchmentMenu';
import { gameTab } from './gameTab';
import { graphicsTab } from './graphicsTab';

/** Ce que les onglets des paramètres lisent et modifient. */
export interface SettingsContext {
  readonly settings: Settings;
  readonly display: Display;
}

type SettingsTab = 'game' | 'graphics';

const TABS: { id: SettingsTab; name: string; render: (ctx: SettingsContext) => string }[] = [
  { id: 'game', name: 'Jeu', render: gameTab },
  { id: 'graphics', name: 'Graphismes', render: graphicsTab },
];

/**
 * Paramètres (Échap, le jeu est en pause) : onglet Jeu (reprendre, compteur d'images, touches) et onglet Graphismes
 * (préréglages de qualité et chaque réglage). Tout s'applique tout de suite et reste d'une partie à l'autre.
 */
export class SettingsMenu extends ParchmentMenu {
  private tab: SettingsTab = 'game';

  constructor(
    parent: HTMLElement,
    private readonly ctx: SettingsContext,
  ) {
    super(parent, 'Paramètres', 'Échap pour reprendre', []);
    this.body.parentElement!.classList.add('settings-sheet');
    this.openOnEscape();
  }

  render() {
    const bar = TABS.map((t) => `<button class="choice${t.id === this.tab ? ' on' : ''}" data-action="tab" data-arg="${t.id}">${t.name}</button>`).join('');
    const current = TABS.find((t) => t.id === this.tab) ?? TABS[0];
    this.body.innerHTML = `<div class="choices port-tabs">${bar}</div>${current.render(this.ctx)}`;
  }

  protected onAction(action: string, arg: string) {
    const settings = this.ctx.settings;
    switch (action) {
      case 'tab':
        this.tab = arg as SettingsTab;
        break;
      case 'resume':
        this.setOpen(false);
        break;
      case 'fps':
        settings.setShowFps(arg === 'true');
        break;
      case 'preset':
        settings.applyPreset(arg as QualityPreset);
        break;
      case 'set': {
        // « clé:valeur », la valeur prend le type du réglage (nombre, oui/non, texte).
        const [key, raw] = arg.split(':') as [keyof GraphicsSettings, string];
        const reference = GRAPHICS.presets.high[key];
        const value = typeof reference === 'number' ? Number(raw) : typeof reference === 'boolean' ? raw === 'true' : raw;
        settings.set(key, value as never);
        break;
      }
    }
  }
}
