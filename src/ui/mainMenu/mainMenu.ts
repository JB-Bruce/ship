import { sound } from '../../audio/sound';
import type { SaveEntry } from '../../save/saveStore';
import './mainMenu.css';

/** Ce que le menu principal sait faire : il ne fait que transmettre les choix du joueur. */
export interface MainMenuActions {
  newGame(): void;
  saves(): SaveEntry[];
  load(id: string): void;
  options(): void;
}

const dateText = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Menu principal, au lancement : le vrai monde vit derrière (la caméra tourne autour de la chaloupe, dans la crique de
 * la Tortue), le titre du jeu en haut à gauche, et un parchemin cloué : Nouvelle partie, Charger une partie, Options.
 * « Charger » déroule la liste des sauvegardes sur le même parchemin. Le premier clic allume le son (le navigateur
 * l'exige). Le jeu ne se pilote pas tant qu'il est ouvert (`active`).
 */
export class MainMenu {
  private readonly root = document.createElement('div');
  private readonly panel: HTMLElement;
  private view: 'home' | 'load' = 'home';
  active = false;

  constructor(
    parent: HTMLElement,
    private readonly actions: MainMenuActions,
  ) {
    this.root.className = 'main-menu';
    this.root.innerHTML = `
      <div class="mm-title">
        <h1>Pirate’s life</h1>
        <p>Au temps des flibustiers</p>
      </div>
      <nav class="mm-panel"></nav>`;
    this.panel = this.root.querySelector('.mm-panel')!;
    this.root.addEventListener('pointerdown', () => void sound.unlock());
    this.panel.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button || button.disabled) return;
      void sound.unlock();
      sound.play('ui/wood_click');
      this.act(button.dataset.action!, button.dataset.arg ?? '');
    });
    parent.appendChild(this.root);
  }

  show() {
    this.active = true;
    this.view = 'home';
    this.render();
    document.body.classList.add('main-menu-open');
    this.root.classList.add('on');
  }

  hide() {
    this.active = false;
    document.body.classList.remove('main-menu-open');
    this.root.classList.remove('on');
  }

  /** Le parchemin seul disparaît (options ouvertes par-dessus), le titre reste. */
  set dimmed(on: boolean) {
    this.root.classList.toggle('dimmed', on);
  }

  private act(action: string, arg: string) {
    if (action === 'new') this.actions.newGame();
    else if (action === 'options') this.actions.options();
    else if (action === 'load') this.actions.load(arg);
    else if (action === 'list' || action === 'home') {
      this.view = action === 'list' ? 'load' : 'home';
      sound.play('ui/paper');
      this.render();
    }
  }

  private render() {
    if (this.view === 'home') {
      const count = this.actions.saves().length;
      this.panel.innerHTML = `
        <button class="mm-item" data-action="new">Nouvelle partie</button>
        <button class="mm-item" data-action="list" ${count ? '' : 'disabled'}>Charger une partie${count ? '' : '<small>Aucune sauvegarde</small>'}</button>
        <button class="mm-item" data-action="options">Options</button>`;
      return;
    }
    const rows = this.actions
      .saves()
      .map((e) => `<button class="mm-save" data-action="load" data-arg="${e.id}"><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.summary)}</span><i>${dateText(e.savedAt)}</i></button>`)
      .join('');
    this.panel.innerHTML = `
      <h2>Charger une partie</h2>
      <div class="mm-saves">${rows}</div>
      <button class="mm-item small" data-action="home">Retour</button>`;
  }
}
