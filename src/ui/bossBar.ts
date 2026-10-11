/** Rafraîchissement de la largeur seulement quand elle change d'un dixième de pour cent. */
const PRECISION = 1000;

/**
 * Grande barre de vie en haut de l'écran, avec un nom : le boss (`boss`), ou la citadelle assiégée d'une mission
 * de défense (`siege`, juste en dessous).
 */
export class ObjectiveBar {
  private readonly root: HTMLElement;
  private readonly name: HTMLElement;
  private readonly fill: HTMLElement;
  private shown = false;
  private lastWidth = -1;

  constructor(parent: HTMLElement, variant: 'boss' | 'siege') {
    this.root = document.createElement('div');
    this.root.className = `boss-bar ${variant}`;
    this.root.innerHTML = `<div class="boss-name"></div><div class="boss-health"><div></div></div>`;
    this.name = this.root.querySelector('.boss-name')!;
    this.fill = this.root.querySelector('.boss-health div')!;
    parent.appendChild(this.root);
  }

  /** `label` : nom affiché, ou null pour cacher la barre ; `fraction` : vie restante (0..1). */
  update(label: string | null, fraction: number) {
    const show = label !== null;
    if (show !== this.shown) {
      this.shown = show;
      this.root.classList.toggle('on', show);
    }
    if (!label) return;
    if (this.name.textContent !== label) this.name.textContent = label;
    const width = Math.round(fraction * PRECISION) / (PRECISION / 100);
    if (width === this.lastWidth) return;
    this.lastWidth = width;
    this.fill.style.width = `${width}%`;
  }
}
