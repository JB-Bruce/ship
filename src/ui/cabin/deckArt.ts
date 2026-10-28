import type { ShipType } from '../../shipTypes';

/** Plan d'un pont vu de dessus, la proue en haut : proportions et pièces, en parts de la longueur (0 = proue, 1 = poupe). */
interface DeckPlanArt {
  /** Longueur / largeur. */
  ratio: number;
  bow: 'sharp' | 'round' | 'spur';
  stern: 'square' | 'round';
  /** Longueur du gaillard d'avant et du château arrière. */
  fore: number;
  aft: number;
  masts: readonly number[];
  /** Canons par bord, avirons par bord. */
  guns: number;
  oars?: number;
  bowsprit?: boolean;
}

/** Chaque type (allongé : plus long, deux canons de plus par bord à chaque allongement). */
const PLANS: Record<ShipType, DeckPlanArt> = {
  rowboat: { ratio: 2.2, bow: 'sharp', stern: 'square', fore: 0, aft: 0, masts: [], guns: 0, oars: 3 },
  longboat: { ratio: 2.6, bow: 'sharp', stern: 'square', fore: 0, aft: 0, masts: [0.4], guns: 0, oars: 3 },
  sloop: { ratio: 3, bow: 'sharp', stern: 'square', fore: 0, aft: 0.12, masts: [0.38], guns: 3, bowsprit: true },
  cutter: { ratio: 3.1, bow: 'sharp', stern: 'square', fore: 0, aft: 0, masts: [0.42], guns: 2, bowsprit: true },
  caravel: { ratio: 2.8, bow: 'round', stern: 'round', fore: 0.15, aft: 0.26, masts: [0.35, 0.66], guns: 3, bowsprit: true },
  schooner: { ratio: 3.6, bow: 'sharp', stern: 'square', fore: 0, aft: 0.1, masts: [0.35, 0.62], guns: 3, bowsprit: true },
  brigantine: { ratio: 3.4, bow: 'sharp', stern: 'square', fore: 0.12, aft: 0.18, masts: [0.3, 0.58], guns: 4, bowsprit: true },
  xebec: { ratio: 4, bow: 'spur', stern: 'round', fore: 0.08, aft: 0.15, masts: [0.18, 0.45, 0.75], guns: 3, oars: 7 },
  fluyt: { ratio: 3.6, bow: 'round', stern: 'round', fore: 0.12, aft: 0.22, masts: [0.25, 0.5, 0.76], guns: 4, bowsprit: true },
  brig: { ratio: 3.6, bow: 'sharp', stern: 'square', fore: 0, aft: 0, masts: [0.3, 0.6], guns: 6, bowsprit: true },
  galiot: { ratio: 3.2, bow: 'round', stern: 'square', fore: 0, aft: 0.24, masts: [0.47, 0.85], guns: 3, bowsprit: true },
  corvette: { ratio: 3.8, bow: 'sharp', stern: 'square', fore: 0.12, aft: 0.2, masts: [0.25, 0.5, 0.76], guns: 6, bowsprit: true },
  carrack: { ratio: 3, bow: 'round', stern: 'round', fore: 0.2, aft: 0.3, masts: [0.2, 0.45, 0.68, 0.86], guns: 4, bowsprit: true },
  galleass: { ratio: 4.6, bow: 'spur', stern: 'square', fore: 0.12, aft: 0.18, masts: [0.25, 0.5, 0.76], guns: 5, oars: 12 },
  frigate: { ratio: 4, bow: 'sharp', stern: 'square', fore: 0.14, aft: 0.22, masts: [0.25, 0.5, 0.76], guns: 8, bowsprit: true },
  galleon: { ratio: 3.6, bow: 'sharp', stern: 'round', fore: 0.12, aft: 0.3, masts: [0.2, 0.42, 0.65, 0.84], guns: 7, bowsprit: true },
};

/** Allongement : longueur en plus (× la largeur) et canons en plus par bord, pour chaque allongement. */
const EXTENSION = { ratio: 0.35, guns: 2 };
/** Dessin : toile de 100 × 400, coque de `TOP` à `BOTTOM`, demi-largeur `BEAM`. */
const VIEW = { width: 100, height: 400 };
const TOP = 16;
const BOTTOM = 394;
const BEAM = 44;
const STEPS = 48;
const COLORS = { deck: '#9b7243', plank: '#7d5730', castle: '#7a5230', edge: '#3a2412', rail: '#b88d55', mast: '#2e1b0c', gun: '#22170e', oar: '#5a3b20' };

/** Demi-largeur de la coque à `t` (0 = proue, 1 = poupe), en part de la largeur. */
function halfWidth(plan: DeckPlanArt, t: number): number {
  let w = 1;
  if (plan.bow === 'round' && t < 0.22) w = Math.sqrt(1 - (1 - t / 0.22) ** 2);
  else if (plan.bow === 'sharp' && t < 0.34) w = (t / 0.34) ** 0.62;
  else if (plan.bow === 'spur') w = t < 0.07 ? 0.12 : t < 0.3 ? 0.12 + 0.88 * ((t - 0.07) / 0.23) ** 0.6 : 1;
  if (t > 0.86) {
    const k = (t - 0.86) / 0.14;
    w = Math.min(w, plan.stern === 'round' ? 0.35 + 0.65 * Math.sqrt(1 - k * k) : 1 - 0.3 * k);
  }
  return Math.max(0.02, w);
}

const yAt = (t: number) => TOP + t * (BOTTOM - TOP);
const f = (v: number) => v.toFixed(1);

/** Contour de la coque, réduit de `inset` (rentré vers l'intérieur). */
function hullPath(plan: DeckPlanArt, inset = 0): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const w = Math.max(0, BEAM * halfWidth(plan, t) - inset);
    left.push(`${f(50 - w)},${f(yAt(t))}`);
    right.push(`${f(50 + w)},${f(yAt(t))}`);
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`;
}

/** Postes (canons, avirons) répartis sur le milieu du navire, le long d'un bord. */
function along(count: number, from: number, to: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((i + 0.5) / count) * (to - from));
}

/**
 * Le pont du navire consulté, vu de dessus, pour le fond de la page Équipage : sa forme (proue pointue, ronde ou à
 * éperon ; poupe carrée ou ronde), ses châteaux plus sombres, ses mâts, ses sabords et ses avirons ; `ratio` sert à
 * donner sa hauteur à la page (un navire long est plus haut). Le dessin s'étire à la taille de la page.
 */
export function deckArt(type: ShipType, extension: number): { svg: string; ratio: number } {
  const base = PLANS[type];
  const plan = { ...base, ratio: base.ratio + EXTENSION.ratio * extension, guns: base.guns + (base.guns ? EXTENSION.guns * extension : 0) };
  const hull = hullPath(plan);
  const planks = Array.from({ length: 13 }, (_, i) => `M${f(14 + i * 6)},0V${VIEW.height}`).join('');
  const castles = [
    plan.fore ? `<rect x="0" y="0" width="100" height="${f(yAt(plan.fore))}" fill="${COLORS.castle}"/><path d="M0,${f(yAt(plan.fore))}H100" stroke="${COLORS.edge}" stroke-width="1.5"/>` : '',
    plan.aft ? `<rect x="0" y="${f(yAt(1 - plan.aft))}" width="100" height="${VIEW.height}" fill="${COLORS.castle}"/><path d="M0,${f(yAt(1 - plan.aft))}H100" stroke="${COLORS.edge}" stroke-width="1.5"/>` : '',
  ].join('');
  const masts = plan.masts.map((t) => `<path d="M${f(50 - BEAM * halfWidth(plan, t) * 0.85)},${f(yAt(t))}H${f(50 + BEAM * halfWidth(plan, t) * 0.85)}" stroke="${COLORS.mast}" stroke-width="1.6" opacity="0.6"/><circle cx="50" cy="${f(yAt(t))}" r="4.2" fill="${COLORS.mast}"/>`).join('');
  const guns = along(plan.guns, 0.3, 0.82)
    .flatMap((t) => [-1, 1].map((side) => `<rect x="${f(50 + side * (BEAM * halfWidth(plan, t) - 5) - 2.5)}" y="${f(yAt(t) - 1.6)}" width="5" height="3.2" fill="${COLORS.gun}"/>`))
    .join('');
  const oars = along(plan.oars ?? 0, 0.3, 0.8)
    .flatMap((t) => [-1, 1].map((side) => `<path d="M${f(50 + side * BEAM * halfWidth(plan, t))},${f(yAt(t))}l${side * 8},4" stroke="${COLORS.oar}" stroke-width="1.6" stroke-linecap="round"/>`))
    .join('');
  const bowsprit = plan.bowsprit ? `<path d="M50,${TOP + 4}V2" stroke="${COLORS.mast}" stroke-width="2.4" stroke-linecap="round"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="none">
    <defs><clipPath id="h"><path d="${hull}"/></clipPath></defs>
    ${oars}${bowsprit}
    <g clip-path="url(#h)"><rect width="100" height="${VIEW.height}" fill="${COLORS.deck}"/><path d="${planks}" stroke="${COLORS.plank}" stroke-width="0.6"/>${castles}</g>
    <path d="${hullPath(plan, 3)}" fill="none" stroke="${COLORS.rail}" stroke-width="1.2"/>
    <path d="${hull}" fill="none" stroke="${COLORS.edge}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>
    ${guns}${masts}
  </svg>`;
  return { svg, ratio: plan.ratio };
}
