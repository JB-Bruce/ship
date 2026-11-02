import { MerchantAI } from '../ai/merchantAI';
import { mooringSpot, releaseMooring } from '../ai/pirateAI';
import { bayMouth, seaRoute } from '../ai/seaRoute';
import { steerTo } from '../ai/steering';
import { FISHING, ISLAND_INFO, TRADE_ROUTES, type IslandId } from '../config';
import { goodText } from '../progression/goods';
import type { IslandState } from '../progression/islandState';
import type { Ledger } from '../progression/ledger';
import { catchFactor } from '../progression/upgrades';
import type { Ship } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import type { FishSchool, FishSchools } from '../world/fishSchools';
import { islandById } from '../world/island';
import type { FleetMember } from './fleet';
import { freeSpace, store } from './holds';

/** Où en est un navire de pêche entre deux escales : son banc, son prochain poisson, le chemin du retour. */
export interface FishingTrip {
  school: FishSchool | null;
  /** Temps avant le prochain poisson (s). */
  timer: number;
  /** En route vers son port d'attache. */
  homeward: boolean;
  /** Aucun banc à portée à la dernière escale : il attend au port. */
  idle?: boolean;
}

/** Ce qu'un navire de pêche partage avec les routes commerciales (voir `TradeRoutes`). */
export interface FishingRunner {
  readonly member: FleetMember;
  phase: 'docked' | 'sailing' | 'fishing' | 'lost';
  ai: MerchantAI | null;
  stay: number;
  trip: FishingTrip | null;
}

const catchInterval = (m: FleetMember) => FISHING.catchInterval * catchFactor(m.type, m.levels);
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Navires de pêche : confiés au Comptoir comme une route, ils prennent un emplacement de leur port d'attache et font
 * l'aller-retour entre lui et le banc le plus proche (à moins de `TRADE_ROUTES.fishing.range`). Au banc, presque à
 * l'arrêt, ils pêchent comme ta flotte (un poisson toutes les `FISHING.catchInterval` s × filets) jusqu'à cale pleine,
 * puis rentrent vendre le poisson au port d'attache : l'or va dans la réserve de l'île. Sans banc à portée, ils
 * attendent au port. Coulés, ils perdent leur pêche et réapparaissent chez eux.
 */
export class FishingRuns {
  /** Les bancs du monde (posés par `Game`). */
  schools: FishSchools | null = null;

  constructor(
    private readonly islands: Record<IslandId, IslandState>,
    private readonly ledger: Ledger,
    private readonly ships: readonly Ship[],
    private readonly say: (text: string) => void,
  ) {}

  /** Une image d'un navire de pêche à flot (arrêté de loin, `trade.returning`, il ne repart plus du port). */
  update(r: FishingRunner, home: IslandId, dt: number) {
    const m = r.member;
    const trip = (r.trip ??= { school: null, timer: catchInterval(m), homeward: false });
    if (r.phase === 'docked') {
      steerTo(m.ship, m.ship.heading, 0);
      r.stay -= dt;
      if (r.stay > 0) return;
      this.sell(m, home);
      if (m.trade?.returning) return;
      if (freeSpace(m) <= 0) {
        r.stay = TRADE_ROUTES.fishing.retry;
        return;
      }
      trip.idle = !this.goFish(r, bayMouth(islandById(home)), home);
      if (trip.idle) r.stay = TRADE_ROUTES.fishing.retry;
      return;
    }
    if (r.phase === 'sailing') {
      // En route vers un banc qui plonge : il en cherche un autre, ou rentre.
      if (m.trade?.returning && !trip.homeward) return this.goHome(r, home);
      if (!trip.homeward && (!trip.school || trip.school.diving) && !this.retarget(r, home)) return;
      if (!r.ai?.update(dt)) return;
      if (trip.homeward) {
        r.phase = 'docked';
        r.stay = rand(TRADE_ROUTES.stay);
        trip.homeward = false;
      } else r.phase = 'fishing';
      return;
    }
    // Au banc : presque à l'arrêt, il remonte un poisson de temps en temps.
    const school = trip.school;
    steerTo(m.ship, m.ship.heading, 0);
    if (m.trade?.returning || !school || school.diving || freeSpace(m) <= 0) {
      if (!m.trade?.returning && freeSpace(m) > 0 && this.retarget(r, home)) return;
      this.goHome(r, home);
      return;
    }
    trip.timer -= dt;
    if (trip.timer > 0) return;
    trip.timer += catchInterval(m);
    if (store(m, 'fish', 1)) {
      school.fish--;
      this.ledger.fishCaught++;
    }
  }

  /** Où en est un navire de pêche, en quelques mots. */
  status(r: FishingRunner, home: IslandId): string {
    const here = ISLAND_INFO[home].shortName;
    const fish = goodText('fish', r.member.cargo.fish);
    if (r.phase === 'docked') return r.trip?.idle ? `À quai à ${here} : aucun banc à portée` : `À quai à ${here}`;
    if (r.phase === 'fishing') return `Pêche au banc · ${fish}`;
    const where = r.trip?.homeward ? `Rentre à ${here}` : 'En route vers un banc';
    return `${where} (${fish}) · ${Math.round(r.ai?.remaining ?? 0)} m`;
  }

  /** Repris d'une sauvegarde en mer : il rentre chez lui. */
  restore(r: FishingRunner, home: IslandId) {
    if (r.phase === 'docked' || r.phase === 'lost') return;
    this.goHome(r, home);
  }

  /** Coulé : sa pêche est perdue avec sa cale. */
  lost(r: FishingRunner) {
    if (r.trip) r.trip = { school: null, timer: catchInterval(r.member), homeward: false };
  }

  /** Choisit le banc le plus proche du port d'attache ; faux s'il n'y en a aucun à portée. */
  private goFish(r: FishingRunner, from: { x: number; z: number }, home: IslandId): boolean {
    const port = islandById(home).port;
    const school = this.schools?.nearest(port.x, port.z, TRADE_ROUTES.fishing.range) ?? null;
    if (!school || school.fish <= 0) return false;
    r.trip!.school = school;
    r.trip!.homeward = false;
    r.ai = new MerchantAI(r.member.ship, [from, ...this.routeTo(from, school)], TRADE_ROUTES.sail);
    r.phase = 'sailing';
    return true;
  }

  /** Un autre banc à portée, depuis là où il est ; sinon il rentre. Faux s'il rentre. */
  private retarget(r: FishingRunner, home: IslandId): boolean {
    const here = { x: r.member.ship.position.x, z: r.member.ship.position.z };
    if (this.goFish(r, here, home)) return true;
    this.goHome(r, home);
    return false;
  }

  private goHome(r: FishingRunner, home: IslandId) {
    const island = islandById(home);
    const here = { x: r.member.ship.position.x, z: r.member.ship.position.z };
    releaseMooring(r.member.ship);
    r.ai = new MerchantAI(r.member.ship, [...seaRoute(here, bayMouth(island)), mooringSpot(island, this.ships, r.member.ship)], TRADE_ROUTES.sail);
    r.phase = 'sailing';
    r.trip!.homeward = true;
    r.trip!.school = null;
  }

  /** Route jusqu'à un poste au bord du banc, tiré au hasard sur son cercle. */
  private routeTo(from: { x: number; z: number }, school: FishSchool) {
    const angle = Math.random() * Math.PI * 2;
    const spot = { x: school.x + Math.sin(angle) * FISHING.stationRadius, z: school.z + Math.cos(angle) * FISHING.stationRadius };
    return seaRoute(from, spot);
  }

  /** À quai : vend le poisson au port d'attache ; l'or va dans la réserve de l'île. */
  sell(m: FleetMember, home: IslandId) {
    const n = m.cargo.fish;
    const price = this.islands[home].price('fish').sell;
    if (n <= 0 || price === null) return;
    m.cargo.fish = 0;
    const gold = Math.round(n * price * (1 + (SHIP_TYPES[m.type].tradeBonus ?? 0)));
    this.islands[home].addSpoils({ gold, wood: 0 });
    this.ledger.goodsSold += n;
    this.ledger.tradeProfit += gold;
    this.say(`🐟 ${m.name} vend ${goodText('fish', n)} à ${ISLAND_INFO[home].shortName} : +${gold} or dans la réserve`);
  }
}
