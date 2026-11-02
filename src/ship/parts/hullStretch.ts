import { EXTENDED_MASTS } from '../../config';

/** Une partie de la coque qui s'étire (u de base, de la poupe vers la proue) et la longueur qu'on lui ajoute (m). */
export interface StretchPart {
  from: number;
  to: number;
  added: number;
}

/**
 * Allongement d'une coque dessinée pour une longueur de base : les parties données s'étirent de leur longueur ajoutée,
 * le reste glisse sans se déformer (poupe, étrave, châteaux). `base(u)` convertit une position en u de base en u de la
 * coque allongée ; `zOf(z)` fait de même pour une cote en mètres (beaupré, focs).
 */
export function hullStretch(baseHalf: number, parts: readonly StretchPart[]) {
  const sections = parts.map((p) => ({ from: p.from * baseHalf, to: p.to * baseHalf, added: p.added }));
  const extra = sections.reduce((sum, s) => sum + s.added, 0);
  const half = baseHalf + extra / 2;
  const zOf = (z: number) => {
    let out = z - extra / 2;
    for (const s of sections) out += z >= s.to ? s.added : z > s.from ? (s.added * (z - s.from)) / (s.to - s.from) : 0;
    return out;
  };
  return { half, extra, zOf, base: (u: number) => zOf(u * baseHalf) / half };
}

/**
 * Cote du grand mât d'un navire allongé (`level` allongements faits) : rapproché du milieu entre misaine et artimon
 * (EXTENDED_MASTS.mainBalance). Le navire de base garde sa cote.
 */
export function balancedMainMast(main: number, fore: number, aft: number, level: number): number {
  return level > 0 ? main + ((fore + aft) / 2 - main) * EXTENDED_MASTS.mainBalance : main;
}

/** Ordre d'achat de n sabords réguliers (0 = le plus en arrière) : les `first` du milieu, puis alternativement vers l'avant et l'arrière. */
export function purchaseOrder(n: number, first = 4): number[] {
  const start = Math.floor((n - first) / 2);
  const order = Array.from({ length: Math.min(first, n) }, (_, i) => start + i);
  for (let k = 0; order.length < n; k++) {
    const fore = start + first + k;
    const aft = start - 1 - k;
    if (fore < n) order.push(fore);
    if (aft >= 0 && order.length < n) order.push(aft);
  }
  return order;
}
