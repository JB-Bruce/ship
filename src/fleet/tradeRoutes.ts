import { MerchantAI } from '../ai/merchantAI';
import { mooringSpot, releaseMooring } from '../ai/pirateAI';
import { bayMouth, seaRoute } from '../ai/seaRoute';
import { steerTo } from '../ai/steering';
import { ISLAND_INFO, TRADE_ROUTES, type IslandId } from '../config';
import { GOODS, goodText, type Good } from '../progression/goods';
import type { IslandState } from '../progression/islandState';
import type { Ledger } from '../progression/ledger';
import type { PlayerState } from '../progression/playerState';
import type { Ship } from '../ship/ship';
import { islandById } from '../world/island';
import type { Fleet, FleetMember } from './fleet';
import { freeSpace, store } from './holds';

/** Route confiée à un navire : ses deux ports, la marchandise chargée à chacun pour l'autre (null = à vide), l'étape en cours. */
export interface TradeOrder {
  readonly ports: readonly [IslandId, IslandId];
  readonly goods: readonly [Good | null, Good | null];
  /** Port d'où part l'étape en cours (indice dans `ports`). */
  leg: 0 | 1;
}

interface Runner {
  readonly member: FleetMember;
  phase: 'docked' | 'sailing' | 'lost';
  ai: MerchantAI | null;
  /** Temps restant à quai (chargement). */
  stay: number;
  /** Chargement de l'étape en cours : marchandise, quantité, prix payé. */
  load: { good: Good; amount: number; cost: number } | null;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Routes commerciales : un navire de ta flotte confié à une route la quitte et fait l'aller-retour entre deux ports, en
 * vrai (visible, attaquable, ses canons se défendent seuls). À chaque port, il vend ce qu'il a apporté (l'or te revient
 * tout de suite) puis achète, sur ton or, la marchandise prévue pour l'autre port, autant que sa cale en tient. Coulé, il
 * perd sa cargaison et réapparaît au port d'où partait son étape après le délai habituel. Il continue jusqu'à son rappel.
 */
export class TradeRoutes {
  private readonly runners: Runner[] = [];

  constructor(
    private readonly fleet: Fleet,
    private readonly state: PlayerState,
    private readonly ledger: Ledger,
    private readonly islands: Record<IslandId, IslandState>,
    private readonly ships: readonly Ship[],
    private readonly say: (text: string) => void,
  ) {}

  /** Marchandises qu'on peut acheter à `from` et revendre à `to`. */
  goods(from: IslandId, to: IslandId): Good[] {
    return GOODS.filter((g) => this.islands[from].price(g).buy !== null && this.islands[to].price(g).sell !== null);
  }

  /** Gain par unité d'une marchandise achetée à `from` et revendue à `to` (null si l'un des marchés n'en fait pas). */
  margin(good: Good, from: IslandId, to: IslandId): number | null {
    const buy = this.islands[from].price(good).buy;
    const sell = this.islands[to].price(good).sell;
    return buy === null || sell === null ? null : sell - buy;
  }

  /** Bénéfice estimé d'un aller-retour, cale pleine, aux prix d'aujourd'hui. */
  estimate(member: FleetMember, ports: readonly [IslandId, IslandId], goods: readonly [Good | null, Good | null]): number {
    const room = freeSpace(member) + (this.runner(member)?.load?.amount ?? 0);
    const leg = (good: Good | null, from: IslandId, to: IslandId) => (good ? room * (this.margin(good, from, to) ?? 0) : 0);
    return leg(goods[0], ports[0], ports[1]) + leg(goods[1], ports[1], ports[0]);
  }

  /** Confie un navire (pas celui qu'on pilote) à une route qui part du port `from`, où il se trouve. */
  start(member: FleetMember, from: IslandId, to: IslandId, out: Good | null, back: Good | null): boolean {
    if (from === to || this.runner(member) || !this.fleet.setTrade(member, { ports: [from, to], goods: [out, back], leg: 0 })) return false;
    this.runners.push({ member, phase: 'docked', ai: null, stay: TRADE_ROUTES.loadTime, load: null });
    return true;
  }

  /** Rappelle un navire : il quitte sa route et rejoint la flotte (sa cargaison reste dans sa cale). */
  recall(member: FleetMember) {
    const i = this.runners.findIndex((r) => r.member === member);
    if (i >= 0) this.drop(i);
    this.fleet.setTrade(member, null);
  }

  /** Où en est un navire en commerce, en quelques mots (onglet Routes). */
  status(member: FleetMember): string {
    const r = this.runner(member);
    const order = member.trade;
    if (!r || !order) return '';
    const here = ISLAND_INFO[order.ports[order.leg]].shortName;
    const there = ISLAND_INFO[order.ports[1 - order.leg]].shortName;
    if (!member.inWorld) return `Coulé · de retour à ${here} dans ${Math.ceil(member.respawnIn)} s`;
    if (!member.ship.alive) return 'Il coule…';
    if (r.phase === 'docked') return `À quai à ${here} : chargement`;
    const load = r.load ? goodText(r.load.good, r.load.amount) : 'à vide';
    return `En route vers ${there} (${load}) · ${Math.round(r.ai?.remaining ?? 0)} m`;
  }

  update(dt: number) {
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const r = this.runners[i];
      const m = r.member;
      // Vendu au port, ou rappelé : il n'est plus mené ici.
      if (!m.trade || !this.fleet.members.includes(m)) {
        this.drop(i);
        continue;
      }
      if (!m.inWorld || !m.ship.alive) {
        // Coulé : sa cargaison est perdue (la campagne vide sa cale) ; il réapparaîtra au port de départ de l'étape.
        if (r.phase !== 'lost') releaseMooring(m.ship);
        r.phase = 'lost';
        r.load = null;
        continue;
      }
      if (r.phase === 'lost') {
        r.phase = 'docked';
        r.stay = TRADE_ROUTES.loadTime;
      }
      if (r.phase === 'docked') {
        steerTo(m.ship, m.ship.heading, 0);
        r.stay -= dt;
        if (r.stay > 0) continue;
        this.trade(r, m.trade);
        this.depart(r, m.trade);
      } else if (r.ai?.update(dt)) {
        m.trade.leg = m.trade.leg === 0 ? 1 : 0;
        r.phase = 'docked';
        r.stay = rand(TRADE_ROUTES.stay);
      }
    }
  }

  /** À quai : vend ce qu'il a apporté, puis achète la marchandise prévue pour l'autre port. */
  private trade(r: Runner, order: TradeOrder) {
    const m = r.member;
    const port = order.ports[order.leg];
    const island = this.islands[port];
    if (r.load) {
      const { good, amount, cost } = r.load;
      const sell = island.price(good).sell;
      const n = Math.min(amount, m.cargo[good]);
      if (sell !== null && n > 0) {
        m.cargo[good] -= n;
        const revenue = n * sell;
        const profit = Math.round(revenue - (cost * n) / amount);
        this.state.earn({ gold: revenue, wood: 0 });
        this.ledger.goldEarned += revenue;
        this.ledger.goodsSold += n;
        this.ledger.tradeProfit += profit;
        this.say(`⚖ ${m.name} vend ${goodText(good, n)} à ${ISLAND_INFO[port].shortName} : +${revenue} or (bénéfice ${profit >= 0 ? '+' : ''}${profit})`);
      }
      r.load = null;
    }
    const good = order.goods[order.leg];
    const buy = good ? island.price(good).buy : null;
    if (!good || buy === null) return;
    const n = Math.min(freeSpace(m), Math.floor(this.state.gold / buy));
    if (n <= 0) {
      this.say(`⚖ ${m.name} n'a rien pu charger à ${ISLAND_INFO[port].shortName} (cale pleine ou or insuffisant)`);
      return;
    }
    this.state.spend({ gold: n * buy, wood: 0 });
    store(m, good, n);
    r.load = { good, amount: n, cost: n * buy };
  }

  /** Quitte la crique, traverse (route chaque fois différente) et mouille devant l'autre port. */
  private depart(r: Runner, order: TradeOrder) {
    const from = islandById(order.ports[order.leg]);
    const to = islandById(order.ports[1 - order.leg]);
    const exit = bayMouth(from);
    const route = [exit, ...seaRoute(exit, bayMouth(to)), mooringSpot(to, this.ships, r.member.ship)];
    r.ai = new MerchantAI(r.member.ship, route, TRADE_ROUTES.sail);
    r.phase = 'sailing';
  }

  private runner(member: FleetMember): Runner | undefined {
    return this.runners.find((r) => r.member === member);
  }

  private drop(index: number) {
    const [r] = this.runners.splice(index, 1);
    releaseMooring(r.member.ship);
  }
}
