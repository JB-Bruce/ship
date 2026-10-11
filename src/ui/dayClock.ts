import type { DayCycle } from '../world/dayCycle';

const SVG = 'http://www.w3.org/2000/svg';
/** Cadran : largeur, hauteur, ligne d'horizon, demi-largeur et hauteur de la course (px). */
const W = 64;
const H = 26;
const HORIZON = 22;
const SPAN = 26;
const RISE = 18;
/** Les aiguilles avancent par pas de 10 minutes de jeu (le DOM n'est touché qu'à chaque pas). */
const STEP_MINUTES = 10;

const svg = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** « 21 h 30 » (à la minute près, puis au pas `step` en dessous). */
export function formatHour(hour: number, step = 1): string {
  const minutes = Math.floor(Math.round(hour * 60) / step) * step;
  return `${Math.floor(minutes / 60) % 24} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Moment de la journée : nuit, aube, jour ou crépuscule. */
export function periodOf(day: DayCycle): string {
  if (day.night > 0.5) return 'Nuit';
  if (day.twilight > 0.4) return day.hour < 12 ? 'Aube' : 'Crépuscule';
  return 'Jour';
}

/** « 22 h 00 (nuit) » : heure et moment de la journée (curseur d'heure du menu Échap). */
export const clockLabel = (day: DayCycle) => `${formatHour(day.hour)} (${periodOf(day).toLowerCase()})`;

/**
 * Horloge au-dessus des boutons de météo : un petit cadran où le soleil (ou la lune) suit sa course au-dessus de
 * l'horizon, l'heure et le moment de la journée.
 */
export class DayClock {
  private readonly root = document.createElement('div');
  private readonly sun: SVGElement;
  private readonly moon: SVGElement;
  private readonly time = document.createElement('span');
  private readonly period = document.createElement('span');
  private shownStep = -1;
  private shownPeriod = '';

  constructor(
    parent: HTMLElement,
    private readonly day: DayCycle,
  ) {
    this.root.className = 'day-clock';
    this.root.title = 'Heure du jour (la nuit, les rencontres sont plus rares)';
    const dial = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    dial.appendChild(svg('line', { x1: 2, y1: HORIZON, x2: W - 2, y2: HORIZON, class: 'day-clock-horizon' }));
    this.sun = svg('circle', { r: 4.5, class: 'day-clock-sun' });
    // Croissant : un disque clair, mordu (masque) par un disque décalé.
    const defs = svg('defs', {});
    const mask = svg('mask', { id: 'day-clock-crescent' });
    mask.append(svg('circle', { r: 4.5, fill: 'white' }), svg('circle', { r: 4, cx: 2.4, cy: -1.6, fill: 'black' }));
    defs.appendChild(mask);
    this.moon = svg('circle', { r: 4.5, class: 'day-clock-moon', mask: 'url(#day-clock-crescent)' });
    dial.append(defs, this.sun, this.moon);
    const text = document.createElement('div');
    text.className = 'day-clock-text';
    this.period.className = 'day-clock-period';
    text.append(this.time, this.period);
    this.root.append(dial, text);
    parent.appendChild(this.root);
    this.update();
  }

  /** À appeler chaque image (ne touche au DOM que toutes les 10 minutes de jeu). */
  update() {
    const minutes = Math.floor((this.day.hour * 60) / STEP_MINUTES) * STEP_MINUTES;
    const period = periodOf(this.day);
    if (minutes === this.shownStep && period === this.shownPeriod) return;
    this.shownStep = minutes;
    this.shownPeriod = period;
    this.time.textContent = formatHour(this.day.hour, STEP_MINUTES);
    this.period.textContent = period;
    // Le soleil et la lune se lèvent à gauche (est) et se couchent à droite, comme dans le ciel.
    this.place(this.sun, this.day.sun.x, this.day.sun.y);
    this.place(this.moon, this.day.moon.x, this.day.moon.y);
  }

  private place(el: SVGElement, x: number, y: number) {
    el.style.display = y > -0.02 ? '' : 'none';
    el.setAttribute('transform', `translate(${(W / 2 - SPAN * x).toFixed(1)} ${(HORIZON - RISE * Math.max(0, y)).toFixed(1)})`);
  }
}
