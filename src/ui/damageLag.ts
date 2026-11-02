import { FEEDBACK } from '../config';

const B = FEEDBACK.bars;
/** Écart de largeur en dessous duquel on ne réécrit pas le DOM (part de la barre). */
const EPSILON = 0.002;

/**
 * Petit effet de dégâts d'une barre de vie (barres des navires et barre du navire piloté) : quand la vie baisse, la
 * part perdue reste un instant en clair derrière le remplissage (`lag`, élément placé avant lui), puis fond, et le
 * remplissage s'éclaire brièvement. Rien ne bouge ni ne grossit. Quand la vie remonte, la part claire suit tout de suite.
 * Réglages : FEEDBACK.bars.
 */
export class DamageLag {
  private shown = 1;
  private trail = 1;
  private written = -1;
  private hold = 0;
  private last = performance.now();
  private glow: Animation | null = null;

  constructor(
    private readonly fill: HTMLElement,
    private readonly lag: HTMLElement,
    fraction: number,
  ) {
    this.reset(fraction);
  }

  /** Repart de `fraction` sans effet (autre navire montré par la même barre). */
  reset(fraction: number) {
    this.shown = this.trail = fraction;
    this.hold = 0;
    this.write();
  }

  /** Vie actuelle (0 à 1), à appeler à chaque image où la barre est montrée. */
  set(fraction: number) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (fraction < this.shown - EPSILON / 2) {
      this.hold = B.hold;
      this.glow?.cancel();
      this.glow = this.fill.animate([{ filter: `brightness(${B.brightness})` }, { filter: 'none' }], { duration: B.flash * 1000, easing: 'ease-out' });
    }
    this.shown = fraction;
    if (fraction >= this.trail) {
      this.trail = fraction;
      this.hold = 0;
    } else if (this.hold > 0) this.hold -= dt;
    else this.trail = Math.max(fraction, this.trail - B.drain * dt);
    this.write();
  }

  private write() {
    // Petits pas sautés pendant la fonte, mais la fin (part claire rattrapée) est toujours écrite.
    if (this.trail === this.written || (Math.abs(this.trail - this.written) < EPSILON && this.trail !== this.shown)) return;
    this.written = this.trail;
    this.lag.style.width = `${this.trail * 100}%`;
  }
}
