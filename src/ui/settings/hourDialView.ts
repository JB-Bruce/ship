import { DAY_NIGHT } from '../../config';
import type { DayCycle } from '../../world/dayCycle';
import { clockLabel } from '../dayClock';

/*
 * Cadran du curseur d'heure (menu Échap), façon instrument de navigation en laiton : la course du soleil est un anneau
 * de laiton gradué sur 24 heures, coupé par l'horizon (ciel au-dessus, mer gravée au-dessous, où la course s'aplatit).
 * Midi en haut, minuit en bas, le soleil se lève à gauche (est) comme sur l'horloge de l'écran ; la lune est à l'opposé.
 * Le soleil passe l'horizon à la même heure que dans le ciel du jeu (même inclinaison et relèvement que `DayCycle`).
 */

/** Cadran (unités du viewBox, ≈ px) : taille, centre de la course, demi-axe horizontal, demi-axes vertical au-dessus (ciel) et au-dessous du centre. */
const W = 300;
const H = 134;
const CX = W / 2;
const CY = 82;
const RX = 114;
const RY_SKY = 54;
const RY_SEA = 26;
/** Anneau : largeur de la bande de laiton, longueur des petites graduations, écart des chiffres au bord de l'anneau. */
const BAND = 9;
const TICK = 4;
const LABEL_GAP = 14;
/** Écart en plus pour les chiffres des côtés (6 et 18), que le soleil agrandi ne doit pas mordre. */
const SIDE_GAP = 7;
/** Midi et minuit s'écrivent en toutes lettres (plus lisibles que « 12 » et « 0 » en chiffres anciens). */
const HOUR_WORDS: Readonly<Record<number, string>> = { 0: 'minuit', 12: 'midi' };
/** Une grande graduation, avec son chiffre, toutes les 3 heures. */
const MAJOR_EVERY = 3;
/** Soleil (rayon du disque, pointe des rayons, nombre de rayons) et lune (rayon, décalage du disque qui la mord). */
const SUN_DISC = 7;
const SUN_RAY = 12;
const SUN_RAYS = 8;
const MOON_R = 6.5;
const MOON_BITE = [2.8, -2.2, 5.6] as const;
/** Lueur du crépuscule au-dessus de l'horizon (hauteur). */
const GLOW_H = 34;
/** La lune n'apparaît que la nuit (pleinement à cette part de la nuit) : une seule poignée évidente à la fois. */
const MOON_FULL_NIGHT = 0.6;
/** Elle ne se prend qu'à moitié visible au moins. */
const MOON_GRABBABLE = 0.5;
/** Étoiles (position dans la moitié haute de la course, en part des demi-axes ; taille). */
const STARS: readonly [number, number, number][] = [
  [-0.62, 0.42, 2.2],
  [-0.3, 0.74, 1.6],
  [-0.05, 0.4, 2.6],
  [0.22, 0.8, 1.8],
  [0.47, 0.5, 2.2],
  [0.72, 0.2, 1.5],
  [-0.8, 0.12, 1.4],
  [0.1, 0.12, 1.3],
];
/** Mer : ondes gravées (largeur, hauteur d'un motif et creux de l'onde). */
const WAVE_W = 8;
const WAVE_H = 4;
const WAVE_DIP = 1.6;
/** Horizon : épaisseur de la règle de laiton et rayon des rivets qui la fixent à l'anneau. Graduations gravées : décalage de leur reflet. */
const HORIZON_THICK = 2.4;
const RIVET = 2.6;
const RIVET_SLOT = RIVET * 0.6;
const ENGRAVE = 0.5;
/** Autour du centre, le pointeur ne désigne aucune heure (part des demi-axes). */
const DEAD_ZONE = 0.22;
const NOON = 12;
const TAU = Math.PI * 2;
/** Heures de l'aube à l'aube suivante, et pas du curseur (un quart d'heure). */
export const DIAL_HOURS = 24;
export const DIAL_STEP = 0.25;

/** Hauteur du soleil (cosinus de l'angle horaire) au lever et au coucher : là, la course croise l'horizon. */
const COS_RISE = -DAY_NIGHT.lift / Math.cos(DAY_NIGHT.tilt);
const HORIZON_Y = CY - RY_SEA * COS_RISE;
const HORIZON_HALF = RX * Math.sqrt(1 - COS_RISE * COS_RISE);
const COURSE = `M${CX - RX} ${CY}A${RX} ${RY_SKY} 0 0 1 ${CX + RX} ${CY}A${RX} ${RY_SEA} 0 0 1 ${CX - RX} ${CY}Z`;

interface CoursePoint {
  x: number;
  y: number;
  /** Normale vers l'extérieur de l'anneau. */
  nx: number;
  ny: number;
}

/** Point de la course à l'heure `hour` (0..24, midi en haut) et normale de l'anneau en ce point. */
function coursePoint(hour: number): CoursePoint {
  const a = ((hour - NOON) / DIAL_HOURS) * TAU;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const ry = c >= 0 ? RY_SKY : RY_SEA;
  const nx = s / RX;
  const ny = -c / ry;
  const n = Math.hypot(nx, ny);
  return { x: CX + RX * s, y: CY - ry * c, nx: nx / n, ny: ny / n };
}

/** Heure (0..24) désignée par un point du cadran (unités du viewBox), ou null trop près du centre. */
export function dialHourAt(x: number, y: number): number | null {
  const u = (x - CX) / RX;
  const v = (CY - y) / (y < CY ? RY_SKY : RY_SEA);
  if (Math.hypot(u, v) < DEAD_ZONE) return null;
  return NOON + (Math.atan2(u, v) / TAU) * DIAL_HOURS;
}

/** Point du cadran (unités du viewBox) sous le pointeur. */
export function dialPoint(svg: Element, clientX: number, clientY: number): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
}

/** Lune visible (0 de jour, 1 la nuit) : à l'opposé du soleil sur la course, donc au-dessus de l'horizon la nuit. */
const moonShown = (day: DayCycle) => Math.min(1, day.night / MOON_FULL_NIGHT);

/** Ramène des heures depuis l'aube sur le pas du curseur, dans 0..24 (la course est un tour complet : 24 h = l'aube). */
export function snapHours(sinceDawn: number): number {
  const v = Math.round(sinceDawn / DIAL_STEP) * DIAL_STEP;
  return ((v % DIAL_HOURS) + DIAL_HOURS) % DIAL_HOURS;
}

/** Le point (x, y) prend-il la lune (visible, plus proche d'elle que du soleil) ? Elle se tire alors comme le soleil, 12 h plus loin. */
export function grabsMoon(day: DayCycle, x: number, y: number, radius: number): boolean {
  if (moonShown(day) < MOON_GRABBABLE) return false;
  const m = coursePoint(day.hour + NOON);
  const s = coursePoint(day.hour);
  const dm = Math.hypot(x - m.x, y - m.y);
  return dm < radius && dm < Math.hypot(x - s.x, y - s.y);
}

const at = (p: { x: number; y: number }) => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`;
const sunAt = (day: DayCycle) => at(coursePoint(day.hour));
const moonAt = (day: DayCycle) => at(coursePoint(day.hour + NOON));
/** Teinte du ciel du cadran (variables lues par le CSS). */
const SKY_VARS = (day: DayCycle): [string, string][] => [
  ['--night', day.night.toFixed(2)],
  ['--twilight', day.twilight.toFixed(2)],
  ['--daylight', day.daylight.toFixed(2)],
];

/** Valeur du curseur (heures depuis l'aube) telle que l'annoncent les lecteurs d'écran. */
export const dialValue = (day: DayCycle) => snapHours(day.sinceDawn).toFixed(2);

/** Ce qui suit l'heure : place du soleil et de la lune, teinte du ciel, valeur lue par les lecteurs d'écran. */
export function refreshDial(root: HTMLElement, day: DayCycle) {
  root.querySelector('.hour-dial-sun')?.setAttribute('transform', sunAt(day));
  const moon = root.querySelector<SVGElement>('.hour-dial-moon');
  if (moon) {
    moon.setAttribute('transform', moonAt(day));
    moon.style.opacity = moonShown(day).toFixed(2);
  }
  for (const [name, value] of SKY_VARS(day)) root.style.setProperty(name, value);
  root.setAttribute('aria-valuenow', dialValue(day));
  root.setAttribute('aria-valuetext', clockLabel(day));
}

/** Graduations de l'anneau (un trait par heure, long toutes les 3 h, doublé d'un reflet) et leurs chiffres. */
function scale(): string {
  let ticks = '';
  let numbers = '';
  for (let h = 0; h < DIAL_HOURS; h++) {
    const p = coursePoint(h);
    const major = h % MAJOR_EVERY === 0;
    const from = major ? -BAND / 2 : BAND / 2 - TICK;
    const line = (dy: number) =>
      `M${(p.x + p.nx * from).toFixed(1)} ${(p.y + p.ny * from + dy).toFixed(1)}L${(p.x + (p.nx * BAND) / 2).toFixed(1)} ${(p.y + (p.ny * BAND) / 2 + dy).toFixed(1)}`;
    ticks += `<path class="hour-dial-tick-light" d="${line(ENGRAVE)}"/><path class="hour-dial-tick${major ? ' major' : ''}" d="${line(0)}"/>`;
    if (!major) continue;
    const d = BAND / 2 + LABEL_GAP + SIDE_GAP * Math.abs(p.nx);
    numbers += `<text x="${(p.x + p.nx * d).toFixed(1)}" y="${(p.y + p.ny * d).toFixed(1)}">${HOUR_WORDS[h] ?? h}</text>`;
  }
  return `<g class="hour-dial-ticks">${ticks}</g><g class="hour-dial-numbers">${numbers}</g>`;
}

/** Rivets aux deux bouts de l'horizon, là où la course le croise (lever et coucher du soleil). */
function rivets(): string {
  return [-1, 1]
    .map((side) => {
      const x = (CX + side * HORIZON_HALF).toFixed(1);
      const y = HORIZON_Y.toFixed(1);
      return `<g class="hour-dial-rivet" transform="translate(${x} ${y})"><circle r="${RIVET}"/><path d="M${-RIVET_SLOT} ${RIVET_SLOT}L${RIVET_SLOT} ${-RIVET_SLOT}"/></g>`;
    })
    .join('');
}

/** Soleil de laiton (la prise du curseur) : rayons en étoile, disque, et l'anneau qui montre le focus clavier. */
function sun(day: DayCycle): string {
  let rays = '';
  for (let i = 0; i < SUN_RAYS * 2; i++) {
    const r = i % 2 ? SUN_DISC : SUN_RAY;
    const a = (i / (SUN_RAYS * 2)) * TAU;
    rays += `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)} `;
  }
  return `<g class="hour-dial-sun" transform="${sunAt(day)}"><circle class="hour-dial-focus" r="${SUN_RAY + BAND / 2}"/><g class="hour-dial-sun-body">
    <polygon class="hour-dial-rays" points="${rays.trim()}"/><circle class="hour-dial-disc" r="${SUN_DISC}"/></g></g>`;
}

/** Ciel (jour, crépuscule, nuit étoilée) au-dessus de l'horizon, mer gravée au-dessous, découpés par l'anneau. */
function sky(): string {
  const top = CY - RY_SKY;
  // Étoile à quatre branches : pointe haute, puis un creux et une pointe à chaque quart de tour.
  const stars = STARS.map(([u, v, s]) => {
    const a = (s / 4).toFixed(2);
    const b = ((s * 3) / 4).toFixed(2);
    return `<path d="M${(CX + u * RX).toFixed(1)} ${(CY - v * RY_SKY - s).toFixed(1)}l${a} ${b} ${b} ${a} -${b} ${a} -${a} ${b} -${a} -${b} -${b} -${a} ${b} -${a}z"/>`;
  }).join('');
  const box = (cls: string, y0: number, y1: number, fill = '') =>
    `<rect class="${cls}" x="${CX - RX}" y="${y0.toFixed(1)}" width="${RX * 2}" height="${(y1 - y0).toFixed(1)}"${fill ? ` fill="${fill}"` : ''}/>`;
  return `<g clip-path="url(#hour-dial-inside)">
    ${box('hour-dial-sky', top, HORIZON_Y, 'url(#hour-dial-sky)')}
    ${box('hour-dial-dusk', HORIZON_Y - GLOW_H, HORIZON_Y, 'url(#hour-dial-glow)')}
    ${box('hour-dial-night', top, HORIZON_Y)}
    <g class="hour-dial-stars">${stars}</g>
    ${box('hour-dial-sea', HORIZON_Y, CY + RY_SEA)}
    ${box('hour-dial-waves', HORIZON_Y, CY + RY_SEA, 'url(#hour-dial-waves)')}
    <rect class="hour-dial-horizon" x="${(CX - HORIZON_HALF).toFixed(1)}" y="${(HORIZON_Y - HORIZON_THICK / 2).toFixed(1)}" width="${(HORIZON_HALF * 2).toFixed(1)}" height="${HORIZON_THICK}" fill="url(#hour-dial-brass-v)"/>
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="hour-dial-brass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f7e4a2"/><stop offset=".28" stop-color="#d2a54b"/><stop offset=".5" stop-color="#8c6524"/>
    <stop offset=".72" stop-color="#e3c172"/><stop offset="1" stop-color="#7a561c"/>
  </linearGradient>
  <linearGradient id="hour-dial-brass-v" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f3d98c"/><stop offset=".5" stop-color="#b98c3c"/><stop offset="1" stop-color="#5e4214"/>
  </linearGradient>
  <linearGradient id="hour-dial-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a9c1c4"/><stop offset="1" stop-color="#f4e6c2"/>
  </linearGradient>
  <linearGradient id="hour-dial-glow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e8955a" stop-opacity="0"/><stop offset="1" stop-color="#e07a45" stop-opacity=".85"/>
  </linearGradient>
  <radialGradient id="hour-dial-gold" cx=".38" cy=".34" r=".75">
    <stop offset="0" stop-color="#fff4c0"/><stop offset=".45" stop-color="#e3b44e"/><stop offset="1" stop-color="#8a5d1a"/>
  </radialGradient>
  <pattern id="hour-dial-waves" width="${WAVE_W}" height="${WAVE_H}" patternUnits="userSpaceOnUse" patternTransform="translate(0 ${HORIZON_Y.toFixed(1)})">
    <path class="hour-dial-wave" d="M0 ${WAVE_H / 2}q${WAVE_W / 4} ${-WAVE_DIP} ${WAVE_W / 2} 0t${WAVE_W / 2} 0"/>
  </pattern>
  <clipPath id="hour-dial-inside"><path d="${COURSE}"/></clipPath>
  <mask id="hour-dial-crescent"><circle r="${MOON_R}" fill="#fff"/><circle cx="${MOON_BITE[0]}" cy="${MOON_BITE[1]}" r="${MOON_BITE[2]}" fill="#000"/></mask>
</defs>`;

/** Le curseur d'heure : un `role="slider"` (souris, clavier, lecteurs d'écran) qui contient le cadran. */
export function hourDialHtml(day: DayCycle): string {
  const vars = SKY_VARS(day)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return `<div class="hour-dial" role="slider" tabindex="0" aria-label="Heure du jour" aria-valuemin="0"
    aria-valuemax="${DIAL_HOURS - DIAL_STEP}" aria-valuenow="${dialValue(day)}" aria-valuetext="${clockLabel(day)}" style="${vars}">
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">${DEFS}
      ${sky()}
      <path class="hour-dial-ring-edge" d="${COURSE}"/><path class="hour-dial-ring" d="${COURSE}"/>
      ${scale()}
      ${rivets()}
      <g class="hour-dial-moon" transform="${moonAt(day)}" style="opacity:${moonShown(day).toFixed(2)}"><circle r="${MOON_R}" mask="url(#hour-dial-crescent)"/></g>
      ${sun(day)}
    </svg>
  </div>`;
}
