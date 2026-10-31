import { GuardAI } from '../ai/guardAI';
import { ISLAND_INFO, TERRITORY, type IslandId } from '../config';
import type { IslandState } from '../progression/islandState';
import type { PlayerState } from '../progression/playerState';
import { NAVY, type Guard, type Territory } from '../progression/territory';
import type { Ship } from '../ship/ship';
import { maxRank, SHIP_TYPES, sizeRank, typeOfRank, type ShipType } from '../shipTypes';
import type { EnemySpawner } from '../world/enemySpawner';
import { ISLAND_LIST, land } from '../world/island';
import type { Fleet, FleetMember } from './fleet';
import { rankOf } from './officers';

/** Tendance d'une zone gardée : il gagne du terrain, tient, ou la Marine est trop forte. */
export type GuardTrend = 'up' | 'flat' | 'down';

/** Ce que la page Garde montre d'un navire de garde. */
export interface GuardInfo {
  readonly member: FleetMember;
  radius: number;
  /** Puissance de ce navire seul, et celle de tous les gardes qui couvrent son poste. */
  power: number;
  total: number;
  /** Pression de la Marine sur ce front. */
  pressure: number;
  trend: GuardTrend;
  state: GuardAI['state'] | 'sunk';
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/** Rayon du cercle protégé par un navire de ce type (m). */
export const guardRadius = (type: ShipType) => TERRITORY.guard.radius + TERRITORY.guard.perRank * sizeRank(type);

/** Nom de l'île la plus proche d'un point (messages). */
function nearName(x: number, z: number): string {
  let best = ISLAND_LIST[0];
  for (const i of ISLAND_LIST) if (Math.hypot(x - i.cx, z - i.cz) < Math.hypot(x - best.cx, z - best.cz)) best = i;
  return ISLAND_INFO[best.id].shortName;
}

/**
 * Navires de garde : un navire de ta flotte posté quelque part en mer (Cabine, page Garde) la quitte, navigue jusqu'à
 * son poste et y fait sa ronde, en vrai (`GuardAI`). Sa puissance (type, vie, améliorations, rang ; celle des gardes
 * voisins s'additionne) se mesure à la pression de la Marine sur ce front : plus forte, la Marine ne repousse plus la
 * frontière dans son cercle ; nettement plus forte, il gagne du terrain ; plus faible, il demande de l'aide. Quand tu
 * passes près de lui, une escadre de la Marine vient parfois l'attaquer. Coulé, il repart du port le plus proche et
 * reprend son poste. On ne le reprend dans la flotte que s'il y a une place libre.
 */
export class Guards {
  private readonly ais = new Map<FleetMember, GuardAI>();
  private readonly infos = new Map<FleetMember, GuardInfo>();
  private readonly helpAt = new Map<FleetMember, number>();
  private readonly attackIn = new Map<FleetMember, number>();
  /** Ce qui protège des poussées de la Marine : le bateau piloté (case 0), puis les gardes assez forts. */
  private readonly shieldList: Guard[] = [{ x: 0, z: 0, radius: TERRITORY.push.guard }];
  private stepTimer = 0;
  private clock = 0;

  constructor(
    private readonly fleet: Fleet,
    private readonly state: PlayerState,
    private readonly territory: Territory,
    private readonly islands: Record<IslandId, IslandState>,
    private readonly spawner: EnemySpawner,
    private readonly ships: readonly Ship[],
    private readonly events: { help(text: string): void; say(text: string): void },
  ) {}

  /** Les navires de garde. */
  get members(): FleetMember[] {
    return this.fleet.members.filter((m) => m.guard);
  }

  /** Peut-on poster ce navire ? (pas celui qu'on pilote, ni un navire en commerce) */
  canDeploy(member: FleetMember): boolean {
    return member !== this.fleet.controlled && !member.trade;
  }

  /** Poste (ou déplace) un navire de garde en (x, z). */
  deploy(member: FleetMember, x: number, z: number): boolean {
    if (!this.canDeploy(member)) return false;
    const fresh = !member.guard;
    if (!this.fleet.setGuard(member, { x, z })) return false;
    this.events.say(`${member.name} ${fresh ? 'part monter la garde' : 'change de poste'} près de ${nearName(x, z)}`);
    return true;
  }

  /** Une place libre dans la flotte pour reprendre un garde ? */
  get fleetHasRoom(): boolean {
    return this.fleet.hand.length < this.state.slots;
  }

  /** Reprend un garde dans la flotte (il la rejoint en naviguant), s'il reste une place. */
  recall(member: FleetMember): boolean {
    if (!member.guard || !this.fleetHasRoom) return false;
    this.fleet.setGuard(member, null);
    this.ais.delete(member);
    this.infos.delete(member);
    this.events.say(`${member.name} quitte son poste et rejoint ta flotte`);
    return true;
  }

  /** Ce que la page Garde montre de chaque garde (refait toutes les `TERRITORY.guard.step` s). */
  info(member: FleetMember): GuardInfo | null {
    return this.infos.get(member) ?? null;
  }

  /** Puissance qu'aurait ce navire en garde (page Garde, avant de le poster). */
  powerOf(member: FleetMember): number {
    const g = TERRITORY.guard;
    const ship = member.ship;
    const health = member.inWorld && ship.alive ? ship.health / ship.stats.maxHealth : 0;
    const levels = Object.values(member.levels).reduce((s, v) => s + v, 0);
    return SHIP_TYPES[member.type].threat * health * (1 + g.upgrade * levels + g.rank * rankOf(member.kills));
  }

  /** Pression de la Marine sur un front, en (x, z). */
  pressureAt(x: number, z: number): number {
    const f = TERRITORY.guard.front;
    let islands = 0;
    for (const i of ISLAND_LIST) {
      if (!this.islands[i.id].navyHeld) continue;
      islands += Math.max(0, 1 - Math.hypot(x - i.port.x, z - i.port.z) / f.islandReach);
    }
    return f.base + f.navy * this.territory.fractionAround(x, z, f.radius, NAVY) + f.island * islands;
  }

  /** Le bateau piloté, puis les gardes assez forts pour leur front (liste refaite sur place). */
  shields(leader: Ship): readonly Guard[] {
    const list = this.shieldList;
    list[0].x = leader.position.x;
    list[0].z = leader.position.z;
    let n = 1;
    for (const info of this.infos.values()) {
      const post = info.member.guard;
      if (!post || info.state === 'sunk' || info.total < info.pressure) continue;
      if (n === list.length) list.push({ x: 0, z: 0, radius: 0 });
      list[n].x = post.x;
      list[n].z = post.z;
      list[n].radius = info.radius;
      n++;
    }
    list.length = n;
    return list;
  }

  update(dt: number, leader: Ship) {
    this.clock += dt;
    const guards = this.fleet.members.filter((m) => m.guard && !m.trade);
    for (const m of guards) {
      if (!m.inWorld || !m.ship.alive) continue;
      let ai = this.ais.get(m);
      if (!ai) this.ais.set(m, (ai = new GuardAI(m.ship)));
      ai.update(dt, m.guard!, guardRadius(m.type), this.ships);
    }
    for (const m of this.infos.keys()) if (!m.guard) this.infos.delete(m);
    this.stepTimer += dt;
    if (this.stepTimer < TERRITORY.guard.step) return;
    const step = this.stepTimer;
    this.stepTimer = 0;
    this.measure(guards);
    for (const m of guards) this.step(m, step, leader);
  }

  /** Puissance, pression et tendance de chaque garde. */
  private measure(guards: readonly FleetMember[]) {
    const g = TERRITORY.guard;
    for (const m of guards) {
      const post = m.guard!;
      const info = this.infos.get(m) ?? { member: m, radius: 0, power: 0, total: 0, pressure: 0, trend: 'flat' as GuardTrend, state: 'travel' as GuardInfo['state'] };
      info.radius = guardRadius(m.type);
      info.power = this.powerOf(m);
      info.pressure = this.pressureAt(post.x, post.z);
      info.state = m.inWorld && m.ship.alive ? (this.ais.get(m)?.state ?? 'travel') : 'sunk';
      this.infos.set(m, info);
    }
    for (const info of this.infos.values()) {
      const post = info.member.guard!;
      info.total = 0;
      for (const other of this.infos.values()) {
        const p = other.member.guard!;
        // Seuls les gardes à leur poste (en ronde ou au combat) comptent.
        if (other.state === 'sunk' || other.state === 'travel') continue;
        if (Math.hypot(p.x - post.x, p.z - post.z) <= Math.max(info.radius, other.radius)) info.total += other.power;
      }
      const ratio = info.total / info.pressure;
      const navyLeft = this.territory.fractionAround(post.x, post.z, info.radius, NAVY) > 0;
      info.trend = info.state === 'sunk' || info.state === 'travel' ? 'flat' : ratio < 1 ? 'down' : ratio >= g.conquer && navyLeft ? 'up' : 'flat';
    }
  }

  /** Conquête, appels à l'aide et attaques de la Marine pour un garde. */
  private step(m: FleetMember, dt: number, leader: Ship) {
    const g = TERRITORY.guard;
    const info = this.infos.get(m);
    const post = m.guard!;
    if (!info || info.state === 'sunk') return;
    const ratio = info.total / info.pressure;
    if (info.state !== 'travel' && ratio >= g.conquer) {
      const lead = Math.min(1, (ratio - g.conquer) / g.conquer + 0.25);
      this.territory.conquer(post.x, post.z, info.radius, TERRITORY.presence.rate * g.conquerRate * lead * dt);
    }
    const fighting = info.state === 'fight';
    if ((ratio < 1 || fighting) && info.state !== 'travel' && this.clock >= (this.helpAt.get(m) ?? 0)) {
      this.helpAt.set(m, this.clock + g.helpInterval);
      const where = nearName(post.x, post.z);
      this.events.help(fighting ? `⚔ ${m.name} est attaqué au large de ${where} et demande de l'aide !` : `🛟 ${m.name} demande de l'aide : la Marine est trop forte au large de ${where}`);
    }
    // Une escadre vient l'attaquer quand tu passes près de lui.
    const a = g.attack;
    let timer = (this.attackIn.get(m) ?? rand(a.interval)) - dt;
    if (timer <= 0 && m.ship.distanceTo(leader) < a.range && info.pressure >= a.minPressure && !fighting) {
      this.attack(m, info.pressure);
      timer = rand(a.interval);
    }
    this.attackIn.set(m, Math.max(0, timer));
  }

  private attack(m: FleetMember, pressure: number) {
    const a = TERRITORY.guard.attack;
    const budget = pressure * a.strength;
    const rank = (r: number) => Math.max(1, Math.min(maxRank(), Math.round(r)));
    const types = budget > a.pairFrom ? [typeOfRank(rank(budget * 0.6)), typeOfRank(rank(budget * 0.4))] : [typeOfRank(rank(budget))];
    const angle = Math.random() * Math.PI * 2;
    const d = rand(a.distance);
    const p = land.keepOffshore(m.ship.position.x + Math.sin(angle) * d, m.ship.position.z + Math.cos(angle) * d, a.clearance);
    this.spawner.spawnSquadron(types, p.x, p.z, angle + Math.PI, null, {}, false);
  }
}
