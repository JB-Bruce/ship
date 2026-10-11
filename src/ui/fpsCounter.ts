import type { Display } from '../render/display';
import type { Settings } from '../settings/settings';

/** Petit compteur d'images par seconde en haut à gauche (paramètres, onglet Jeu). */
export class FpsCounter {
  private readonly element = document.createElement('div');
  private shown = -1;

  constructor(
    parent: HTMLElement,
    private readonly settings: Settings,
    private readonly display: Display,
  ) {
    this.element.className = 'fps-counter';
    parent.appendChild(this.element);
  }

  update() {
    const visible = this.settings.showFps;
    this.element.style.display = visible ? '' : 'none';
    if (!visible || this.display.fps === this.shown) return;
    this.shown = this.display.fps;
    this.element.textContent = `${this.shown} i/s`;
  }
}
