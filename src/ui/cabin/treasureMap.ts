import { ISLETS, TREASURE_HUNTS, type TreasureHuntId } from '../../config';
import { HUNT_IDS, treasures, type HuntState } from '../../progression/treasures';
import { ISLET_LIST } from '../../world/island';
import { pipsHtml, tip } from '../kit/kit';

/** Carte au trésor du Journal (px) : taille, rayon de l'îlot dessiné, points de sa côte. */
const MAP = { width: 220, height: 150, islet: 42, coast: 48 };

/** Déchirure entre le morceau `i - 1` et le morceau `i` (sur `n`), de haut en bas. */
function tear(i: number, n: number): string {
  const x = (i / n) * MAP.width;
  const steps = 6;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const y = (k / steps) * MAP.height;
    const jag = (k % 2 ? 5 : -4) * (1 + (i % 2));
    return `${(x + jag).toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/** Contour de l'îlot de la chasse, centré sur la carte (le nord en haut, comme la carte M). */
function isletPath(id: TreasureHuntId): { path: string; scale: number; cx: number; cz: number } {
  const def = TREASURE_HUNTS[id];
  const islet = ISLET_LIST.find((l) => l.id === def.islet)!;
  const [cx, cz] = ISLETS[def.islet].center;
  const scale = MAP.islet / ISLETS[def.islet].radius;
  const points = Array.from({ length: MAP.coast }, (_, k) => {
    const a = (k / MAP.coast) * Math.PI * 2;
    const r = islet.coastRadius(a) * scale;
    return `${(MAP.width / 2 - Math.sin(a) * r).toFixed(1)},${(MAP.height / 2 - Math.cos(a) * r).toFixed(1)}`;
  });
  return { path: `M${points.join(' L')} Z`, scale, cx, cz };
}

/** La carte : les morceaux réunis (les autres en pointillés), et l'îlot avec sa croix une fois la carte complète. */
function mapSvg(id: TreasureHuntId, h: HuntState): string {
  const def = TREASURE_HUNTS[id];
  const n = def.pieces;
  const complete = h.pieces >= n;
  // Chaque morceau : son bord gauche de haut en bas, puis son bord droit de bas en haut.
  const strips = Array.from({ length: n }, (_, i) => {
    const left = i === 0 ? `0,0 0,${MAP.height}` : tear(i, n);
    const right = i === n - 1 ? `${MAP.width},${MAP.height} ${MAP.width},0` : tear(i + 1, n).split(' ').reverse().join(' ');
    return `${left} ${right}`;
  });
  const owned = strips.map((pts, i) => (i < h.pieces ? `<polygon class="tm-piece" points="${pts}"/>` : `<polygon class="tm-missing" points="${pts}"/>`)).join('');
  const clip = strips.slice(0, h.pieces).map((pts) => `<polygon points="${pts}"/>`).join('');
  const { path, scale, cx, cz } = isletPath(id);
  const dig = def.steps[def.steps.length - 1].at;
  const x = MAP.width / 2 - (dig[0] - cx) * scale;
  const y = MAP.height / 2 - (dig[1] - cz) * scale;
  const cross = complete ? `<path class="tm-x" d="M${x - 6},${y - 6} L${x + 6},${y + 6} M${x + 6},${y - 6} L${x - 6},${y + 6}"/>` : '';
  return `
    <svg class="tm-map" viewBox="0 0 ${MAP.width} ${MAP.height}" aria-hidden="true">
      <defs><clipPath id="tm-clip-${id}">${clip}</clipPath></defs>
      ${owned}
      <g clip-path="url(#tm-clip-${id})">
        <path class="tm-islet" d="${path}"/>
        <path class="tm-route" d="M10,${MAP.height - 12} C60,${MAP.height - 40} 70,${MAP.height / 2 + 30} ${x},${y + 10}"/>
        <path class="tm-rose" d="M${MAP.width - 22},14 L${MAP.width - 19},26 L${MAP.width - 22},23 L${MAP.width - 25},26 Z"/>
        ${cross}
      </g>
    </svg>`;
}

/** Une chasse en cours : sa carte, l'indice une fois le journal de Vasseur trouvé, l'étape en cours. */
function huntCard(id: TreasureHuntId, h: HuntState): string {
  const def = TREASURE_HUNTS[id];
  const step = def.steps[h.step];
  const clue = h.pieces > 0 ? `<p class="tm-clue">${def.clue}</p>` : `<p class="cabin-muted">${def.intro}</p>`;
  return `
    <div class="cabin-card tm-card">
      <b>🗝 ${def.title}</b>
      ${mapSvg(id, h)}
      <div class="cabin-mini-row"><span class="cabin-muted">Morceaux de carte</span>${pipsHtml(h.pieces, def.pieces)}</div>
      ${clue}
      <div class="tm-step"><b>${step.title}</b><span class="cabin-muted">${step.note}</span></div>
    </div>`;
}

/** Section du Journal : chasses en cours, puis reliques des trésors trouvés (et leur bonus). */
export function treasureHtml(): string {
  const hunts = [...treasures.active].map(([id, h]) => huntCard(id, h)).join('');
  const relics = HUNT_IDS.filter((id) => treasures.done.has(id))
    .map((id) => {
      const r = TREASURE_HUNTS[id].reward.relic;
      return `<div class="tm-relic"${tip(`${r.description} (+${Math.round(r.radar * 100)} % de portée du radar)`)}><span class="tm-relic-icon">🧭</span><span>${r.name}</span></div>`;
    })
    .join('');
  if (!hunts && !relics) return '<p class="cabin-muted">Aucune chasse au trésor : écoute les rumeurs des tavernes, ou fouille les épaves d’élite.</p>';
  return `${hunts}${relics ? `<div class="tm-relics"><span class="cabin-muted">Reliques</span>${relics}</div>` : ''}`;
}
