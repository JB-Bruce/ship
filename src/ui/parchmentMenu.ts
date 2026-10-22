/**
 * Socle des menus façon parchemin : ouverture par une touche, fermeture par la même touche ou Échap,
 * un seul menu ouvert à la fois. Tant qu'un menu est ouvert, le jeu est en pause. Échap ferme le menu ouvert ; si
 * aucun ne l'est, il ouvre le menu « Échap » (les paramètres).
 */
/** Écart (ms) sous lequel deux Échap sont le même appui. */
const ESCAPE_TWIN = 250;

export abstract class ParchmentMenu {
  private static readonly all: ParchmentMenu[] = [];
  /** Menu ouvert par Échap quand aucun autre ne l'est. */
  private static escapeMenu: ParchmentMenu | null = null;
  private static escapeListening = false;
  /** Consulté par Échap quand aucun menu n'est ouvert, avant d'ouvrir le menu Échap : true = Échap consommé (visée annulée…). */
  static escapeHandler: (() => boolean) | null = null;
  /** Appelé quand le dernier menu ouvert se ferme (la vue à la première personne reprend la souris). */
  static onAllClosed: () => void = () => {};
  /** Heure du dernier Échap traité (ms) : un même appui peut arriver deux fois (touche, et souris rendue par le navigateur). */
  private static lastEscape = -Infinity;
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
      // Un bouton qui ferme le menu (« Retour au port »…) ne le redessine pas : le Chantier y remettrait sa caméra.
      if (this.isOpen) this.render();
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
      if (ParchmentMenu.sameEscape()) return;
      const open = ParchmentMenu.all.find((m) => m.isOpen);
      if (open) open.setOpen(false);
      else if (!ParchmentMenu.escapeHandler?.()) ParchmentMenu.escapeMenu?.setOpen(true);
    });
  }

  /**
   * Échap pressé alors que la souris était capturée : le navigateur rend le curseur sans transmettre la touche. Fait
   * comme Échap quand aucun menu n'est ouvert (visée annulée, sinon menu Échap), dans le même appui.
   */
  static pressEscape() {
    if (ParchmentMenu.sameEscape() || ParchmentMenu.anyOpen()) return;
    if (!ParchmentMenu.escapeHandler?.()) ParchmentMenu.escapeMenu?.setOpen(true);
  }

  /** Cet Échap vient-il d'être traité (même appui reçu deux fois) ? Sinon, il est noté. */
  private static sameEscape(): boolean {
    const now = performance.now();
    if (now - ParchmentMenu.lastEscape < ESCAPE_TWIN) return true;
    ParchmentMenu.lastEscape = now;
    return false;
  }

  setOpen(open: boolean) {
    if (open) for (const other of ParchmentMenu.all) if (other !== this) other.setOpen(false);
    const closing = this.isOpen && !open;
    this.isOpen = open;
    this.root.classList.toggle('on', open);
    if (open) this.render();
    if (closing && !ParchmentMenu.anyOpen()) ParchmentMenu.onAllClosed();
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
