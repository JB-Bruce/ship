import { MAIN_MENU } from '../../config';
import { sound } from '../../audio/sound';
import type { SaveEntry } from '../../save/saveStore';
import './mainMenu.css';

/** Ce que le menu principal sait faire : il ne fait que transmettre les choix du joueur. */
export interface MainMenuActions {
  newGame(): void;
  saves(): SaveEntry[];
  load(id: string): void;
  /** Monte les réglages (onglets Jeu et Graphismes) dans `host`, ou les rend à leur menu avec null. */
  options(host: HTMLElement | null): void;
}

type View = 'home' | 'load' | 'options';

const dateText = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Menu principal, au lancement : le vrai monde vit derrière (la caméra tourne autour de la chaloupe, dans la crique de
 * la Tortue), le titre du jeu en haut à gauche, et un parchemin cloué : Nouvelle partie, Charger une partie, Options.
 * « Charger » et « Options » s'ouvrent dans le même parchemin, qui s'agrandit peu à peu (`morph`) ; Échap ou « Retour »
 * reviennent au premier choix. Le premier clic allume le son (le navigateur l'exige). Le jeu ne se pilote pas tant
 * qu'il est ouvert (`active`). Réglages : MAIN_MENU.
 */
export class MainMenu {
  private readonly root = document.createElement('div');
  private readonly panel: HTMLElement;
  private view: View = 'home';
  private morphEnd = 0;
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
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mm]');
      if (!button || button.disabled) return;
      void sound.unlock();
      sound.play('ui/wood_click');
      this.act(button.dataset.mm!, button.dataset.arg ?? '');
    });
    addEventListener('keydown', (e) => {
      if (!this.active || e.code !== 'Escape' || this.view === 'home') return;
      e.preventDefault();
      this.go('home');
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
    if (this.view === 'options') this.actions.options(null);
    this.active = false;
    document.body.classList.remove('main-menu-open');
    this.root.classList.remove('on');
  }

  private act(action: string, arg: string) {
    if (action === 'new') this.actions.newGame();
    else if (action === 'load') this.actions.load(arg);
    else this.go(action === 'list' ? 'load' : (action as View));
  }

  private go(view: View) {
    if (view === this.view) return;
    sound.play('ui/paper');
    this.morph(() => {
      if (this.view === 'options') this.actions.options(null);
      this.view = view;
      this.render();
    });
  }

  /**
   * Change le contenu du parchemin en le faisant grandir (ou rapetisser) peu à peu de sa taille d'avant à sa nouvelle
   * taille, le nouveau contenu apparaissant en fondu.
   */
  private morph(update: () => void) {
    const p = this.panel;
    clearTimeout(this.morphEnd);
    p.classList.remove('morphing');
    p.style.width = p.style.height = '';
    const from = p.getBoundingClientRect();
    update();
    const to = p.getBoundingClientRect();
    p.style.width = `${from.width}px`;
    p.style.height = `${from.height}px`;
    void p.offsetWidth;
    p.classList.add('morphing');
    p.style.width = `${to.width}px`;
    p.style.height = `${to.height}px`;
    this.morphEnd = window.setTimeout(() => {
      p.classList.remove('morphing');
      p.style.width = p.style.height = '';
    }, MAIN_MENU.morphTime * 1000);
  }

  private render() {
    const p = this.panel;
    p.dataset.view = this.view;
    if (this.view === 'home') {
      const count = this.actions.saves().length;
      p.innerHTML = `
        <div class="mm-content">
          <button class="mm-item" data-mm="new">Nouvelle partie</button>
          <button class="mm-item" data-mm="list" ${count ? '' : 'disabled'}>Charger une partie${count ? '' : '<small>Aucune sauvegarde</small>'}</button>
          <button class="mm-item" data-mm="options">Options</button>
        </div>`;
      return;
    }
    const title = this.view === 'load' ? 'Charger une partie' : 'Options';
    const rows = this.view === 'load'
      ? this.actions
          .saves()
          .map((e) => `<button class="mm-save" data-mm="load" data-arg="${e.id}"><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.summary)}</span><i>${dateText(e.savedAt)}</i></button>`)
          .join('')
      : '';
    p.innerHTML = `
      <div class="mm-content">
        <h2>${title}</h2>
        <div class="parchment mm-sheet mm-${this.view}">${rows}</div>
        <button class="mm-item small" data-mm="home">Retour</button>
      </div>`;
    if (this.view === 'options') this.actions.options(p.querySelector('.mm-sheet'));
  }
}
