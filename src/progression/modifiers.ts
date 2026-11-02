import { GUNS, MODIFIER_KEYS, type Cost, type GunType, type ModifierKey, type ShipStats, type StatEffect } from '../config';
import type { ShipType } from '../shipTypes';

/** Somme des effets (fractions) d'un navire : officiers, rang. 0 = sans effet. */
export type StatModifiers = Record<ModifierKey, number>;

/** Types de canons de chaque calibre d'un navire. */
export interface Guns {
  main: GunType;
  deck: GunType;
}

/** Un facteur ne descend jamais sous ce plancher (cumul de baisses). */
const MIN_FACTOR = 0.3;

export function noModifiers(): StatModifiers {
  return Object.fromEntries(MODIFIER_KEYS.map((k) => [k, 0])) as StatModifiers;
}

export function standardGuns(): Guns {
  return { main: 'standard', deck: 'standard' };
}

/** Ajoute un effet (× scale, par exemple le nombre d'étoiles) à une somme d'effets. */
export function addEffect(target: StatModifiers, effect: StatEffect, scale = 1) {
  for (const key of Object.keys(effect) as ModifierKey[]) target[key] += (effect[key] ?? 0) * scale;
}

/** Prix du premier passage d'une batterie d'un navire à un nouveau type de canons. */
export function gunCost(type: ShipType, battery: keyof Guns): Cost {
  const base = GUNS.cost[type];
  const f = battery === 'deck' ? GUNS.deckCostFactor : 1;
  return { gold: Math.round(base.gold * f), wood: Math.round(base.wood * f) };
}

/** Facteur d'un effet : 1 + somme, jamais sous MIN_FACTOR. */
export function factor(m: StatModifiers, key: ModifierKey): number {
  return Math.max(MIN_FACTOR, 1 + m[key]);
}

/**
 * Caractéristiques finales d'un navire : celles des améliorations (deriveStats), puis l'effet de ses officiers et de son
 * rang, puis le type de canons de chaque calibre. Modifie et renvoie `stats`.
 */
export function applyModifiers(stats: ShipStats, m: StatModifiers, guns: Guns): ShipStats {
  stats.maxHealth = Math.round(stats.maxHealth * factor(m, 'health'));
  stats.maxSpeed *= factor(m, 'speed');
  stats.turnRate *= factor(m, 'turn');
  const calibres: [typeof stats.cannon, GunType][] = [[stats.cannon, guns.main]];
  if (stats.deckCannon) calibres.push([stats.deckCannon, guns.deck]);
  for (const [c, type] of calibres) {
    // Un mortier reste un mortier : les types de canons ne le changent pas.
    const g = GUNS.types[c.shell ? 'standard' : type];
    const range = factor(m, 'range') * g.range;
    c.reloadTime *= factor(m, 'reload') * g.reload;
    c.spread *= factor(m, 'spread');
    c.rangeError *= factor(m, 'spread');
    c.damage *= factor(m, 'damage') * g.damage;
    // Comme l'amélioration de portée : boulets plus ou moins rapides, trajectoires toujours tendues.
    c.range *= range;
    c.ballSpeed *= Math.sqrt(range);
  }
  return stats;
}
