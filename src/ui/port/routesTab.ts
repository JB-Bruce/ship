import { ISLAND_INFO, type IslandId } from '../../config';
import type { FleetMember } from '../../fleet/fleet';
import { freeSpace } from '../../fleet/holds';
import type { Good } from '../../progression/goods';
import { isExtended } from '../../progression/upgrades';
import { typeName } from '../../shipTypes';
import { ISLAND_LIST } from '../../world/island';
import { shipIcon } from '../shipIcons';
import { resourcesHtml, type PortContext } from './portContext';

const LABELS: Record<Good, string> = { fish: 'Poisson', rum: 'Rhum', spices: 'Épices' };

/** Choix en cours pour la nouvelle route (navire, destination, marchandise de l'aller et du retour ; 'none' = à vide). */
const draft: { ship: number | null; to: IslandId | null; out: Good | 'none' | null; back: Good | 'none' | null } = { ship: null, to: null, out: null, back: null };

/** Un choix du formulaire : « champ:valeur ». */
export function pickRoute(arg: string) {
  const [field, value] = arg.split(':');
  if (field === 'ship') draft.ship = Number(value);
  else if (field === 'to') {
    draft.to = value as IslandId;
    draft.out = draft.back = null;
  } else if (field === 'out' || field === 'back') draft[field] = value as Good | 'none';
}

/**
 * Onglet Routes : les navires confiés au commerce (où ils en sont, rappel) et le formulaire d'une nouvelle route qui
 * part de ce port : quel navire, vers quel port, avec quelle marchandise à l'aller et au retour.
 */
export function routesTab(ctx: PortContext): string {
  const traders = ctx.fleet.members.filter((m) => m.trade);
  return `
    <p class="subtitle">Confie un navire au commerce : il quitte ta flotte et fait l’aller-retour entre deux ports, chargé à chaque escale, jusqu’à ce que tu le rappelles. Ses achats se paient sur ton or ; chaque vente te rapporte aussitôt. S’il coule, sa cargaison est perdue.</p>
    ${resourcesHtml(ctx)}
    <h3 class="section">Routes en cours <span class="count">${traders.length}</span></h3>
    <div class="list">${traders.length ? traders.map((m) => traderCard(ctx, m)).join('') : '<p class="effect">Aucun navire ne commerce pour toi.</p>'}</div>
    <h3 class="section">Nouvelle route depuis ${ISLAND_INFO[ctx.island.id].shortName}</h3>
    ${form(ctx)}`;
}

function traderCard(ctx: PortContext, m: FleetMember): string {
  const order = m.trade!;
  const [a, b] = order.ports;
  const goods = (g: Good | null) => (g ? LABELS[g].toLowerCase() : 'à vide');
  const estimate = ctx.routes.estimate(m, order.ports, order.goods);
  return `
    <div class="upgrade-card compact">
      <div class="icon">${shipIcon(m.type, m.levels)}</div>
      <div class="body">
        <h2>${m.name} <span class="tag${isExtended(m.levels) ? ' extended' : ''}">${typeName(m.type, m.levels.extension)}</span></h2>
        <p>${ISLAND_INFO[a].shortName} ⇄ ${ISLAND_INFO[b].shortName} · aller : ${goods(order.goods[0])} · retour : ${goods(order.goods[1])}</p>
        <p class="effect">${ctx.routes.status(m)} · environ ${estimate} or par aller-retour</p>
      </div>
      <div class="buy"><button class="secondary" data-action="route-recall" data-arg="${m.id}">Rappeler</button></div>
    </div>`;
}

/** La marchandise la plus rentable, ou « à vide » s'il n'y en a pas. */
function best(ctx: PortContext, goods: readonly Good[], from: IslandId, to: IslandId): Good | 'none' {
  const margin = (g: Good) => ctx.routes.margin(g, from, to) ?? -Infinity;
  const sorted = [...goods].sort((x, y) => margin(y) - margin(x));
  return sorted.length && margin(sorted[0]) > 0 ? sorted[0] : 'none';
}

function form(ctx: PortContext): string {
  const here = ctx.island.id;
  const ships = ctx.fleet.hand.filter((m) => m !== ctx.fleet.controlled && m.inWorld && m.ship.alive);
  if (!ships.length) return '<p class="effect">Il te faut un autre navire à flot que celui que tu pilotes.</p>';
  const ports = ISLAND_LIST.map((i) => i.id).filter((id) => id !== here);
  if (!ports.length) return '';
  // Valeurs par défaut : premier navire, premier port, marchandises les plus rentables.
  const ship = ships.find((m) => m.id === draft.ship) ?? ships[0];
  const to = draft.to && ports.includes(draft.to) ? draft.to : ports[0];
  const outGoods = ctx.routes.goods(here, to);
  const backGoods = ctx.routes.goods(to, here);
  const out = draft.out && (draft.out === 'none' || outGoods.includes(draft.out)) ? draft.out : best(ctx, outGoods, here, to);
  const back = draft.back && (draft.back === 'none' || backGoods.includes(draft.back)) ? draft.back : best(ctx, backGoods, to, here);
  Object.assign(draft, { ship: ship.id, to, out, back });

  const choice = (field: string, value: string, label: string, on: boolean) =>
    `<button class="choice${on ? ' on' : ''}" data-action="route-pick" data-arg="${field}:${value}">${label}</button>`;
  const goodChoices = (field: 'out' | 'back', goods: readonly Good[], from: IslandId, dest: IslandId, current: Good | 'none') =>
    [
      ...goods.map((g) => {
        const margin = ctx.routes.margin(g, from, dest) ?? 0;
        return choice(field, g, `${LABELS[g]} (${margin >= 0 ? '+' : ''}${margin} or l’unité)`, g === current);
      }),
      choice(field, 'none', 'À vide', current === 'none'),
    ].join('');
  const row = (label: string, buttons: string) => `<div class="setting"><div class="setting-label"><b>${label}</b></div><div class="choices">${buttons}</div></div>`;
  const goods = (g: Good | 'none') => (g === 'none' ? null : g);
  const estimate = ctx.routes.estimate(ship, [here, to], [goods(out), goods(back)]);
  const name = (id: IslandId) => ISLAND_INFO[id].shortName;
  return `
    ${row('Navire', ships.map((m) => choice('ship', String(m.id), `${m.name} (${freeSpace(m)} places)`, m === ship)).join(''))}
    ${ports.length > 1 ? row('Destination', ports.map((id) => choice('to', id, name(id), id === to)).join('')) : ''}
    ${row(`Aller : ${name(here)} → ${name(to)}`, goodChoices('out', outGoods, here, to, out))}
    ${row(`Retour : ${name(to)} → ${name(here)}`, goodChoices('back', backGoods, to, here, back))}
    <div class="upgrade-card compact">
      <div class="body">
        <h2>Bénéfice estimé : environ ${estimate} or par aller-retour</h2>
        <p class="effect">Cale pleine, aux prix d’aujourd’hui. Les achats se paient au départ de chaque port.</p>
      </div>
      <div class="buy"><button data-action="route-start" data-arg="${ship.id}:${to}:${out}:${back}"${out === 'none' && back === 'none' ? ' disabled' : ''}>Envoyer ${ship.name}</button></div>
    </div>`;
}
