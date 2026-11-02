import { sound } from '../audio/sound';
import { ParchmentMenu } from './parchmentMenu';

/** Ce que coûte un naufrage de toute la flotte. */
export interface ShipwreckReport {
  /** Navires de la flotte qui ont sombré (noms), et ce que chacun a perdu de sa cargaison (ou ''). */
  ships: { name: string; cargo: string }[];
  /** Or perdu. */
  gold: number;
  /** Port où la flotte reprend la mer. */
  port: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Toute la flotte a sombré : une page de parchemin (le jeu attend) qui dit ce qui est perdu (navires, cargaisons,
 * or) et où la flotte reprend la mer, avec « Reprendre la mer ». Pas de touche : elle s'ouvre seule (`show`).
 */
export class ShipwreckMenu extends ParchmentMenu {
  private report: ShipwreckReport | null = null;

  constructor(parent: HTMLElement) {
    super(parent, 'Naufrage', 'Échap ou « Reprendre la mer »', []);
    this.body.parentElement!.classList.add('shipwreck-sheet');
    this.openSound = 'combat/sinking';
  }

  show(report: ShipwreckReport) {
    this.report = report;
    this.setOpen(true);
  }

  render() {
    const r = this.report;
    if (!r) return;
    const ships = r.ships
      .map((s) => `<li><b>${escapeHtml(s.name)}</b>${s.cargo ? `<span>cargaison perdue : ${escapeHtml(s.cargo)}</span>` : '<span>cales vides</span>'}</li>`)
      .join('');
    this.body.innerHTML = `
      <p class="wreck-lead">Toute ta flotte gît par le fond. Des pêcheurs ont repêché tes hommes, trempés mais vivants.</p>
      <ul class="wreck-list">${ships}</ul>
      ${r.gold > 0 ? `<p class="wreck-gold">−${r.gold} pièces d’or, perdues dans la débâcle.</p>` : ''}
      <p class="wreck-port">Tes navires remis à flot t’attendent à <b>${escapeHtml(r.port)}</b>.</p>
      <div class="choices wreck-actions"><button class="choice on" data-action="resume">Reprendre la mer</button></div>`;
  }

  protected onAction(action: string) {
    if (action !== 'resume') return;
    sound.play('ambience/ship_bell');
    this.setOpen(false);
  }
}
