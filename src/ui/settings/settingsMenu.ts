import { DAY_NIGHT, GRAPHICS, type GraphicsSettings, type QualityPreset } from '../../config';
import type { Display } from '../../render/display';
import type { SaveManager } from '../../save/saveManager';
import type { Settings } from '../../settings/settings';
import type { DayCycle } from '../../world/dayCycle';
import { ParchmentMenu } from '../parchmentMenu';
import { clockLabel, gameTab } from './gameTab';
import { graphicsTab } from './graphicsTab';
import { saveTab, type SaveView } from './saveTab';

/** Ce que les onglets des paramètres lisent et modifient. */
export interface SettingsContext {
  readonly settings: Settings;
  readonly display: Display;
  readonly saves: SaveManager;
  /** Heure du jour (curseur de l'onglet Jeu). */
  readonly clock: DayCycle;
}

type SettingsTab = 'game' | 'save' | 'graphics';

const TABS: { id: SettingsTab; name: string; render: (ctx: SettingsContext, view: SaveView) => string }[] = [
  { id: 'game', name: 'Jeu', render: gameTab },
  { id: 'save', name: 'Partie', render: saveTab },
  { id: 'graphics', name: 'Graphismes', render: graphicsTab },
];

/**
 * Paramètres (Échap, le jeu est en pause) : onglet Jeu (reprendre, compteur d'images, touches), onglet Partie
 * (sauvegardes, nouvelle partie) et onglet Graphismes (préréglages de qualité et chaque réglage). Les réglages
 * s'appliquent tout de suite et restent d'une partie à l'autre.
 */
export class SettingsMenu extends ParchmentMenu {
  private tab: SettingsTab = 'game';
  private readonly saveView: SaveView = { notice: '', confirm: null };
  /** Choix d'un fichier à importer (hors du contenu, qui est redessiné à chaque clic). */
  private readonly fileInput = document.createElement('input');

  constructor(
    parent: HTMLElement,
    private readonly ctx: SettingsContext,
  ) {
    super(parent, 'Paramètres', 'Échap pour reprendre', []);
    this.body.parentElement!.classList.add('settings-sheet');
    this.openOnEscape();
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.hidden = true;
    this.body.parentElement!.append(this.fileInput);
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (!file) return;
      void ctx.saves.importFile(file).then((notice) => {
        this.saveView.notice = notice;
        this.render();
      });
    });
    // Le nom de la sauvegarde se tape (et le curseur d'heure se règle au clavier) sans déclencher les touches du jeu
    // (T, M, Z…) ; Entrée sauvegarde.
    this.body.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.code === 'Escape') return;
      e.stopPropagation();
      if (!e.target.classList.contains('save-name') || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
      this.onAction('save', '');
      this.render();
    });
    this.body.addEventListener('input', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.classList.contains('clock-slider')) this.onHourInput(e.target);
    });
  }

  /** Curseur d'heure : le ciel suit pendant qu'on le glisse (sans redessiner l'onglet, qui lâcherait le curseur). */
  private onHourInput(input: HTMLInputElement) {
    const clock = this.ctx.clock;
    clock.setHour(DAY_NIGHT.dawnHour + Number(input.value));
    const label = this.body.querySelector('.clock-label');
    if (label) label.textContent = clockLabel(clock);
  }

  render() {
    const bar = TABS.map((t) => `<button class="choice${t.id === this.tab ? ' on' : ''}" data-action="tab" data-arg="${t.id}">${t.name}</button>`).join('');
    const current = TABS.find((t) => t.id === this.tab) ?? TABS[0];
    this.body.innerHTML = `<div class="choices port-tabs">${bar}</div>${current.render(this.ctx, this.saveView)}`;
  }

  setOpen(open: boolean) {
    if (open) this.saveView.confirm = null;
    super.setOpen(open);
  }

  protected onAction(action: string, arg: string) {
    const settings = this.ctx.settings;
    if (this.tab === 'save' && this.saveAction(action, arg)) return;
    switch (action) {
      case 'tab':
        this.tab = arg as SettingsTab;
        this.saveView.notice = '';
        this.saveView.confirm = null;
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

  /** Actions de l'onglet Partie. Renvoie true si l'action en était une. */
  private saveAction(action: string, arg: string): boolean {
    const saves = this.ctx.saves;
    const view = this.saveView;
    switch (action) {
      case 'save': {
        const input = this.body.querySelector<HTMLInputElement>('.save-name');
        view.notice = saves.save(input?.value ?? '');
        view.confirm = null;
        return true;
      }
      case 'ask':
        view.confirm = arg;
        return true;
      case 'cancel':
        view.confirm = null;
        return true;
      case 'export':
        saves.exportFile(arg);
        return true;
      case 'import':
        this.fileInput.click();
        return true;
      case 'confirm': {
        view.confirm = null;
        const [what, id] = arg.split(':');
        if (what === 'load') saves.load(id);
        else if (what === 'replace') view.notice = saves.save(saves.entries().find((e) => e.id === id)?.name ?? '', id);
        else if (what === 'delete') {
          saves.remove(id);
          view.notice = 'Sauvegarde supprimée.';
        } else if (what === 'reset') saves.newGame();
        return true;
      }
    }
    return false;
  }
}
