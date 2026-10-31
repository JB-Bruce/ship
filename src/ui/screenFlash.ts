/**
 * Éclat de l'écran (explosion géante d'un brûlot) : une lueur chaude qui couvre la vue puis s'éteint en `time` s.
 * Animation du navigateur, rien à mettre à jour à chaque image.
 */
export class ScreenFlash {
  private readonly el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen-flash';
    parent.appendChild(this.el);
  }

  /** `strength` : opacité de départ (0 à 1). */
  flash(strength: number, time: number) {
    if (strength <= 0) return;
    this.el.animate([{ opacity: Math.min(1, strength) }, { opacity: 0 }], { duration: time * 1000, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' });
  }
}
