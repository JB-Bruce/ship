import { MARKET, type IslandId } from '../../config';
import { harbors } from '../../world/harbors';
import { ISLAND_LIST, LAND_LIST, type Landmass } from '../../world/island';
import { tip } from '../kit/kit';
import { portLabel, type MarketContext } from './marketContext';

const { width: W, height: H, margin, coastSteps, bulge, sail } = MARKET.map;
/** Points de la côte essayés pour savoir si une terre est découverte. */
const PROBES = 8;

type Point = { x: number; z: number };

/** Ce que la carte montre en plus des routes en cours. */
export interface MapState {
  /** On trace une route : les ports où elle peut aller sont cliquables. */
  picking: boolean;
  /** Destination choisie pour la route qu'on trace. */
  planTo: IslandId | null;
  /** Navire dont la route vient d'ouvrir : un petit navire la parcourt. */
  fresh: number | null;
}

/** Une terre est découverte dès que son centre ou un point de sa côte l'est. */
function landKnown(ctx: MarketContext, land: Landmass): boolean {
  if (ctx.known(land.cx, land.cz)) return true;
  for (let i = 0; i < PROBES; i++) {
    const p = land.pointAt((i / PROBES) * Math.PI * 2, 0);
    if (ctx.known(p.x, p.z)) return true;
  }
  return false;
}

const islandOf = (id: IslandId) => ISLAND_LIST.find((i) => i.id === id)!;
const portOf = (id: IslandId): Point => islandOf(id).port;

/**
 * La petite carte du Comptoir : les terres découvertes (cadrées sur elles), tes routes en cours en pointillés avec leurs
 * navires, la route qu'on trace, et les ports par-dessus (boutons quand on choisit une destination). Comme sur la
 * carte M, l'ouest est à droite et le nord en haut.
 */
export function routeMapHtml(ctx: MarketContext, state: MapState): string {
  const home = islandOf(ctx.island.id);
  const lands = LAND_LIST.filter((l) => l === home || landKnown(ctx, l));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const l of lands) {
    minX = Math.min(minX, l.cx - l.outerRadius);
    maxX = Math.max(maxX, l.cx + l.outerRadius);
    minZ = Math.min(minZ, l.cz - l.outerRadius);
    maxZ = Math.max(maxZ, l.cz + l.outerRadius);
  }
  const scale = Math.min(W / (maxX - minX + 2 * margin), H / (maxZ - minZ + 2 * margin));
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const sx = (x: number) => W / 2 - (x - midX) * scale;
  const sy = (z: number) => H / 2 - (z - midZ) * scale;
  const at = (p: Point) => `${sx(p.x).toFixed(1)} ${sy(p.z).toFixed(1)}`;

  const coasts = lands
    .map((l) => {
      const steps = Math.round(coastSteps * l.frame.stretch);
      const points = Array.from({ length: steps }, (_, i) => at(l.pointAt((i / steps) * Math.PI * 2, 0)));
      return `<path class="mk-land" d="M${points.join('L')}Z"/>`;
    })
    .join('');
  // Une route est une courbe douce entre les deux quais, bombée sur le côté.
  const curve = (a: Point, b: Point) => {
    const [ax, ay, bx, by] = [sx(a.x), sy(a.z), sx(b.x), sy(b.z)];
    const cx = (ax + bx) / 2 - (by - ay) * bulge;
    const cy = (ay + by) / 2 + (bx - ax) * bulge;
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  };
  const shown = (id: IslandId) => {
    const p = portOf(id);
    return id === ctx.island.id || ctx.known(p.x, p.z);
  };

  let routes = '';
  let ships = '';
  for (const m of ctx.fleet.members) {
    const order = m.trade;
    if (!order) continue;
    // La route n'est tracée que si ses deux ports sont découverts (une ancienne partie peut aller ailleurs) ; son
    // navire reste montré tant qu'il est dans des eaux connues.
    const drawn = shown(order.ports[0]) && shown(order.ports[1]);
    if (drawn) {
      const d = curve(portOf(order.ports[0]), portOf(order.ports[1]));
      routes += `<path class="mk-route${order.returning ? ' back' : ''}" d="${d}"/>`;
      if (m.id === state.fresh) routes += `<g class="mk-runner"><path d="M-6 3L6 3L0-6Z"/><animateMotion dur="${sail}ms" path="${d}" fill="freeze"/></g>`;
    }
    const pos = m.ship.position;
    if (m.inWorld && m.ship.alive && !(drawn && m.id === state.fresh) && ctx.known(pos.x, pos.z))
      ships += `<circle class="mk-trader" cx="${sx(pos.x).toFixed(1)}" cy="${sy(pos.z).toFixed(1)}" r="4"${tip(`${m.name} : ${ctx.routes.status(m)}`)}/>`;
  }
  if (state.planTo) routes += `<path class="mk-route plan" d="${curve(home.port, portOf(state.planTo))}"/>`;

  const ports = ISLAND_LIST.filter((i) => shown(i.id))
    .map((i) => {
      const here = i.id === ctx.island.id;
      const open = harbors.isOpen(i.id);
      const pick = state.picking && open && !here;
      const cls = `mk-port${here ? ' here' : ''}${open ? '' : ' closed'}${pick ? ' pick' : ''}${i.id === state.planTo ? ' on' : ''}`;
      const style = `left:${((100 * sx(i.port.x)) / W).toFixed(2)}%;top:${((100 * sy(i.port.z)) / H).toFixed(2)}%`;
      const why = here ? 'Tu es ici' : open ? (pick ? 'Envoyer la route ici' : 'Port ouvert') : 'Port fermé : tenu par la Marine';
      const inner = `<i></i><span>${portLabel(i.id)}</span>`;
      return pick
        ? `<button class="${cls}" style="${style}" data-action="route-to" data-arg="${i.id}"${tip(why)}>${inner}</button>`
        : `<span class="${cls}" style="${style}"${tip(why)}>${inner}</span>`;
    })
    .join('');
  return `
    <div class="mk-map" style="aspect-ratio:${W} / ${H}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Carte des routes commerciales">${coasts}${routes}${ships}</svg>
      ${ports}
    </div>`;
}
