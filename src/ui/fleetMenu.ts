import { FORMATION_NAMES } from '../config';
import type { Fleet, FleetMember, Formation } from '../fleet/fleet';
import { capacityOf } from '../fleet/holds';
import { cargoTotal, GOODS, goodText } from '../progression/goods';
import { cannonCount, isExtended, maxLevel, totalLevels, UPGRADE_IDS } from '../progression/upgrades';
import { SHIP_TYPES, typeName } from '../shipTypes';
import { ParchmentMenu } from './parchmentMenu';
import { shipIcon } from './shipIcons';
import { rankName, rankOf } from '../fleet/officers';

const MS_TO_KNOTS = 1.944;

/**
 * Menu de flotte (T), utilisable partout : formation, prise de barre, état et cale de chaque navire.
 * L'achat, la vente et les améliorations se font au port.
 */
export class FleetMenu extends ParchmentMenu {
  constructor(
    parent: HTMLElement,
    private readonly fleet: Fleet,
    private readonly onTakeHelm: (member: FleetMember) => void,
  ) {
    super(parent, 'Ta flotte', 'T ou Échap pour reprendre la mer · Tab : Cabine du capitaine · achats et ventes : au port (P)', 'KeyT');
  }

  render() {
    const traders = this.fleet.members.filter((m) => m.trade);
    const formations = (Object.keys(FORMATION_NAMES) as Formation[])
      .map((f) => `<button class="choice${this.fleet.formation === f ? ' on' : ''}" data-action="formation" data-arg="${f}">${FORMATION_NAMES[f]}</button>`)
      .join('');
    this.body.innerHTML = `
      <p class="subtitle">Les navires que tu ne pilotes pas te suivent et se battent à tes côtés (sauf ceux confiés au commerce, onglet Routes du port).</p>
      <h3 class="section">Formation</h3>
      ${this.fleet.guarded ? '<p class="subtitle">Escorte en cours : tes navires entourent le marchand à protéger ; la formation reprendra à son arrivée.</p>' : ''}
      <div class="choices">${formations}</div>
      <h3 class="section">Tes navires</h3>
      <div class="list">${this.fleet.hand.map((m) => this.memberCard(m)).join('')}</div>
      ${traders.length ? `<h3 class="section">En commerce</h3>
      <p class="subtitle">Hors de ta flotte : chacun a un emplacement dans l’île d’où il est parti, où tu peux le reprendre.</p>
      <div class="list">${traders.map((m) => this.memberCard(m)).join('')}</div>` : ''}`;
  }

  protected onAction(action: string, arg: string) {
    const member = this.fleet.members.find((m) => String(m.id) === arg);
    if (action === 'formation') this.fleet.formation = arg as Formation;
    else if (action === 'helm' && member) this.onTakeHelm(member);
  }

  private memberCard(m: FleetMember): string {
    const def = SHIP_TYPES[m.type];
    const ship = m.ship;
    const atHelm = m === this.fleet.controlled;
    const afloat = m.inWorld && ship.alive;
    const status = afloat
      ? `<div class="ship-health"><div style="width:${(ship.health / ship.stats.maxHealth) * 100}%"></div></div>`
      : `<p class="effect">${m.inWorld ? 'En train de couler…' : `Coulé : de retour dans ${Math.ceil(m.respawnIn)} s`}</p>`;
    const maxUpgrades = UPGRADE_IDS.reduce((sum, id) => sum + maxLevel(m.type, id, m.levels), 0);
    const goods = GOODS.filter((g) => m.cargo[g] > 0).map((g) => goodText(g, m.cargo[g]));
    const hold = `Cale ${cargoTotal(m.cargo)} / ${capacityOf(m)}${goods.length ? ` : ${goods.join(', ')}` : ' (vide)'}${def.canFish ? ' · pêcheur' : ''}`;
    return `
      <div class="upgrade-card${atHelm ? ' at-helm' : ''}">
        <div class="icon">${shipIcon(m.type, m.levels)}</div>
        <div class="body">
          <h2>${m.name} <span class="tag${isExtended(m.levels) ? ' extended' : ''}">${typeName(m.type, m.levels.extension)}</span>${atHelm ? '<span class="tag helm">À la barre</span>' : ''}${m.trade ? '<span class="tag trade">⚖ En commerce</span>' : ''}<span class="tag kills" title="Navires ennemis coulés">☠ ${m.kills} coulé${m.kills > 1 ? 's' : ''}</span>${rankTag(m)}</h2>
          ${status}
          <p>Vie ${Math.ceil(ship.health)} / ${ship.stats.maxHealth} · ${cannonCount(ship.stats)} canons · ${Math.round(ship.stats.maxSpeed * MS_TO_KNOTS)} nœuds · améliorations ${totalLevels(m.levels)} / ${maxUpgrades}</p>
          <p class="effect">${hold}</p>
        </div>
        <div class="buy">
          <button data-action="helm" data-arg="${m.id}"${atHelm || !afloat || m.trade ? ' disabled' : ''}>Prendre la barre</button>
        </div>
      </div>`;
  }
}

/** Rang du navire (étoiles), à partir de vétéran. */
function rankTag(m: FleetMember): string {
  const stars = rankOf(m.kills);
  return stars ? `<span class="tag rank" title="${rankName(stars)}">${'★'.repeat(stars)}</span>` : '';
}
