import { HARBORMASTER, type IslandUpgradeId } from '../../config';
import { ISLAND_UPGRADE_INFO, type IslandState } from '../../progression/islandState';
import { ISLAND_LIST, type Island } from '../../world/island';
import { LANDMARKS } from '../../world/landmarks';
import { tip } from '../kit/kit';
import { BUILDING_ICONS } from './buildingIcons';

const { width: W, height: H, shallows, coastSteps, hills } = HARBORMASTER.map;
const { width: PW, height: PH, passes } = HARBORMASTER.pins;
/** Bâtiments qui sont le fort de l'île (posés sur son vrai lieu). */
const FORTS: readonly IslandUpgradeId[] = ['fort', 'citadel', 'royalFort'];
/** Cadenas d'un bâtiment d'une île qui n'est pas à toi. */
const LOCK = '<svg class="hm-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

type Point = { x: number; z: number };

/** Où se trouve un bâtiment : le fort et le phare sur leur vrai lieu, les autres autour de la crique. */
function spotOf(island: Island, id: IslandUpgradeId): Point {
  const kind = id === 'lighthouse' ? 'lighthouse' : FORTS.includes(id) ? 'fort' : null;
  const mark = kind && LANDMARKS.find((l) => l.island === island.id && l.kind === kind);
  if (mark) return mark;
  const s = HARBORMASTER.spots[id];
  return island.pointAt(island.def.bay.angle + s.angle, s.inland);
}

/**
 * Les étiquettes qui se chevauchent s'écartent l'une de l'autre, le long de l'axe où elles se chevauchent le moins (elles
 * sont plus larges que hautes), sans sortir du dessin.
 */
function spread(points: { x: number; y: number }[]) {
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i];
        const b = points[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = PW - Math.abs(dx);
        const oy = PH - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // Deux étiquettes au même endroit : on les sépare en hauteur, la première vers le haut.
        if (ox / PW < oy / PH) {
          const s = (dx >= 0 ? 1 : -1) * (ox / 2);
          a.x -= s;
          b.x += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * (oy / 2);
          a.y -= s;
          b.y += s;
        }
      }
    }
    for (const p of points) {
      p.x = Math.min(W - PW / 2, Math.max(PW / 2, p.x));
      p.y = Math.min(H - PH / 2, Math.max(PH / 2, p.y));
    }
  }
}

/**
 * La carte de l'île de la Capitainerie : sa vraie côte (comme sur la carte M : nord en haut, ouest à droite), ses
 * hauts-fonds, sa végétation et ses hauteurs, son quai, et une étiquette cliquable par bâtiment (niveau, ou cadenas si
 * l'île n'est pas à toi), reliée par un trait à sa vraie place quand elle a dû s'en écarter.
 */
export function islandMapHtml(state: IslandState, selected: IslandUpgradeId): string {
  const island = ISLAND_LIST.find((i) => i.id === state.id)!;
  const steps = Math.round(coastSteps * island.frame.stretch);
  const ids = state.info.upgrades;
  const places = ids.map((id) => spotOf(island, id));
  // Cadrage : les hauts-fonds et les bâtiments, à une demi-étiquette des bords.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const fit = (p: Point) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  };
  for (let i = 0; i < steps; i++) fit(island.pointAt((i / steps) * Math.PI * 2, -shallows));
  places.forEach(fit);
  const scale = Math.min((W - PW) / (maxX - minX), (H - PH) / (maxZ - minZ));
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const sx = (x: number) => W / 2 - (x - midX) * scale;
  const sy = (z: number) => H / 2 - (z - midZ) * scale;
  const outline = (inland: number) =>
    `M${Array.from({ length: steps }, (_, i) => {
      const p = island.pointAt((i / steps) * Math.PI * 2, inland);
      return `${sx(p.x).toFixed(1)} ${sy(p.z).toFixed(1)}`;
    }).join('L')}Z`;
  const high = Math.min(hills, island.def.radius * 0.45);
  const port = island.port;

  const spots = places.map((p) => ({ x: sx(p.x), y: sy(p.z) }));
  const pins = spots.map((p) => ({ ...p }));
  spread(pins);
  const leaders = spots
    .map((s, i) => (Math.hypot(pins[i].x - s.x, pins[i].y - s.y) > 4 ? `<path class="hm-leader" d="M${s.x.toFixed(1)} ${s.y.toFixed(1)}L${pins[i].x.toFixed(1)} ${pins[i].y.toFixed(1)}"/>` : ''))
    .join('');
  const dots = spots.map((s) => `<circle class="hm-spot" cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="4"/>`).join('');

  const buttons = ids
    .map((id, i) => {
      const level = state.levels[id];
      const max = state.maxLevel(id);
      const locked = !state.owned;
      const cls = `hm-pin${id === selected ? ' on' : ''}${level === 0 ? ' empty' : ''}${locked ? ' locked' : ''}`;
      const style = `left:${((100 * pins[i].x) / W).toFixed(2)}%;top:${((100 * pins[i].y) / H).toFixed(2)}%`;
      const label = locked ? `${LOCK}à racheter` : `niv. ${level} / ${max}`;
      return `<button class="${cls}" style="${style}" data-action="pick" data-arg="${id}" data-pin="${id}"${tip(ISLAND_UPGRADE_INFO[id].description)}>${BUILDING_ICONS[id]}<b>${ISLAND_UPGRADE_INFO[id].name}</b><span>${label}</span></button>`;
    })
    .join('');
  return `
    <div class="hm-map" style="aspect-ratio:${W} / ${H}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Carte de l’île">
        <path class="hm-shallows" d="${outline(-shallows)}"/>
        <path class="hm-sand" d="${outline(0)}"/>
        <path class="hm-green" d="${outline(14)}"/>
        <path class="hm-hill" d="${outline(high)}"/>
        <rect class="hm-quay" x="${(sx(port.x) - 9).toFixed(1)}" y="${(sy(port.z) - 4).toFixed(1)}" width="18" height="8" rx="2"/>
        ${leaders}${dots}
      </svg>
      ${buttons}
    </div>`;
}
