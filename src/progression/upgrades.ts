import type { Cost, ShipStats } from '../config';
import { SHIP_TYPES, UPGRADE_INFO, type ExtensionDef, type ShipType } from '../shipTypes';

export type UpgradeId = keyof typeof UPGRADE_INFO;
/** Niveaux d'amélioration d'un navire, et ses allongements (nombre faits ; seulement pour les types qui en ont). */
export type UpgradeLevels = Record<UpgradeId, number> & { extension: number };

export const UPGRADE_IDS = Object.keys(UPGRADE_INFO) as UpgradeId[];

export function noUpgrades(): UpgradeLevels {
  return { accuracy: 0, range: 0, cannons: 0, hull: 0, sails: 0, hold: 0, nets: 0, extension: 0 };
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

/** Améliorations inutiles en combat : jamais tirées pour un ennemi, ni montées sur un boss. */
const PEACEFUL: readonly UpgradeId[] = ['hold', 'nets'];

/** Tous les allongements et toutes les améliorations au maximum (sauf la cale et les filets, inutiles en combat). */
export function maxLevels(type: ShipType): UpgradeLevels {
  const levels = noUpgrades();
  levels.extension = SHIP_TYPES[type].extensions?.length ?? 0;
  for (const id of UPGRADE_IDS) if (!PEACEFUL.includes(id)) levels[id] = maxLevel(type, id, levels);
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

/** Temps entre deux poissons pêchés, multiplié par les filets (1 sans filets). */
export function catchFactor(type: ShipType, levels: UpgradeLevels): number {
  return levels.nets > 0 ? SHIP_TYPES[type].upgrades.nets.catchFactor[levels.nets - 1] : 1;
}

/**
 * Canons de chasse montés : caravelle, dès le niveau `chaseFrom` de l'amélioration des canons ; chébec, ceux de la base
 * puis de la table `chaseGuns`.
 */
export function chaseGunsFor(type: ShipType, levels: UpgradeLevels): number {
  const { upgrades, stats } = SHIP_TYPES[type];
  const { chaseFrom, chaseGuns } = upgrades.cannons;
  if (chaseGuns) return levels.cannons > 0 ? chaseGuns[levels.cannons - 1] : (stats.chaseGuns ?? 0);
  return chaseFrom !== undefined && levels.cannons >= chaseFrom ? 1 : 0;
}

/** Le type a-t-il des canons de chasse (montés d'emblée ou à acheter) ? */
const hasChaseGuns = (type: ShipType) => SHIP_TYPES[type].upgrades.cannons.chaseFrom !== undefined || SHIP_TYPES[type].upgrades.cannons.chaseGuns !== undefined;

/** Nombre total de canons d'un navire : ses deux flancs et ses canons de chasse. */
export const cannonCount = (stats: ShipStats) => stats.cannonsPerSide * 2 + (stats.chaseGuns ?? 0);

/** Masse totale du bateau selon ses améliorations. */
export function shipMass(type: ShipType, levels: UpgradeLevels): number {
  const { mass, upgrades, stats } = SHIP_TYPES[type];
  const cannonsPerSide = levels.cannons > 0 ? upgrades.cannons.cannonsPerSide[levels.cannons - 1] : stats.cannonsPerSide;
  const extraCannons = (cannonsPerSide - stats.cannonsPerSide) * 2;
  const hull = levels.hull > 0 ? mass.hull[levels.hull - 1] : 0;
  const sails = levels.sails > 0 ? mass.sails[levels.sails - 1] : 0;
  const hold = levels.hold > 0 ? (mass.hold[levels.hold - 1] ?? 0) : 0;
  const extension = appliedExtensions(type, levels).reduce((sum, e) => sum + e.mass, 0);
  const chase = (chaseGunsFor(type, levels) - (stats.chaseGuns ?? 0)) * (mass.chaseGun ?? 0);
  return mass.base + extraCannons * mass.perExtraCannon + chase + hull + sails + hold + extension;
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
  if (hasChaseGuns(type)) stats.chaseGuns = chaseGunsFor(type, levels);
  if (levels.hull > 0) stats.maxHealth = Math.round(stats.maxHealth * table.hull.healthFactor[levels.hull - 1]);
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
      return describeCannons(type, level);
    case 'hull':
      return `Vie max +${Math.round((t.hull.healthFactor[i] - 1) * 100)} %`;
    case 'sails':
      return `Vitesse +${Math.round((t.sails.speedFactor[i] - 1) * 100)} %`;
    case 'hold':
      return `Cale : ${t.hold.capacity[i]} places`;
    case 'nets':
      return `Pêche ${Math.round((1 / t.nets.catchFactor[i] - 1) * 100)} % plus rapide`;
  }
}

/** Effet d'un niveau de l'amélioration des canons : ce qu'il ajoute (canons par flanc, canons de chasse). */
function describeCannons(type: ShipType, level: number): string {
  const t = SHIP_TYPES[type].upgrades.cannons;
  if (level === t.chaseFrom) return 'Gros canon de chasse à la proue';
  const perSide = t.cannonsPerSide[level - 1];
  if (!t.chaseGuns) return `${perSide} canons par flanc`;
  const before = noUpgrades();
  before.cannons = level - 1;
  const chase = t.chaseGuns[level - 1];
  const parts: string[] = [];
  if (perSide !== (level > 1 ? t.cannonsPerSide[level - 2] : SHIP_TYPES[type].stats.cannonsPerSide)) parts.push(`${perSide} canons par flanc`);
  if (chase !== chaseGunsFor(type, before)) parts.push(`${chase} canons de chasse à la proue`);
  return parts.join(', ');
}

/**
 * Niveaux tirés au hasard pour un ennemi : plus la menace (0..1) est haute, plus il est amélioré ; chaque allongement
 * a sa chance (`extensionChance` × la menace) et ouvre ses niveaux en plus.
 */
export function randomLevels(type: ShipType, threat: number, extensionChance = 0): UpgradeLevels {
  const levels = noUpgrades();
  // D'abord les allongements (dans l'ordre) : ils ouvrent des niveaux d'amélioration en plus.
  const extensions = SHIP_TYPES[type].extensions?.length ?? 0;
  while (levels.extension < extensions && Math.random() < threat * extensionChance) levels.extension++;
  // La cale et les filets ne servent à rien chez l'ennemi (et la cale ne doit pas gonfler son butin).
  for (const id of UPGRADE_IDS) {
    if (PEACEFUL.includes(id)) continue;
    const max = maxLevel(type, id, levels);
    while (levels[id] < max && Math.random() < threat * 0.75) levels[id]++;
  }
  return levels;
}
