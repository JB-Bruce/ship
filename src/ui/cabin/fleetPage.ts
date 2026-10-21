import { FORMATION_NAMES, ISLAND_INFO, type IslandId } from '../../config';
import type { FleetMember, Formation } from '../../fleet/fleet';
import { capacityOf } from '../../fleet/holds';
import { cargoTotal, GOODS, goodText, type Good } from '../../progression/goods';
import { typeName } from '../../shipTypes';
import { harbors } from '../../world/harbors';
import { gaugeHtml, tip } from '../kit/kit';
import { shipIcon } from '../shipIcons';
import type { CabinContext, CabinView } from './cabinContext';

const GOOD_NAMES: Record<Good, string> = { fish: 'Poisson', rum: 'Rhum', spices: 'Épices' };

/** Petits schémas des formations (points des navires, vus de dessus, le tien en tête). */
const FORMATION_ART: Record<Formation, string> = {
  vee: 'M32 8 L32 8 M20 20 L20 20 M44 20 L44 20 M8 32 L8 32 M56 32 L56 32',
  line: 'M8 20 L8 20 M20 20 L20 20 M32 20 L32 20 M44 20 L44 20 M56 20 L56 20',
  column: 'M32 4 L32 4 M32 14 L32 14 M32 24 L32 24 M32 34 L32 34',
  free: 'M14 10 L14 10 M40 6 L40 6 M26 22 L26 22 M50 28 L50 28 M12 32 L12 32',
};

const name = (id: IslandId) => ISLAND_INFO[id].shortName;
const goodName = (g: Good | null) => (g ? GOOD_NAMES[g].toLowerCase() : 'à vide');

/**
 * Page Flotte : la formation, tes navires (vie, cale, barre) et tes routes commerciales, qu'on arrête ou qu'on change
 * d'ici, même en mer (l'arrêt : il vend au prochain port et rejoint la flotte).
 */
export function fleetPage(ctx: CabinContext, view: CabinView): string {
  const { fleet } = ctx;
  const formations = (Object.keys(FORMATION_NAMES) as Formation[])
    .map((f) => `<button class="cabin-formation${fleet.formation === f ? ' on' : ''}" data-action="formation" data-arg="${f}"><svg viewBox="0 0 64 40" aria-hidden="true"><path d="${FORMATION_ART[f]}"/></svg><span>${FORMATION_NAMES[f]}</span></button>`)
    .join('');
  const escort = fleet.guarded ? '<span class="cabin-muted">Escorte en cours : tes navires entourent le marchand.</span>' : '';
  const traders = fleet.members.filter((m) => m.trade);
  return `
    <div class="cabin-fleet">
      <div class="cabin-fleet-top"><h2>Formation</h2><div class="cabin-formations">${formations}</div>${escort}</div>
      <div class="cabin-section-head"><h2>Tes navires</h2><span>${fleet.hand.length} / ${ctx.state.slots} places de flotte</span></div>
      <div class="cabin-ships">${fleet.hand.map((m) => shipCard(ctx, m)).join('')}</div>
      <div class="cabin-section-head"><h2>Routes commerciales</h2><span>${traders.length ? 'Arrête-les ou change-les d’ici, même en mer' : 'Confie un navire au commerce au Comptoir d’une île à toi'}</span></div>
      <div class="cabin-routes">${traders.map((m) => (view.edit?.memberId === m.id ? routeEditor(ctx, view, m) : routeCard(ctx, m))).join('')}</div>
    </div>`;
}

function shipCard(ctx: CabinContext, m: FleetMember): string {
  const ship = m.ship;
  const atHelm = m === ctx.fleet.controlled;
  const afloat = m.inWorld && ship.alive;
  const used = cargoTotal(m.cargo);
  const cap = capacityOf(m);
  const goods = GOODS.filter((g) => m.cargo[g] > 0).map((g) => goodText(g, m.cargo[g])).join(', ') || 'cale vide';
  const status = atHelm ? 'Tu es à la barre' : !m.inWorld ? `Coulé : de retour dans ${Math.ceil(m.respawnIn)} s` : !ship.alive ? 'En train de couler…' : 'Suit en formation';
  return `
    <div class="cabin-card cabin-ship-mini${atHelm ? ' here' : ''}">
      <div class="cabin-mini-head"><span class="cabin-mini-icon">${shipIcon(m.type, m.levels)}</span><span><b>${m.name}</b><span class="cabin-muted">${typeName(m.type, m.levels.extension)}</span></span></div>
      <div class="cabin-mini-row"><span>Vie</span>${gaugeHtml(afloat ? ship.health / ship.stats.maxHealth : 0)}</div>
      <div class="cabin-mini-row"${tip(goods)}><span>Cale</span>${gaugeHtml(cap ? used / cap : 0, 'hold')}<b>${used}/${cap}</b></div>
      <div class="cabin-mini-foot"><span class="cabin-muted">${status}</span>${!atHelm && afloat ? `<button class="kit-btn" data-action="helm" data-arg="${m.id}">Barre</button>` : ''}</div>
    </div>`;
}

function routeCard(ctx: CabinContext, m: FleetMember): string {
  const order = m.trade!;
  const [home, dest] = order.ports;
  const estimate = ctx.routes.estimate(m, order.ports, order.goods);
  const notes = [
    order.returning ? '<span class="cabin-warn">Rejoint ta flotte après la vente au prochain port</span>' : '',
    order.nextTo ? `<span class="cabin-warn">Ira à ${name(order.nextTo)} à son retour à ${name(home)}</span>` : '',
  ].join('');
  const stop = order.returning
    ? `<button class="kit-btn ghost" data-action="route-resume" data-arg="${m.id}">Reprendre la route</button>`
    : `<button class="kit-btn red" data-action="route-stop" data-arg="${m.id}"${ctx.routes.fleetHasRoom ? '' : ` disabled${tip('Flotte pleine : il faut une place libre')}`}>Arrêter</button>`;
  return `
    <div class="cabin-card cabin-route">
      <svg class="cabin-route-art" viewBox="0 0 160 50" aria-hidden="true"><path d="M14 36 C50 6 110 6 146 22" class="sea-line"/><circle cx="14" cy="36" r="7"/><circle cx="146" cy="22" r="7"/></svg>
      <div class="cabin-route-body">
        <b>${m.name} : ${name(home)} ⇄ ${name(dest)}</b>
        <span>Aller : ${goodName(order.goods[0])} · retour : ${goodName(order.goods[1])} · environ ${estimate} or par aller-retour</span>
        <span class="cabin-muted">${ctx.routes.status(m)}</span>${notes}
      </div>
      <div class="cabin-route-actions"><button class="kit-btn" data-action="route-edit" data-arg="${m.id}">Modifier</button>${stop}</div>
    </div>`;
}

/** Formulaire de modification : destination, marchandise de l'aller et du retour, bénéfice estimé. */
function routeEditor(ctx: CabinContext, view: CabinView, m: FleetMember): string {
  const edit = view.edit!;
  const home = m.trade!.ports[0];
  // Ports découverts seulement, plus la destination en cours et celle qui l'attend (même d'une ancienne partie) : on
  // peut toujours revenir à la route actuelle.
  const keep = [m.trade!.ports[1], m.trade!.nextTo];
  const ports = harbors.open().filter((i) => i.id !== home && (keep.includes(i.id) || ctx.known(i.port.x, i.port.z))).map((i) => i.id);
  const choice = (field: string, value: string, label: string, on: boolean) => `<button class="kit-btn${on ? ' on' : ''}" data-action="route-pick" data-arg="${field}:${value}">${label}</button>`;
  const goodRow = (field: 'out' | 'back', from: IslandId, to: IslandId, current: Good | null) =>
    [
      ...ctx.routes.goods(from, to).map((g) => {
        const margin = ctx.routes.margin(g, from, to) ?? 0;
        return choice(field, g, `${GOOD_NAMES[g]} <small>${margin >= 0 ? '+' : ''}${margin}</small>`, g === current);
      }),
      choice(field, 'none', 'À vide', current === null),
    ].join('');
  const estimate = ctx.routes.estimate(m, [home, edit.to], [edit.out, edit.back]);
  return `
    <div class="cabin-card cabin-route editing">
      <div class="cabin-route-form">
        <div><b>Destination</b><span class="cabin-choices">${ports.map((id) => choice('to', id, name(id), id === edit.to)).join('')}</span></div>
        <div><b>Aller ${name(home)} → ${name(edit.to)}</b><span class="cabin-choices">${goodRow('out', home, edit.to, edit.out)}</span></div>
        <div><b>Retour ${name(edit.to)} → ${name(home)}</b><span class="cabin-choices">${goodRow('back', edit.to, home, edit.back)}</span></div>
      </div>
      <div class="cabin-route-actions">
        <span class="cabin-good">≈ ${estimate} or par aller-retour</span>
        <button class="kit-btn" data-action="route-save" data-arg="${m.id}"${edit.out === null && edit.back === null ? ' disabled' : ''}>Valider</button>
        <button class="kit-btn ghost" data-action="route-cancel">Annuler</button>
      </div>
    </div>`;
}
