import { ALLEGIANCE_NAMES } from '../../config';
import { nextCost, UPGRADE_IDS } from '../../progression/upgrades';
import { SHIP_TYPES } from '../../shipTypes';
import { tip } from '../kit/kit';
import { hideTip } from '../kit/tooltip';
import { ParchmentMenu } from '../parchmentMenu';
import { PLACE_TABS, type PlaceTab, type PortContext } from './portContext';
import './portHub.css';

/** Les enseignes du quai, une par lieu : nom, ce qu'on y fait, dessin au trait (repère 110 × 90). */
const SIGNS: Record<PlaceTab, { name: string; sub: string; art: string }> = {
  shipyard: { name: 'Chantier', sub: 'Améliorer, allonger, acheter un navire', art: 'M20 70L90 70L80 84L30 84ZM55 14L55 70M58 20L84 64L58 64ZM18 30L38 50M30 24L44 38M14 46L30 30' },
  market: { name: 'Comptoir', sub: 'Acheter, vendre, lancer une route', art: 'M16 40L94 40L86 82L24 82ZM16 40L28 18L82 18L94 40M40 40L40 82M70 40L70 82M24 58L86 58' },
  tavern: { name: 'Taverne', sub: 'Contrats, missions, recrutement', art: 'M30 30L80 30L74 82L36 82ZM80 42C96 42 96 66 78 66M34 22C40 12 50 18 55 12C60 18 72 12 76 22' },
  harbormaster: { name: 'Capitainerie', sub: 'L’île, ses bâtiments, sa réserve', art: 'M20 82L90 82M28 82L28 44L82 44L82 82M20 44L55 16L90 44M46 82L46 62L64 62L64 82M55 16L55 4L70 8L55 12' },
};

export interface PortAccess {
  /** Le bateau piloté est-il assez près du port pour y faire escale ? */
  inRange(): boolean;
  /** À l'ouverture du panneau (escale : offres de la taverne…). */
  onOpen(): void;
  /** Touche pressée loin du port. */
  refused(code: string): void;
  /** Ouvre un lieu du port (Comptoir, Chantier autour du navire, Taverne, Capitainerie). */
  openPlace(place: PlaceTab): void;
}

/**
 * Le port où la flotte fait escale (P), seulement près d'un quai : le vrai port reste visible derrière, avec en tête son
 * nom, l'allégeance de l'île et l'état des coques, et en bas quatre enseignes de bois qui ouvrent chacune son lieu
 * (`PlaceMenu`) : Chantier, Comptoir, Taverne, Capitainerie. Pastilles : améliorations du navire piloté qu'on peut
 * payer tout de suite (Chantier), contrats affichés à la taverne (Taverne).
 */
export class PortMenu extends ParchmentMenu {
  constructor(
    parent: HTMLElement,
    private readonly ctx: PortContext,
    private readonly access: PortAccess,
  ) {
    super(parent, ctx.island.info.portName, '', ['KeyP']);
    this.body.parentElement!.classList.add('hub-frame');
    this.body.parentElement!.parentElement!.classList.add('port-hub');
  }

  /** Ouvre le panneau du port (bouton à l'écran, retour d'un lieu…). */
  openOn() {
    if (!this.access.inRange()) return;
    this.access.onOpen();
    this.setOpen(true);
  }

  /** Pendant l'escale, l'interface de navigation s'efface : le quai et ses enseignes restent seuls. */
  setOpen(open: boolean) {
    super.setOpen(open);
    document.body.classList.toggle('hub-open', this.isOpen);
    // La bulle d'une enseigne survolée ne reste pas à l'écran une fois le quai quitté.
    if (!this.isOpen) hideTip();
  }

  protected toggle(code: string) {
    if (this.isOpen) this.setOpen(false);
    else if (this.access.inRange()) this.openOn();
    else this.access.refused(code);
  }

  render() {
    const { island, fleet } = this.ctx;
    const info = island.info;
    const ships = fleet.hand.filter((m) => m.inWorld && m.ship.alive);
    const hull = ships.reduce((s, m) => s + m.ship.health, 0) / Math.max(1, ships.reduce((s, m) => s + m.ship.stats.maxHealth, 0));
    const owner = `${ALLEGIANCE_NAMES[island.owned ? 'pirate' : info.allegiance]} · ${island.owned ? 'à toi' : info.holders}`;
    const signs = PLACE_TABS.map((id) => {
      const s = SIGNS[id];
      const n = this.badge(id);
      return `
        <button class="hub-sign" data-action="place" data-arg="${id}">
          <svg viewBox="0 0 110 90" aria-hidden="true"><path d="${s.art}"/></svg>
          <b>${s.name}</b><span>${s.sub}</span>
          ${n > 0 ? `<i class="hub-badge"${tip(id === 'shipyard' ? 'Améliorations de ton navire que tu peux payer' : 'Contrats affichés à la taverne')}>${n}</i>` : ''}
        </button>`;
    }).join('');
    this.body.innerHTML = `
      <div class="hub-head">
        <span class="hub-title">${info.portName}</span>
        <span class="hub-chip">${owner}</span>
        <span class="hub-hull"${tip('Vie des navires de ta flotte ; ils se réparent au quai')}>Coques de la flotte<span class="hub-bar"><span style="width:${Math.round(hull * 100)}%"></span></span>${Math.round(hull * 100)} %</span>
        <span class="hub-keys">P : quitter · Tab : Cabine</span>
      </div>
      <div class="hub-signs">${signs}</div>`;
  }

  /** Nombre affiché sur une enseigne (0 : pas de pastille). */
  private badge(id: PlaceTab): number {
    const { fleet, state, contracts, island } = this.ctx;
    if (id === 'tavern') return contracts.offers[island.id].length + contracts.specials(island.id).length;
    if (id !== 'shipyard') return 0;
    const m = fleet.controlled;
    const affordable = UPGRADE_IDS.filter((u) => {
      const cost = nextCost(m.type, u, m.levels);
      return cost && state.canAfford(cost);
    }).length;
    const extension = SHIP_TYPES[m.type].extensions?.[m.levels.extension];
    return affordable + (extension && state.canAfford(extension.cost) ? 1 : 0);
  }

  protected onAction(action: string, arg: string) {
    if (action === 'place' && PLACE_TABS.includes(arg as PlaceTab)) this.access.openPlace(arg as PlaceTab);
  }
}
