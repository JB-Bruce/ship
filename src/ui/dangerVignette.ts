import { FEEDBACK } from '../config';
import { sound } from '../audio/sound';
import type { Ship } from '../ship/ship';

const V = FEEDBACK.vignette;
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Le navire piloté est en danger (sous FEEDBACK.vignette.at de vie) : un liseré rouge borde l'écran et bat doucement,
 * de plus en plus fort à mesure que la vie baisse, et l'équipage crie de temps en temps.
 */
export class DangerVignette {
  private readonly el = document.createElement('div');
  private time = 0;
  private shout = rand(V.shout);
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.el.className = 'danger-vignette';
    parent.appendChild(this.el);
  }

  update(dt: number, leader: Ship) {
    const life = leader.health / leader.stats.maxHealth;
    const k = leader.alive ? Math.max(0, Math.min(1, (V.at - life) / V.at)) : 0;
    this.time += dt;
    const opacity = k > 0 ? V.opacity * (0.35 + 0.65 * k) * (0.8 + 0.2 * Math.sin(this.time * Math.PI * 2 * V.pulse)) : 0;
    // Le style n'est touché que si l'opacité change vraiment (pas d'écriture du DOM à chaque image quand tout va bien).
    if (Math.abs(opacity - this.shown) > 0.005) this.el.style.opacity = (this.shown = opacity).toFixed(3);
    if (k <= 0 || dt <= 0) return;
    this.shout -= dt;
    if (this.shout > 0) return;
    this.shout = rand(V.shout);
    sound.at('crew/shout', leader.position);
  }
}
