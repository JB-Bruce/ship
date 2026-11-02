import type { SearchGauge } from '../missions/treasure/treasureRun';

/**
 * Jauge de fouille d'une chasse au trésor, en bas au centre : ce qu'on fouille et l'avancement ; « en pause » quand le
 * navire s'éloigne ou reprend de la vitesse. Ne touche au DOM que quand l'affichage change.
 */
export class SearchGaugeView {
  private readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly fill: HTMLElement;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'search-gauge';
    this.label = this.root.appendChild(document.createElement('div'));
    this.label.className = 'search-gauge-label';
    const bar = this.root.appendChild(document.createElement('div'));
    bar.className = 'search-gauge-bar';
    this.fill = bar.appendChild(document.createElement('span'));
    parent.appendChild(this.root);
  }

  update(gauge: SearchGauge | null) {
    const pct = gauge ? Math.floor(gauge.progress * 100) : -1;
    const key = gauge ? `${gauge.label}|${pct}|${gauge.active}` : '';
    if (key === this.shown) return;
    this.shown = key;
    this.root.classList.toggle('on', !!gauge);
    if (!gauge) return;
    this.root.classList.toggle('paused', !gauge.active);
    this.label.textContent = `🗝 ${gauge.label}${gauge.active ? '…' : ' : en pause (arrête le navire sur place)'}`;
    this.fill.style.width = `${pct}%`;
  }
}
