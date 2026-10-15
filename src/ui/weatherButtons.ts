import type { Weather, WeatherKind } from '../world/weather';

const CHOICES: readonly { kind: WeatherKind; icon: string; title: string }[] = [
  { kind: 'clear', icon: '☀', title: 'Beau temps' },
  { kind: 'fog', icon: '🌫', title: 'Brouillard' },
  { kind: 'windy', icon: '💨', title: 'Grand vent' },
  { kind: 'rain', icon: '🌧', title: 'Pluie' },
  { kind: 'storm', icon: '⛈', title: 'Orage' },
  { kind: 'tempest', icon: '🌊', title: 'Grosse tempête' },
  { kind: 'greatStorm', icon: '⛰', title: 'Grande tempête' },
];

/** Boutons au-dessus du radar pour choisir le temps. Le changement se fait petit à petit. */
export class WeatherButtons {
  private readonly buttons: HTMLButtonElement[] = [];
  /** Temps surligné. */
  private shown: WeatherKind | null = null;

  constructor(
    parent: HTMLElement,
    private readonly weather: Weather,
  ) {
    const bar = document.createElement('div');
    bar.className = 'weather-buttons';
    for (const choice of CHOICES) {
      const button = document.createElement('button');
      button.textContent = choice.icon;
      button.title = `${choice.title} (arrive petit à petit)`;
      // Hors du parcours au clavier : Espace ou Tab ne doivent pas le déclencher par accident.
      button.tabIndex = -1;
      button.addEventListener('click', () => {
        this.weather.target = choice.kind;
        button.blur();
        this.update();
      });
      this.buttons.push(button);
      bar.appendChild(button);
    }
    parent.appendChild(bar);
    this.update();
  }

  /** À appeler chaque image : suit aussi les changements de temps qui ne viennent pas des boutons. */
  update() {
    if (this.weather.target === this.shown) return;
    this.shown = this.weather.target;
    CHOICES.forEach((c, i) => this.buttons[i].classList.toggle('on', c.kind === this.shown));
  }
}
