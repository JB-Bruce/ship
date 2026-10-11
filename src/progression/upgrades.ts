import type { Cost, ShipStats } from '../config';
import { SHIP_TYPES, UPGRADE_INFO, type ExtensionDef, type ShipType } from '../shipTypes';

export type UpgradeId = keyof typeof UPGRADE_INFO;
/** Niveaux d'amélioration d'un navire, et ses allongements (nombre faits ; seulement pour les types qui en ont). */
export type UpgradeLevels = Record<UpgradeId, number> & { extension: number };

export const UPGRADE_IDS = Object.keys(UPGRADE_INFO) as UpgradeId[];

export function noUpgrades(): UpgradeLevels {
  return { accuracy: 0, range: 0, cannons: 0, hull: 0, sails: 0, hold: 0, extension: 0 };
}

/** Le navire est-il allongé ? */
export const isExtended = (levels: UpgradeLevels) => levels.extension > 0;

/** Allongements faits (dans l'ordre), dont les effets se cumulent. */
export function appliedExtensions(type: ShipType, levels: UpgradeLevels): readonly ExtensionDef[] {
  return SHIP_TYPES[type].extensions?.slice(0, levels.extension) ?? [];
}

/** Niveaux d'une amélioration réservés aux allongements à partir du `from`-ième (0 = tous), à la fin de sa table. */
export function extensionLevels(type: ShipType, id: UpgradeId, from = 0): number {
  return (SHIP_TYPES[type].extensions ?? []).slice(from).reduce((sum, e) => sum + (e.extraLevels[id] ?? 0), 0);
}

/** Niveau maximal d'une amélioration : sans `levels`, ou selon les allongements faits (les niveaux des autres sont exclus). */
export function maxLevel(type: ShipType, id: UpgradeId, levels?: UpgradeLevels): number {
  return SHIP_TYPES[type].upgrades[id].costs.length - extensionLevels(type, id, levels?.extension ?? 0);
}

/** Toutes les améliorations au maximum (sauf la cale, inutile en combat). */
export function maxLevels(type: ShipType): UpgradeLevels {
  const levels = noUpgrades();
  for (const id of UPGRADE_IDS) if (id !== 'hold') levels[id] = maxLevel(type, id);
  return levels;
}

/** Coût du prochain niveau, ou null si l'amélioration est au maximum (allongement compris). */
export function nextCost(type: ShipType, id: UpgradeId, levels: UpgradeLevels): Cost | null {
  const level = levels[id];
  return level < maxLevel(type, id, levels) ? SHIP_TYPES[type].upgrades[id].costs[level] : null;
}

/** Somme des niveaux d'amélioration (sert à estimer la force d'un ennemi). */
export function totalLevels(levels: UpgradeLevels): number {
  return UPGRADE_IDS.reduce((sum, id) => sum + levels[id], 0);
}

/** Places dans la cale selon le niveau de l'amélioration « Cale ». */
export function holdCapacity(type: ShipType, levels: UpgradeLevels): number {
  const def = SHIP_TYPES[type];
  return levels.hold > 0 ? def.upgrades.hold.capacity[levels.hold - 1] : def.hold;
}

/** Masse totale du bateau selon ses améliorations. */
export function shipMass(type: ShipType, levels: UpgradeLevels): number {
  const { mass, upgrades, stats } = SHIP_TYPES[type];
  const cannonsPerSide = levels.cannons > 0 ? upgrades.cannons.cannonsPerSide[levels.cannons - 1] : stats.cannonsPerSide;
  const extraCannons = (cannonsPerSide - stats.cannonsPerSide) * 2;
  const hull = levels.hull > 0 ? mass.hull[levels.hull - 1] : 0;
  const sails = levels.sails > 0 ? mass.sails[levels.sails - 1] : 0;
  const hold = levels.hold > 0 ? (mass.hold[levels.hold - 1] ?? 0) : 0;
  const extension = appliedExtensions(type, levels).reduce((sum, e) => sum + e.mass, 0);
  return mass.base + extraCannons * mass.perExtraCannon + hull + sails + hold + extension;
}

/** Vitesse perdue à cause de la masse (fraction, 0 = aucune perte). */
export function massSpeedLoss(type: ShipType, levels: UpgradeLevels): number {
  const { mass } = SHIP_TYPES[type];
  return (shipMass(type, levels) - mass.base) * mass.speedLossPerUnit;
}

/** Caractéristiques après améliorations, à partir d'une base (joueur ou ennemi) qui n'est jamais modifiée. */
export function deriveStats(type: ShipType, base: ShipStats, levels: UpgradeLevels): ShipStats {
  const table = SHIP_TYPES[type].upgrades;
  const stats = structuredClone(base);
  // Précision et portée profitent à tous les calibres du navire.
  const calibres = stats.deckCannon ? [stats.cannon, stats.deckCannon] : [stats.cannon];
  if (levels.accuracy > 0) {
    const f = table.accuracy.spreadFactor[levels.accuracy - 1];
    for (const c of calibres) {
      c.spread *= f;
      c.rangeError *= f;
    }
  }
  if (levels.range > 0) {
    // Portée plus longue, et boulets un peu plus rapides pour garder des trajectoires tendues.
    const f = table.range.rangeFactor[levels.range - 1];
    for (const c of calibres) {
      c.range *= f;
      c.ballSpeed *= Math.sqrt(f);
    }
  }
  if (levels.cannons > 0) stats.cannonsPerSide = table.cannons.cannonsPerSide[levels.cannons - 1];
  if (levels.hull > 0) stats.maxHealth += table.hull.healthBonus[levels.hull - 1];
  // Allongements : coque plus longue (plus de vie, file un peu mieux, vire moins vite) ; leurs effets se cumulent.
  let hullSpeed = 1;
  for (const e of appliedExtensions(type, levels)) {
    stats.length += e.length;
    stats.maxHealth = Math.round(stats.maxHealth * e.healthFactor);
    stats.turnRate *= e.turnFactor;
    hullSpeed *= e.speedFactor;
  }
  const sail = levels.sails > 0 ? table.sails.speedFactor[levels.sails - 1] : 1;
  stats.maxSpeed *= sail * hullSpeed * (1 - massSpeedLoss(type, levels));
  stats.acceleration *= sail;
  // Plus lourd = flottaison plus lente et plus posée (même amortissement relatif, ressorts plus mous).
  const heaviness = shipMass(type, levels) / SHIP_TYPES[type].mass.base;
  stats.buoyancy.stiffness /= heaviness;
  stats.buoyancy.damping /= Math.sqrt(heaviness);
  stats.buoyancy.tiltResponse /= Math.sqrt(heaviness);
  return stats;
}

/** Effet d'un niveau (1 = premier niveau), en texte pour le menu. */
export function describeLevel(type: ShipType, id: UpgradeId, level: number): string {
  const t = SHIP_TYPES[type].upgrades;
  const i = level - 1;
  switch (id) {
    case 'accuracy':
      return `Imprécision −${Math.round((1 - t.accuracy.spreadFactor[i]) * 100)} %`;
    case 'range':
      return `Portée +${Math.round((t.range.rangeFactor[i] - 1) * 100)} %`;
    case 'cannons':
      return `${t.cannons.cannonsPerSide[i]} canons par flanc`;
    case 'hull':
      return `Vie max +${t.hull.healthBonus[i]}`;
    case 'sails':
      return `Vitesse +${Math.round((t.sails.speedFactor[i] - 1) * 100)} %`;
    case 'hold':
      return `Cale : ${t.hold.capacity[i]} places`;
  }
}

/** Niveaux tirés au hasard pour un ennemi : plus la menace (0..1) est haute, plus il est amélioré. */
export function randomLevels(type: ShipType, threat: number): UpgradeLevels {
  const levels = noUpgrades();
  // La cale ne sert à rien chez l'ennemi (et ne doit pas gonfler son butin).
  for (const id of UPGRADE_IDS) {
    if (id === 'hold') continue;
    const max = maxLevel(type, id);
    while (levels[id] < max && Math.random() < threat * 0.75) levels[id]++;
  }
  return levels;
}
