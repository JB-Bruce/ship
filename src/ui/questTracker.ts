import { ISLAND_INFO } from '../config';
import type { Fleet } from '../fleet/fleet';
import { MISSION_TYPES, missionType, starsText, type Contract, type Contracts } from '../progression/contracts';
import { contractProgress } from './port/tavernTab';

/** Intervalle de rafraîchissement (s) : inutile de refaire la liste à chaque image. */
const REFRESH = 0.3;

/**
 * Suivi des contrats acceptés, en haut à droite : titre, avancement et petite barre. Un contrat rempli rappelle
 * où aller toucher la prime (ou livrer la marchandise). `status` : état d'une mission en cours (escorte, siège…).
 */
export class QuestTracker {
  private readonly root: HTMLElement;
  private timer = 0;
  private html = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'quest-tracker';
    parent.appendChild(this.root);
  }

  /** Pendant la pause (dt = 0), la liste suit tout de suite ce qui change à la taverne. */
  update(dt: number, contracts: Contracts, fleet: Fleet, status: (c: Contract) => string | null) {
    this.timer -= dt;
    if (this.timer > 0 && dt > 0) return;
    this.timer = REFRESH;
    const html = contracts.active.map((c) => this.entry(c, contracts, fleet, status(c))).join('');
    if (html === this.html) return;
    this.html = html;
    this.root.innerHTML = html;
  }

  private entry(c: Contract, contracts: Contracts, fleet: Fleet, status: string | null): string {
    const { count, ready } = contractProgress(c, contracts, fleet);
    const port = ISLAND_INFO[c.claimAt].portName;
    const type = MISSION_TYPES[missionType(c)];
    const note = ready ? (c.kind === 'deliver' ? `Livre-les à ${port}` : `Prime à toucher à ${port}`) : status;
    return `
      <div class="quest${ready ? ' done' : ''}">
        <div class="quest-title"><span class="quest-icon" title="${type.name}">${type.icon}</span>${ready ? '✔ ' : ''}${c.title} <span class="stars">${starsText(c.stars)}</span></div>
        <div class="quest-progress"><span class="quest-bar"><span style="width:${(count / c.target) * 100}%"></span></span><span>${count} / ${c.target}</span></div>
        ${note ? `<div class="quest-note">${note}</div>` : ''}
      </div>`;
  }
}
