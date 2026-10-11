import { DAY_NIGHT } from '../../config';
import type { DayCycle } from '../../world/dayCycle';
import { DIAL_HOURS, DIAL_STEP, dialHourAt, dialPoint, grabsMoon, refreshDial, snapHours } from './hourDialView';

/** Grand pas (Maj + flèche, Page haut / bas) : une heure. */
const BIG_STEP = 1;
/** Rayon (unités du cadran) dans lequel un clic prend la lune plutôt que de poser le soleil. */
const MOON_GRAB = 14;
/** Flèches : droite et haut avancent, gauche et bas reculent. */
const ARROWS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
const PAGES: Readonly<Record<string, number>> = { PageUp: 1, PageDown: -1 };

const dialOf = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('.hour-dial') : null);

/**
 * Curseur d'heure du menu Échap (cadran de `hourDialView.ts`) : on fait glisser le soleil sur sa course, ou la lune
 * la nuit (le soleil suit, à l'opposé) ; un clic ailleurs sur le cadran y pose le soleil. Au clavier : flèches (un
 * quart d'heure), Maj + flèches ou Page haut / bas (une heure), Début (l'aube) et Fin (la dernière heure avant l'aube) ;
 * le clavier s'arrête aux bouts, la souris fait le tour du jour (sans changer de journée). L'anneau de focus ne se
 * montre qu'au clavier (classe `pointer` posée au clic). Les écouteurs sont délégués à `host` (le contenu du menu),
 * redessiné à chaque clic sur un bouton ; rien n'est redessiné pendant qu'on glisse.
 */
export class HourDial {
  /** Heures à ajouter à celle que désigne le pointeur : 12 quand on tient la lune. */
  private grabOffset = 0;

  constructor(
    host: HTMLElement,
    private readonly day: DayCycle,
    /** Après chaque changement d'heure (libellé). */
    private readonly onChange: () => void,
  ) {
    host.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    host.addEventListener('pointermove', (e) => {
      const dial = dialOf(e);
      if (dial?.hasPointerCapture(e.pointerId)) this.follow(dial, e);
    });
    host.addEventListener('lostpointercapture', (e) => dialOf(e)?.classList.remove('dragging'));
    host.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onPointerDown(e: PointerEvent) {
    const dial = dialOf(e);
    if (!dial || e.button !== 0) return;
    // Pas de sélection de texte ni de glisser du navigateur ; le focus passe quand même au curseur (clavier ensuite).
    e.preventDefault();
    dial.classList.add('pointer');
    dial.focus({ preventScroll: true });
    dial.setPointerCapture(e.pointerId);
    dial.classList.add('dragging');
    const svg = dial.querySelector('svg');
    if (!svg) return;
    const p = dialPoint(svg, e.clientX, e.clientY);
    this.grabOffset = grabsMoon(this.day, p.x, p.y, MOON_GRAB) ? DIAL_HOURS / 2 : 0;
    this.follow(dial, e);
  }

  /** Le soleil (ou la lune) suit le pointeur. */
  private follow(dial: HTMLElement, e: PointerEvent) {
    const svg = dial.querySelector('svg');
    if (!svg) return;
    const p = dialPoint(svg, e.clientX, e.clientY);
    const hour = dialHourAt(p.x, p.y);
    if (hour !== null) this.set(dial, hour + this.grabOffset - DAY_NIGHT.dawnHour);
  }

  private onKey(e: KeyboardEvent) {
    const dial = dialOf(e);
    if (!dial) return;
    const value = Number(dial.getAttribute('aria-valuenow'));
    let next: number;
    if (e.code in ARROWS) next = value + ARROWS[e.code] * (e.shiftKey ? BIG_STEP : DIAL_STEP);
    else if (e.code in PAGES) next = value + PAGES[e.code] * BIG_STEP;
    else if (e.code === 'Home') next = 0;
    else if (e.code === 'End') next = DIAL_HOURS - DIAL_STEP;
    else return;
    // Les flèches ne font pas défiler le parchemin (SettingsMenu les empêche déjà de barrer le navire).
    e.preventDefault();
    dial.classList.remove('pointer');
    this.set(dial, Math.min(DIAL_HOURS - DIAL_STEP, Math.max(0, next)));
  }

  /** Règle l'heure (heures depuis l'aube) : le ciel du jeu, le cadran et le libellé suivent. */
  private set(dial: HTMLElement, sinceDawn: number) {
    const value = snapHours(sinceDawn);
    if (value.toFixed(2) === dial.getAttribute('aria-valuenow')) return;
    this.day.setHour(DAY_NIGHT.dawnHour + value);
    refreshDial(dial, this.day);
    this.onChange();
  }
}
