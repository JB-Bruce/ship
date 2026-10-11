/**
 * Socle des menus façon parchemin : ouverture par une touche, fermeture par la même touche ou Échap,
 * un seul menu ouvert à la fois. Tant qu'un menu est ouvert, le jeu est en pause. Échap ferme le menu ouvert ; si
 * aucun ne l'est, il ouvre le menu « Échap » (les paramètres).
 */
export abstract class ParchmentMenu {
  private static readonly all: ParchmentMenu[] = [];
  /** Menu ouvert par Échap quand aucun autre ne l'est. */
  private static escapeMenu: ParchmentMenu | null = null;
  private static escapeListening = false;
  isOpen = false;
  protected readonly body: HTMLElement;
  private readonly root: HTMLElement;
  private readonly titleElement: HTMLElement;

  /** Un menu est-il ouvert (jeu en pause) ? */
  static anyOpen(): boolean {
    return ParchmentMenu.all.some((m) => m.isOpen);
  }

  /** `hotkey` : un ou plusieurs `KeyboardEvent.code` (ex. la touche M n'a pas le même code en AZERTY et en QWERTY). */
  constructor(parent: HTMLElement, title: string, hint: string, hotkey: string | readonly string[]) {
    const hotkeys: readonly string[] = typeof hotkey === 'string' ? [hotkey] : hotkey;
    this.root = document.createElement('div');
    this.root.className = 'upgrade-menu';
    this.root.innerHTML = `
      <div class="parchment">
        <h1>${title}</h1>
        <div class="menu-body"></div>
        <p class="hint">${hint}</p>
      </div>`;
    this.body = this.root.querySelector('.menu-body')!;
    this.titleElement = this.root.querySelector('h1')!;
    // Un seul écouteur de clics : les boutons portent leur action dans data-action / data-arg.
    this.body.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button || button.disabled) return;
      this.onAction(button.dataset.action!, button.dataset.arg ?? '');
      this.render();
    });
    parent.appendChild(this.root);
    ParchmentMenu.all.push(this);

    window.addEventListener('keydown', (e) => {
      if (!hotkeys.includes(e.code)) return;
      e.preventDefault();
      if (!e.repeat) this.toggle(e.code);
    });
    ParchmentMenu.listenEscape();
  }

  /** Ce menu s'ouvre par Échap quand aucun menu n'est ouvert. */
  protected openOnEscape() {
    ParchmentMenu.escapeMenu = this;
  }

  /** Un seul écouteur pour Échap, quel que soit le nombre de menus : il ferme le menu ouvert, sinon ouvre le menu Échap. */
  private static listenEscape() {
    if (ParchmentMenu.escapeListening) return;
    ParchmentMenu.escapeListening = true;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      e.preventDefault();
      const open = ParchmentMenu.all.find((m) => m.isOpen);
      if (open) open.setOpen(false);
      else ParchmentMenu.escapeMenu?.setOpen(true);
    });
  }

  setOpen(open: boolean) {
    if (open) for (const other of ParchmentMenu.all) if (other !== this) other.setOpen(false);
    this.isOpen = open;
    this.root.classList.toggle('on', open);
    if (open) this.render();
  }

  /** Touche du menu pressée (`code` : laquelle, s'il y en a plusieurs) : ouvre ou ferme le menu. */
  protected toggle(_code: string) {
    this.setOpen(!this.isOpen);
  }

  /** Change le titre du parchemin (menu commun à plusieurs lieux). */
  protected setTitle(title: string) {
    if (this.titleElement.textContent !== title) this.titleElement.textContent = title;
  }

  /** Redessine le contenu du menu. */
  abstract render(): void;

  /** Réagit à un clic sur un bouton `data-action="…" data-arg="…"`. Le menu est redessiné ensuite. */
  protected abstract onAction(action: string, arg: string): void;
}

/** Montant en or et bois, avec la partie manquante barrée en rouge. */
export function costHtml(gold: number, wood: number, haveGold = Infinity, haveWood = Infinity): string {
  return [
    gold ? `<span class="gold${haveGold < gold ? ' short' : ''}">${gold} or</span>` : '',
    wood ? `<span class="wood${haveWood < wood ? ' short' : ''}">${wood} bois</span>` : '',
  ]
    .filter(Boolean)
    .join(' + ');
}
