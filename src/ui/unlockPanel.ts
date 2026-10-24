import { BLUEPRINTS, ISLAND_UPGRADES } from '../config';
import type { BlueprintProgress } from '../progression/blueprints';
import { cannonCount } from '../progression/upgrades';
import { SHIP_TYPES, type ShipType } from '../shipTypes';
import { SHIP_ICONS } from './shipIcons';
import { music } from '../audio/musicDirector';

const MS_TO_KNOTS = 1.944;

/** Pastilles d'un plan : une par bout, pleine pour ceux qu'on a. */
function pips(count: number, needed: number): string {
  return `<span class="pips">${Array.from({ length: needed }, (_, i) => `<span class="pip${i < count ? ' on' : ''}"></span>`).join('')}</span>`;
}

/**
 * Popup d'un bout de plan ramassé : la silhouette du navire (son nom reste caché tant que le plan est incomplet),
 * ses pastilles et « 2/4 », pour voir à quel plan il s'ajoute.
 */
export function fragmentHtml(p: BlueprintProgress): string {
  return `<span class="plan-icon">${SHIP_ICONS[p.type]}</span><span class="plan-text">📜 Plan de navire inconnu ${pips(p.count, p.needed)} ${p.count}/${p.needed}</span>`;
}

/**
 * Grand panneau de parchemin au centre de l'écran quand un plan est complet : « Nouveau navire ! », la silhouette qui
 * prend sa couleur, le nom enfin révélé, ses caractéristiques et où le construire. Le jeu continue ; il reste
 * BLUEPRINTS.unlockPanelTime s (temps de jeu) ou se ferme d'un clic. Plusieurs plans complétés d'affilée attendent leur tour.
 */
export class UnlockPanel {
  private readonly el: HTMLElement;
  private readonly queue: ShipType[] = [];
  private time = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'unlock-panel';
    this.el.addEventListener('click', () => this.close());
    parent.appendChild(this.el);
  }

  show(type: ShipType) {
    music.stinger();
    this.queue.push(type);
    if (this.time <= 0) this.next();
  }

  update(dt: number) {
    if (this.time <= 0) return;
    this.time -= dt;
    if (this.time <= 0) this.close();
  }

  private close() {
    this.time = 0;
    this.el.classList.remove('on');
    if (this.queue.length) this.next();
  }

  private next() {
    const type = this.queue.shift()!;
    const def = SHIP_TYPES[type];
    const s = def.stats;
    const yard = ISLAND_UPGRADES.shipyard.required[type] ?? 0;
    const article = def.feminine ? 'la' : 'le';
    const where = yard ? `Tu sais désormais ${article} construire, dans un port dont le chantier naval est au niveau ${yard}.` : `Tu sais désormais ${article} construire, dans tous tes ports.`;
    this.el.innerHTML = `
      <div class="unlock-title">📜 Nouveau navire !</div>
      <div class="unlock-icon">${SHIP_ICONS[type]}</div>
      <div class="unlock-name">${def.name}</div>
      <p class="unlock-stats">Vie ${s.maxHealth} · ${cannonCount(s)} canons · ${Math.round(s.maxSpeed * MS_TO_KNOTS)} nœuds · cale ${def.hold}</p>
      <p class="unlock-where">${where}</p>
      <p class="unlock-hint">Onglet Navires du port · clic pour fermer</p>`;
    // Relance l'animation (silhouette qui se révèle, parchemin qui se déroule).
    this.el.classList.remove('on');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    this.time = BLUEPRINTS.unlockPanelTime;
  }
}
