import { WEATHER } from '../config';
import type { Weather, WeatherKind } from './weather';

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Changements de temps automatiques : le beau temps dure longtemps (`WEATHER.cycle.clear`), puis un autre temps tiré
 * au sort (poids `cycle.weights`) dure moins (`cycle.other`) avant que le beau temps revienne : au moins 70 % du temps
 * est clair. Un temps choisi à la main (boutons) repart pour sa durée habituelle.
 */
export class WeatherCycle {
  private timer = rand(WEATHER.cycle.clear);
  private set: WeatherKind;

  constructor(private readonly weather: Weather) {
    this.set = weather.target;
  }

  update(dt: number) {
    const w = this.weather;
    // Choisi à la main (ou repris d'une sauvegarde) : il dure son temps habituel.
    if (w.target !== this.set) {
      this.set = w.target;
      this.timer = this.duration(w.target);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.set = w.target = w.target === 'clear' ? this.pick() : 'clear';
    this.timer = this.duration(this.set);
  }

  private duration(kind: WeatherKind): number {
    return rand(kind === 'clear' ? WEATHER.cycle.clear : WEATHER.cycle.other);
  }

  /** Un temps autre que le beau temps, au hasard selon les poids. */
  private pick(): WeatherKind {
    const weights = WEATHER.cycle.weights;
    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    let r = Math.random() * total;
    for (const [kind, weight] of Object.entries(weights) as [WeatherKind, number][]) {
      r -= weight;
      if (r <= 0) return kind;
    }
    return 'fog';
  }
}
