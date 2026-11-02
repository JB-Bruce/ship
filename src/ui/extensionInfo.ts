import type { ShipStats } from '../config';
import type { FleetMember } from '../fleet/fleet';
import { cannonCount, deriveStats, maxLevel, type UpgradeId, type UpgradeLevels } from '../progression/upgrades';
import type { ExtensionDef } from '../shipTypeDef';
import { SHIP_TYPES, typeName, UPGRADE_INFO } from '../shipTypes';

const MS_TO_KNOTS = 1.944;

/** L'allongement suivant d'un navire : lequel (index), ses réglages, le nom d'avant et celui d'après. */
export interface NextExtension {
  readonly index: number;
  readonly ext: ExtensionDef;
  readonly before: string;
  readonly after: string;
  /** Allongements faits et en tout. */
  readonly done: number;
  readonly total: number;
}

/** Le prochain allongement de ce navire, ou null s'il n'en a pas ou qu'il est à sa taille maximale. */
export function nextExtension(m: FleetMember): NextExtension | null {
  const all = SHIP_TYPES[m.type].extensions ?? [];
  const done = m.levels.extension;
  if (done >= all.length) return null;
  return { index: done, ext: all[done], before: typeName(m.type, done), after: typeName(m.type, done + 1), done, total: all.length };
}

/** Nombre d'allongements possibles pour ce type (0 : aucun). */
export const extensionCount = (m: FleetMember) => SHIP_TYPES[m.type].extensions?.length ?? 0;

/** Une caractéristique que l'allongement change, montrée en barre au Chantier. */
export interface ExtensionGauge {
  readonly label: string;
  readonly now: number;
  readonly after: number;
  readonly top: number;
  readonly text: (v: number) => string;
}

const fmt = (v: number, digits = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: digits });

/** Le navire à `extension` allongements, ses améliorations telles quelles, ses canons au plus haut que cette taille ouvre. */
function statsAt(m: FleetMember, extension: number): { stats: ShipStats; guns: number } {
  const levels: UpgradeLevels = { ...m.levels, extension };
  const stats = deriveStats(m.type, SHIP_TYPES[m.type].stats, levels);
  const full = deriveStats(m.type, SHIP_TYPES[m.type].stats, { ...levels, cannons: maxLevel(m.type, 'cannons', levels) });
  return { stats, guns: cannonCount(full) };
}

/**
 * Barres de l'allongement suivant : longueur, vie, vitesse, virage (maintenant → après), et canons qu'on pourra monter
 * au plus ; le bout de chaque barre = le navire allongé au maximum. Portées sur les stats du navire (officiers, rang).
 */
export function extensionGauges(m: FleetMember): ExtensionGauge[] {
  const total = extensionCount(m);
  const e = m.levels.extension;
  const now = statsAt(m, e);
  const after = statsAt(m, Math.min(total, e + 1));
  const top = statsAt(m, total);
  const real = m.ship.stats;
  const k = (pick: (s: ShipStats) => number) => (pick(now.stats) ? pick(real) / pick(now.stats) : 1);
  const line = (label: string, pick: (s: ShipStats) => number, text: (v: number) => string): ExtensionGauge => {
    const f = k(pick);
    return { label, now: pick(now.stats) * f, after: pick(after.stats) * f, top: pick(top.stats) * f, text };
  };
  return [
    line('Longueur', (s) => s.length, (v) => `${fmt(v, 1)} m`),
    line('Vie', (s) => s.maxHealth, (v) => fmt(v)),
    line('Vitesse', (s) => s.maxSpeed * MS_TO_KNOTS, (v) => `${fmt(v, 1)} nœuds`),
    line('Virage', (s) => s.turnRate, (v) => fmt(v * 100)),
    { label: 'Canons au plus', now: now.guns, after: after.guns, top: top.guns, text: (v) => fmt(v) },
  ];
}

/** Ce que l'allongement ouvre : « 2 niveaux de canons », « 1 niveau de voilure »… */
export function extensionUnlocks(ext: ExtensionDef): string[] {
  return (Object.keys(ext.extraLevels) as UpgradeId[])
    .filter((id) => ext.extraLevels[id])
    .map((id) => {
      const n = ext.extraLevels[id]!;
      return `${n} niveau${n > 1 ? 'x' : ''} : ${UPGRADE_INFO[id].name.toLowerCase()}`;
    });
}

/** Effets en une ligne : « +4 m · vie +20 % · vitesse −3 % ». */
export function extensionEffects(ext: ExtensionDef): string {
  const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;
  return `${ext.length > 0 ? `+${ext.length} m · ` : ''}vie ${pct(ext.healthFactor)} · vitesse ${pct(ext.speedFactor)}${ext.turnFactor !== 1 ? ` · virage ${pct(ext.turnFactor)}` : ''}`;
}
