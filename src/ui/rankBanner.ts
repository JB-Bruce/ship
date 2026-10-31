import { RANKS } from '../config';
import { sound } from '../audio/sound';

/** Durée d'affichage d'une montée en rang (s de jeu). */
const SHOW_TIME = 4.2;

/**
 * Un navire de ta flotte monte en rang : en haut de l'écran, son pavillon de rang se hisse le long d'une drisse (un
 * pavillon noir semé d'autant d'étoiles que son rang), avec son nom et son nouveau titre ; l'équipage acclame et la
 * cloche sonne. Le jeu continue ; plusieurs promotions d'affilée attendent leur tour.
 */
export class RankBanner {
  private readonly el = document.createElement('div');
  private readonly queue: { name: string; rank: number }[] = [];
  private time = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'rank-banner';
    parent.appendChild(this.el);
  }

  show(name: string, rank: number) {
    this.queue.push({ name, rank });
    if (this.time <= 0) this.next();
  }

  update(dt: number) {
    if (this.time <= 0) return;
    this.time -= dt;
    if (this.time > 0) return;
    this.el.classList.remove('on');
    if (this.queue.length) this.next();
  }

  private next() {
    const { name, rank } = this.queue.shift()!;
    const stars = Array.from({ length: rank }, (_, i) => {
      const x = 40 + (i - (rank - 1) / 2) * 22;
      return `<path transform="translate(${x} 34) scale(0.9)" d="M0 -9L2.6 -2.8L9 -2.8L3.8 1.2L5.8 8L0 4L-5.8 8L-3.8 1.2L-9 -2.8L-2.6 -2.8Z"/>`;
    }).join('');
    this.el.innerHTML = `
      <svg class="rank-flag" viewBox="0 0 96 70" aria-hidden="true">
        <path class="rank-pole" d="M4 0V70"/>
        <path class="rank-cloth" d="M6 6H90L80 32L90 58H6Z"/>
        <g class="rank-stars">${stars}</g>
      </svg>
      <div class="rank-text"><b>${name}</b><span>devient ${RANKS.levels[rank]?.name ?? ''}</span></div>`;
    this.el.classList.remove('on');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this.time = SHOW_TIME;
    sound.play('crew/cheer');
    sound.play('ambience/ship_bell');
  }
}
