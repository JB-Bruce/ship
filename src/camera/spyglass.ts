import { SPYGLASS } from '../config';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Longue-vue de la première personne : clic gauche maintenu (souris capturée), on la porte à l'œil (champ de vision
 * resserré, cercle noir autour de l'image, regard ralenti d'autant) ; relâché, on la baisse. La molette règle le
 * grossissement pendant qu'on regarde.
 */
export class Spyglass {
  /** Clic gauche maintenu. */
  held = false;
  /** Grossissement choisi. */
  private magnification: number = SPYGLASS.start;
  /** 0 = baissée, 1 = à l'œil. */
  private raised = 0;
  private readonly overlay: HTMLElement;

  constructor(parent: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'spyglass';
    parent.appendChild(this.overlay);
  }

  /** Molette pendant qu'on regarde : plus ou moins de grossissement. */
  wheel(deltaY: number) {
    if (!this.held) return;
    const factor = deltaY < 0 ? SPYGLASS.wheelStep : 1 / SPYGLASS.wheelStep;
    this.magnification = clamp(this.magnification * factor, SPYGLASS.zoom[0], SPYGLASS.zoom[1]);
  }

  /** `usable` : en première personne, souris capturée. */
  update(dt: number, usable: boolean) {
    const target = this.held && usable ? 1 : 0;
    const step = SPYGLASS.response * dt;
    this.raised = this.raised < target ? Math.min(target, this.raised + step) : Math.max(target, this.raised - step);
    this.overlay.style.opacity = this.eased.toFixed(3);
    this.overlay.classList.toggle('on', this.raised > 0);
  }

  /** Grossissement du moment (1 = à l'œil nu). */
  get zoom(): number {
    return 1 + (this.magnification - 1) * this.eased;
  }

  /** Mouvement adouci : la longue-vue part et arrive en douceur. */
  private get eased(): number {
    return this.raised * this.raised * (3 - 2 * this.raised);
  }
}
