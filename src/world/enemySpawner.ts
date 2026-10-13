import type * as THREE from 'three';
import { EnemyAI, type EnemyAIOptions, type EnemyGroup, type FlotillaSlot } from '../ai/enemyAI';
import { BOSSES, DAY_NIGHT, ELITE_LIVERY, ENEMIES, LAND, type BossId, type EncounterStage } from '../config';
import type { ContractOptions } from '../progression/contracts';
import { deriveStats, maxLevels, randomLevels, totalLevels } from '../progression/upgrades';
import { createShip, Ship } from '../ship/ship';
import { SHIP_SIZE_ORDER, SHIP_TYPES, sizeRank, type ShipType } from '../shipTypes';
import { wrapAngle } from '../utils/math';
import { ISLAND_LIST, land } from './island';
import { conditions } from './weather';

export interface Enemy {
  ship: Ship;
  ai: EnemyAI;
  /** Multiplicateur de butin (gros navire, améliorations, élite). */
  lootFactor: number;
  /** Navire d'élite (couronne sur la grand-voile, plus fort). */
  elite: boolean;
  /** Boss (La Veuve Noire, Le Spectre), ou null. */
  boss: BossId | null;
  /** Ennemi de mission : il ne disparaît pas quand le joueur s'éloigne. */
  persistent: boolean;
  /** Nom propre (capitaine d'une mission de chasse), ou null. */
  name: string | null;
  /** Coulé par un allié hors de ta flotte (pirate) : ne compte pas dans tes victoires. */
  uncounted?: boolean;
}

/** Du plus petit au plus gros : un chef de flottille est pris un cran au-dessus de ses suiveurs. */
const SIZE_ORDER = SHIP_SIZE_ORDER;

/** Ta flotte, à laquelle s'adaptent les ennemis ordinaires (pas ceux des missions ni le boss). */
export interface FleetPower {
  /** Navires dans ta flotte. */
  ships: number;
  /** Ton plus gros navire. */
  best: ShipType;
}
/** Distance minimale au rivage d'un navire de flottille placé autour du point d'apparition (m). */
const FLOTILLA_SHORE_CLEARANCE = 60;

const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Fait apparaître des ennemis autour du bateau piloté (hors de vue mais sur le radar), seuls ou en flottilles,
 * de plus en plus nombreux et forts avec les victoires ; retire ceux qui sont trop loin et ceux qui ont coulé.
 * Tient à jour la liste `ships` partagée (flotte du joueur + ennemis).
 */
export class EnemySpawner {
  readonly enemies: Enemy[] = [];
  /** Ennemis coulés depuis le début : plus il y en a, plus les nouveaux sont nombreux, améliorés et souvent d'élite. */
  kills = 0;
  private timer = ENEMIES.firstSpawnDelay;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ships: Ship[],
    private readonly onSunk: (enemy: Enemy) => void,
    private readonly fleetPower: () => FleetPower,
  ) {}

  /** Nombre max d'ennemis en même temps, selon les victoires. */
  /** Palier de rencontres atteint (nombre de groupes, taille, délai), selon les victoires. */
  private get encounter(): EncounterStage {
    const list = ENEMIES.encounters;
    let stage = list[0];
    for (const e of list) if (this.kills >= e.fromKills) stage = e;
    return stage;
  }

  /** Décisions des IA. Le déplacement des bateaux est fait ensuite par Ship.update. */
  update(dt: number, center: Ship) {
    // Près d'une côte, et la nuit : le temps avant la prochaine apparition s'écoule plus lentement. Près d'une côte,
    // la place est aussi plafonnée.
    const near = ENEMIES.nearIsland;
    const closeness = Math.max(0, Math.min(1, 1 - land.sdf(center.position.x, center.position.z) / near.radius));
    const room = this.ordinaryGroups() >= this.encounter.groups ? 0 : closeness > 0 ? near.maxAlive - this.ordinaryCount() : Infinity;
    if (room > 0) {
      const night = 1 + (DAY_NIGHT.encounterSlowdown - 1) * conditions.night;
      this.timer -= dt / ((1 + (near.slowdown - 1) * closeness) * night);
      if (this.timer <= 0) this.timer = this.spawn(center, room) ? this.nextInterval() : 2;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.ship.sunk) {
        if (!enemy.uncounted) this.kills++;
        this.onSunk(enemy);
        this.remove(i);
      } else if (!enemy.persistent && enemy.ship.distanceTo(center) > ENEMIES.despawnDistance) {
        this.remove(i);
      } else if (enemy.ship.alive) {
        enemy.ai.update(dt, this.ships);
      }
    }
  }

  /** Ce que les contrats de la taverne peuvent demander : les types qui apparaissent, et si les élites sont là. */
  contractOptions(): Omit<ContractOptions, 'level'> {
    const weights = this.stage().weights as Partial<Record<ShipType, number>>;
    return { types: SIZE_ORDER.filter((t) => (weights[t] ?? 0) > 0), elites: this.kills >= ENEMIES.elite.fromKills };
  }

  /** Délai avant la prochaine apparition : il raccourcit avec les victoires. */
  /** Ennemi ordinaire à flot (ni escadre de mission, ni boss). */
  private ordinary(e: Enemy): boolean {
    return !e.persistent && !e.boss && e.ship.alive;
  }

  private ordinaryCount(): number {
    let count = 0;
    for (const e of this.enemies) if (this.ordinary(e)) count++;
    return count;
  }

  /** Groupes ordinaires à flot : chaque navire seul, et chaque flottille comptée une fois (par son premier membre à flot). */
  private ordinaryGroups(): number {
    let count = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!this.ordinary(e)) continue;
      const group = e.ai.group;
      let counted = false;
      for (let j = 0; j < i && group && !counted; j++) counted = this.enemies[j].ai.group === group && this.ordinary(this.enemies[j]);
      if (!counted) count++;
    }
    return count;
  }

  private nextInterval(): number {
    const [min, max] = this.encounter.interval;
    return min + Math.random() * (max - min);
  }

  /**
   * Fait surgir un boss à la limite de la visibilité, cap sur le bateau piloté.
   * Renvoie null si aucun endroit valable n'a été trouvé (trop près de la côte ou du port).
   */
  spawnBoss(id: BossId, center: Ship): Enemy | null {
    const def = BOSSES[id];
    const angle = this.findSpawnAngle(center, def.spawnDistance);
    if (angle === null) return null;
    const levels = maxLevels(def.type);
    const ship = createShip(def.type, 'enemy', levels, def.livery);
    // Base du navire du joueur, et non la version ennemie affaiblie.
    ship.applyStats(deriveStats(def.type, SHIP_TYPES[def.type].stats, levels));
    strengthen(ship, def);
    ship.position.set(center.position.x + Math.sin(angle) * def.spawnDistance, 0, center.position.z + Math.cos(angle) * def.spawnDistance);
    ship.heading = wrapAngle(angle + Math.PI);
    const ai = new EnemyAI(ship, null, null, { relentless: true, harass: def.tactic === 'harass' });
    const enemy: Enemy = { ship, ai, lootFactor: SHIP_TYPES[def.type].lootFactor * def.loot, elite: false, boss: id, persistent: false, name: null };
    this.track(enemy);
    return enemy;
  }

  /**
   * Escadre d'une mission (chasse, siège, embuscade) : `types[0]` est le chef, d'élite (nommé ou non), les autres le
   * suivent en V, autour de (x, z). Elle ne disparaît pas quand le joueur s'éloigne. `ai` : comportement commun.
   */
  spawnSquadron(types: readonly ShipType[], x: number, z: number, heading: number, name: string | null, ai: EnemyAIOptions): Enemy[] {
    const size = types.length;
    const leader = this.add(types[0], x, z, heading, true, null, null, ai);
    const group: EnemyGroup = { leader: leader.ship, alerted: false };
    leader.ai = new EnemyAI(leader.ship, group, null, ai);
    leader.persistent = true;
    leader.name = name;
    const squadron = [leader];
    const s = ENEMIES.flotilla.spacing;
    for (let k = 1; k < size; k++) {
      const rank = Math.ceil(k / 2);
      const slot: FlotillaSlot = { side: (k % 2 === 1 ? 1 : -1) * s * 0.8 * rank, back: s * rank };
      const p = land.keepOffshore(x - Math.sin(heading) * slot.back + Math.cos(heading) * slot.side, z - Math.cos(heading) * slot.back - Math.sin(heading) * slot.side, FLOTILLA_SHORE_CLEARANCE);
      const follower = this.add(types[k], p.x, p.z, heading, Math.random() < this.eliteChance(), group, slot, ai);
      follower.persistent = true;
      squadron.push(follower);
    }
    return squadron;
  }

  /** Retire un ennemi encore à flot (le boss qui disparaît dans la brume). */
  discard(enemy: Enemy) {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.remove(i);
  }

  /** Fait apparaître un ennemi ou une flottille. Renvoie false si aucun endroit valable n'a été trouvé. */
  /** `room` : nombre de navires qui peuvent encore apparaître (plafond près des îles, sinon Infinity). */
  private spawn(center: Ship, room: number): boolean {
    const angle = this.findSpawnAngle(center, ENEMIES.spawnDistance);
    if (angle === null) return false;
    const x = center.position.x + Math.sin(angle) * ENEMIES.spawnDistance;
    const z = center.position.z + Math.cos(angle) * ENEMIES.spawnDistance;
    // Cap vers la zone du joueur, à ±45° près : il croisera sa route.
    const heading = wrapAngle(angle + Math.PI + (Math.random() - 0.5) * (Math.PI / 2));
    // Jamais plus nombreux que ta flotte + ENEMIES.fleetMargin, ni plus gros que ton plus gros navire + 1 cran.
    const power = this.fleetPower();
    const size = Math.min(randInt(this.encounter.size), room, Math.max(1, power.ships) + ENEMIES.fleetMargin);
    const largest = SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, sizeRank(power.best) + 1)];
    const cap = (type: ShipType) => (sizeRank(type) > sizeRank(largest) ? largest : type);

    // Types : les suiveurs tirés selon la composition du moment ; le chef un cran au-dessus (grosse flottille).
    const types = Array.from({ length: size }, () => cap(this.pickType()));
    if (size > 1 && this.kills >= ENEMIES.flotilla.bigFromKills) types[0] = cap(this.biggerType(types));
    // Un seul navire plus gros que ton plus gros à la fois sur la carte (le chef d'abord) : les autres prennent ta taille.
    if (sizeRank(largest) > sizeRank(power.best)) {
      let allowed = this.enemies.some((e) => e.ship.alive && e.ship.type === largest) ? 0 : 1;
      for (let k = 0; k < types.length; k++) {
        if (types[k] !== largest) continue;
        if (allowed > 0) allowed--;
        else types[k] = power.best;
      }
    }

    const chance = this.eliteChance();
    const leader = this.add(types[0], x, z, heading, Math.random() < chance * (size > 1 ? ENEMIES.elite.leaderBonus : 1), null, null);
    if (size === 1) return true;
    const group: EnemyGroup = { leader: leader.ship, alerted: false };
    leader.ai = new EnemyAI(leader.ship, group);
    const s = ENEMIES.flotilla.spacing;
    for (let k = 1; k < size; k++) {
      // En V derrière le chef, un bord puis l'autre.
      const rank = Math.ceil(k / 2);
      const slot: FlotillaSlot = { side: (k % 2 === 1 ? 1 : -1) * s * 0.8 * rank, back: s * rank };
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const sx = x - fx * slot.back + fz * slot.side;
      const sz = z - fz * slot.back - fx * slot.side;
      if (land.sdf(sx, sz) < FLOTILLA_SHORE_CLEARANCE) continue;
      this.add(types[k], sx, sz, heading, Math.random() < chance, group, slot);
    }
    return true;
  }

  /** Crée un ennemi (d'élite ou non) et l'ajoute au monde. */
  /**
   * Un allié passe à l'ennemi (trahison) : copie exacte (type, caractéristiques, améliorations, livrée, équipage), à
   * sa place et dans son mouvement ; seul le camp change. C'est un ennemi ordinaire : il patrouille, n'attaque que s'il
   * te repère, compte dans les rencontres, et coulé, c'est une victoire comme une autre. L'original reste à retirer.
   */
  adopt(source: Ship): Enemy {
    const ship = new Ship(source.type, structuredClone(source.stats), 'enemy', source.livery);
    ship.modifiers = structuredClone(source.modifiers);
    ship.guns = { ...source.guns };
    ship.crewColors = source.crewColors;
    ship.applyLooks(source.levels);
    ship.dressing.applyGunLook(ship.guns);
    ship.copyMotion(source);
    const lootFactor = SHIP_TYPES[source.type].lootFactor * (1 + totalLevels(source.levels) * ENEMIES.lootPerUpgradeLevel);
    const enemy: Enemy = { ship, ai: new EnemyAI(ship, null, null), lootFactor, elite: false, boss: null, persistent: false, name: null };
    this.track(enemy);
    return enemy;
  }

  private add(type: ShipType, x: number, z: number, heading: number, elite: boolean, group: EnemyGroup | null, slot: FlotillaSlot | null, ai: EnemyAIOptions = {}): Enemy {
    // Menace : de 0 (début de partie) à 1 (après ENEMIES.killsForFullThreat victoires).
    const threat = Math.min(1, this.kills / ENEMIES.killsForFullThreat);
    const levels = randomLevels(type, threat, ENEMIES.extensionChance);
    const ship = createShip(type, 'enemy', levels, elite ? ELITE_LIVERY : undefined);
    if (elite) strengthen(ship, ENEMIES.elite);
    ship.position.set(x, 0, z);
    ship.heading = heading;
    const lootFactor = SHIP_TYPES[type].lootFactor * (1 + totalLevels(levels) * ENEMIES.lootPerUpgradeLevel) * (elite ? ENEMIES.elite.loot : 1);
    const enemy: Enemy = { ship, ai: new EnemyAI(ship, group, slot, ai), lootFactor, elite, boss: null, persistent: false, name: null };
    this.track(enemy);
    return enemy;
  }

  private track(enemy: Enemy) {
    this.enemies.push(enemy);
    this.ships.push(enemy.ship);
    this.scene.add(enemy.ship.model.root);
  }

  /** Chance qu'un nouvel ennemi soit d'élite : nulle au début, puis de plus en plus fréquente. */
  private eliteChance(): number {
    const e = ENEMIES.elite;
    return Math.min(e.maxChance, Math.max(0, (this.kills - e.fromKills) * e.chancePerKill));
  }

  /** Une direction d'apparition, à `distance` mètres, loin de la côte et du port, ou null si on n'en trouve pas. */
  private findSpawnAngle(center: Ship, distance: number): number | null {
    for (let tries = 0; tries < 12; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const x = center.position.x + Math.sin(angle) * distance;
      const z = center.position.z + Math.cos(angle) * distance;
      const nearPort = ISLAND_LIST.some((i) => Math.hypot(x - i.port.x, z - i.port.z) < LAND.portClearance);
      if (nearPort || land.sdf(x, z) < LAND.spawnClearance) continue;
      return angle;
    }
    return null;
  }

  /** Tire un type d'ennemi selon la composition correspondant au nombre de victoires. */
  private pickType(): ShipType {
    const entries = Object.entries(this.stage().weights) as [ShipType, number][];
    let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [type, weight] of entries) {
      roll -= weight;
      if (roll < 0) return type;
    }
    return 'rowboat';
  }

  /** Un cran au-dessus du plus gros des types tirés, parmi ceux qui peuvent déjà apparaître. */
  private biggerType(types: readonly ShipType[]): ShipType {
    const weights = this.stage().weights as Partial<Record<ShipType, number>>;
    const biggest = Math.max(...types.map((t) => SIZE_ORDER.indexOf(t)));
    for (let i = Math.min(biggest + 1, SIZE_ORDER.length - 1); i >= 0; i--) {
      if ((weights[SIZE_ORDER[i]] ?? 0) > 0) return SIZE_ORDER[i];
    }
    return types[0];
  }

  private stage() {
    return [...ENEMIES.composition].reverse().find((c) => this.kills >= c.minKills)!;
  }

  private remove(index: number) {
    const [{ ship }] = this.enemies.splice(index, 1);
    this.ships.splice(this.ships.indexOf(ship), 1);
    this.scene.remove(ship.model.root);
    ship.dispose();
  }
}

/** Multiplicateurs d'un ennemi renforcé (élite, boss). */
interface Strength {
  health: number;
  damage: number;
  reload: number;
  spread: number;
  speed?: number;
}

/** Ennemi renforcé (élite, boss) : plus solide, frappe plus fort, recharge plus vite et vise mieux. */
function strengthen(ship: Ship, e: Strength) {
  const s = ship.stats;
  s.maxHealth = Math.round(s.maxHealth * e.health);
  s.maxSpeed *= e.speed ?? 1;
  ship.health = s.maxHealth;
  for (const c of s.deckCannon ? [s.cannon, s.deckCannon] : [s.cannon]) {
    c.damage *= e.damage;
    c.reloadTime *= e.reload;
    c.spread *= e.spread;
    c.rangeError *= e.spread;
  }
}
