import { LAND, MERCHANT, PIRATES, SAIL } from '../config';
import type { Ship } from '../ship/ship';
import type { FishSchool } from '../world/fishSchools';
import { harbors } from '../world/harbors';
import { ISLAND_LIST, land, type Island } from '../world/island';
import type { Crate } from '../world/loot';
import { bayMouth, seaRoute, Wander, type Waypoint } from './seaRoute';
import { bearingTo, broadside, nearest, steerTo } from './steering';

/** À moins de cette distance d'une étape de sa route, le pirate passe à la suivante (m). */
const WAYPOINT_REACHED = 45;
/** Il est arrivé à son mouillage à moins de cette distance (m). */
const MOORED = 20;
/** Il ralentit à moins de cette distance de son mouillage (m). */
const APPROACH = 80;
/** Il s'arrête pour pêcher à moins de cette distance du banc (m). */
const FISHING_SPOT = 25;
/** Tirages pour trouver un mouillage à l'écart des autres navires. */
const MOORING_TRIES = 12;
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const distance = (a: Waypoint, b: Waypoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** Une activité en route : pêche sur un banc, patrouille autour d'un point, chasse d'un navire de la Marine. */
type Activity =
  | { kind: 'fish'; school: FishSchool; time: number }
  | { kind: 'patrol'; x: number; z: number; time: number; heading: number; turn: number }
  | { kind: 'hunt'; target: Ship; time: number };

/** Places de mouillage déjà promises à un pirate (il n'y est peut-être pas encore arrivé). */
const reserved = new Map<Ship, Waypoint>();

/**
 * Mouillage devant le port d'une île : un point au hasard sur un côté de l'axe de la crique (hors du chemin de la
 * flotte), à l'écart du rivage, des autres navires et des places promises aux autres pirates. Il est promis à `self`.
 */
export function mooringSpot(island: Island, ships: readonly Ship[], self: Ship): Waypoint {
  const m = PIRATES.mooring;
  let spot: Waypoint = island.port;
  const crowded = (p: Waypoint) =>
    ships.some((s) => s !== self && s.alive && distance(s.position, p) < m.spacing) ||
    [...reserved].some(([owner, r]) => owner !== self && distance(r, p) < m.spacing);
  for (let i = 0; i < MOORING_TRIES; i++) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const p = island.pointAt(island.def.bay.angle + side * rand(m.angle), -rand(m.offing));
    spot = land.keepOffshore(p.x, p.z, m.shoreClearance);
    if (!crowded(spot)) break;
  }
  reserved.set(self, spot);
  return spot;
}

/** Libère la place de mouillage promise à un navire. */
export function releaseMooring(ship: Ship) {
  reserved.delete(ship);
}

/**
 * Pilote d'un pirate allié indépendant : il va d'un port à l'autre par une route chaque fois différente (sortie et
 * entrée de crique au hasard, détours, cap qui ondule), mouille à une place libre, y fait escale, puis repart. En
 * route, il s'arrête parfois pêcher sur un banc, patrouille un moment ou part chasser un navire de la Marine repéré.
 * Il attaque un ennemi proche ; très abîmé, il fuit vers le port le plus proche et ne repart qu'une fois réparé.
 * Hors combat, il ramasse le butin qui flotte près de lui.
 */
export class PirateAI {
  private route: Waypoint[] = [];
  private index = 0;
  private stay: number;
  private side = 1;
  private fleeing = false;
  /** Entrée de la crique visée : la route y est recalculée après une activité. */
  private entry: Waypoint | null = null;
  private activity: Activity | null = null;
  private activityTimer = rand(PIRATES.activity.interval);
  private readonly wander = new Wander();

  constructor(
    private readonly ship: Ship,
    private port: Island,
  ) {
    this.stay = rand(PIRATES.stay);
  }

  /** En pleine mer (pirate repris d'une armada de mission) : il met le cap sur le port ouvert le plus proche. */
  headForPort(ships: readonly Ship[]) {
    this.port = this.nearestPort();
    this.sailTo(this.port, ships);
  }

  /** Le pirate quitte la mer (coulé) : sa place au mouillage se libère. */
  dispose() {
    releaseMooring(this.ship);
  }

  update(dt: number, ships: readonly Ship[], crates: readonly Crate[], schools: readonly FishSchool[]) {
    const ship = this.ship;
    const health = ship.health / ship.stats.maxHealth;
    if (health < PIRATES.fleeHealth && !this.fleeing) {
      this.fleeing = true;
      this.activity = null;
      this.sailTo(this.nearestPort(), ships);
    }
    if (this.fleeing && health >= PIRATES.rallyHealth) this.fleeing = false;

    const enemy = this.fleeing ? null : nearest(ship, ships, PIRATES.engageRange);
    if (enemy) {
      this.side = broadside(ship, enemy, this.side, SAIL.half);
      return;
    }
    const loot = this.fleeing ? null : this.nearestCrate(crates);
    if (loot) {
      steerTo(ship, bearingTo(ship, loot.x, loot.z), SAIL.half);
      return;
    }
    if (this.index >= this.route.length) {
      // Au mouillage : il attend la fin de l'escale (et d'être réparé s'il a fui), puis repart vers une autre île.
      steerTo(ship, ship.heading, 0);
      this.stay -= dt;
      if (this.stay <= 0 && !this.fleeing) this.sailTo(this.otherPort(), ships);
      return;
    }
    if (!this.activity && !this.fleeing) this.activity = this.pickActivity(dt, ships, schools);
    if (this.activity) {
      if (this.runActivity(dt, schools)) return;
      this.activity = null;
      this.replan();
    }
    this.travel(dt, ships);
  }

  /** Suit sa route ; en arrivant à l'entrée de la crique, il choisit une place libre au mouillage. */
  private travel(dt: number, ships: readonly Ship[]) {
    const ship = this.ship;
    const p = this.route[this.index];
    const d = distance(ship.position, p);
    const last = this.index === this.route.length - 1;
    if (d < (last ? MOORED : WAYPOINT_REACHED)) {
      this.index++;
      if (this.index === this.route.length - 1) this.route[this.index] = mooringSpot(this.port, ships, ship);
      if (this.index >= this.route.length) this.stay = rand(PIRATES.stay);
      return;
    }
    // Le cap ondule en route ; on ralentit à l'approche du mouillage.
    const heading = bearingTo(ship, p.x, p.z) + (last ? 0 : this.wander.update(dt));
    steerTo(ship, heading, last && d < APPROACH ? SAIL.half * 0.6 : PIRATES.sail);
  }

  /** De temps en temps, loin des ports : chasse, pêche ou patrouille (ou rien), selon les chances de chacune. */
  private pickActivity(dt: number, ships: readonly Ship[], schools: readonly FishSchool[]): Activity | null {
    const a = PIRATES.activity;
    this.activityTimer -= dt;
    if (this.activityTimer > 0) return null;
    this.activityTimer = rand(a.interval);
    const p = this.ship.position;
    if (ISLAND_LIST.some((i) => distance(i.port, p) < LAND.portClearance)) return null;
    const roll = Math.random();
    if (roll < a.hunt.chance) {
      const target = nearest(this.ship, ships, a.hunt.range);
      return target ? { kind: 'hunt', target, time: a.hunt.time } : null;
    }
    if (roll < a.hunt.chance + a.fish.chance) {
      const school = schools.filter((s) => s.fish > 0 && distance(s, p) < a.fish.range).sort((s, t) => distance(s, p) - distance(t, p))[0];
      return school ? { kind: 'fish', school, time: rand(a.fish.time) } : null;
    }
    if (roll < a.hunt.chance + a.fish.chance + a.patrol.chance) return { kind: 'patrol', x: p.x, z: p.z, time: rand(a.patrol.time), heading: this.ship.heading, turn: 0 };
    return null;
  }

  /** Mène l'activité en cours ; renvoie false quand elle est finie. */
  private runActivity(dt: number, schools: readonly FishSchool[]): boolean {
    const a = this.activity!;
    const ship = this.ship;
    switch (a.kind) {
      case 'hunt': {
        // Une fois à portée, le combat ordinaire prend le relais.
        a.time -= dt;
        if (a.time <= 0 || !a.target.alive || ship.distanceTo(a.target) > PIRATES.activity.hunt.range * 1.3) return false;
        steerTo(ship, bearingTo(ship, a.target.position.x, a.target.position.z), SAIL.full);
        return true;
      }
      case 'fish': {
        if (!schools.includes(a.school) || a.school.fish <= 0) return false;
        if (distance(ship.position, a.school) > FISHING_SPOT) {
          steerTo(ship, bearingTo(ship, a.school.x, a.school.z), SAIL.half);
          return true;
        }
        // Arrêté sur le banc, le temps de pêcher.
        steerTo(ship, ship.heading, 0);
        a.time -= dt;
        return a.time > 0;
      }
      case 'patrol': {
        // Il croise autour du point de départ, vers un point au hasard renouvelé de temps en temps.
        const p = PIRATES.activity.patrol;
        a.time -= dt;
        a.turn -= dt;
        if (a.turn <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const r = Math.random() * p.radius;
          a.heading = bearingTo(ship, a.x + Math.sin(angle) * r, a.z + Math.cos(angle) * r);
          a.turn = rand(p.turn);
        }
        steerTo(ship, a.heading, SAIL.half);
        return a.time > 0;
      }
    }
  }

  /** Nouvelle route : sortie de la crique où il se trouve (s'il y est), détours en mer, entrée de l'autre crique, mouillage. */
  private sailTo(island: Island, ships: readonly Ship[]) {
    const here = this.ship.position;
    const route: Waypoint[] = [];
    const inBay = distance(here, this.port.port) < MERCHANT.offing;
    if (island !== this.port || !inBay) {
      const from = inBay ? bayMouth(this.port) : here;
      if (inBay) route.push(from);
      this.entry = bayMouth(island);
      route.push(...seaRoute(from, this.entry));
    } else {
      this.entry = null;
    }
    route.push(mooringSpot(island, ships, this.ship));
    this.port = island;
    this.route = route;
    this.index = 0;
  }

  /** Après une activité : nouvelle route d'ici jusqu'à l'entrée de la crique visée, puis le mouillage. */
  private replan() {
    const mooring = this.route[this.route.length - 1];
    this.route = [...(this.entry ? seaRoute(this.ship.position, this.entry) : []), mooring];
    this.index = 0;
  }

  private otherPort(): Island {
    const others = ISLAND_LIST.filter((i) => i !== this.port && harbors.isOpen(i.id));
    return others[Math.floor(Math.random() * others.length)] ?? this.port;
  }

  private nearestPort(): Island {
    const p = this.ship.position;
    return harbors.open().reduce((best, i) => (distance(i.port, p) < distance(best.port, p) ? i : best), this.port);
  }

  private nearestCrate(crates: readonly Crate[]): Waypoint | null {
    let best: Waypoint | null = null;
    let bestDistance = PIRATES.lootRange;
    for (const { mesh } of crates) {
      const d = distance(mesh.position, this.ship.position);
      if (d < bestDistance) {
        best = mesh.position;
        bestDistance = d;
      }
    }
    return best;
  }
}
