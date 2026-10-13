import type * as THREE from 'three';
import { MerchantAI } from '../ai/merchantAI';
import { mooringSpot, releaseMooring } from '../ai/pirateAI';
import { bayMouth, seaRoute, type Waypoint } from '../ai/seaRoute';
import { ISLAND_TRADE, LAND, MERCHANT_LIVERY } from '../config';
import type { IslandState } from '../progression/islandState';
import { noUpgrades } from '../progression/upgrades';
import { createShip, type Ship } from '../ship/ship';
import { ISLAND_LIST, land, type Island } from './island';

interface Merchant {
  readonly ship: Ship;
  readonly island: Island;
  ai: MerchantAI;
  /** En route vers le mouillage, à quai (escale), ou reparti vers le large. */
  phase: 'inbound' | 'moored' | 'outbound';
  stay: number;
  /** Il a été coulé (on ne le signale qu'une fois). */
  lost: boolean;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
/** Tirages pour trouver un point d'apparition loin de ton navire. */
const SPAWN_TRIES = 8;

export interface MerchantEvents {
  /** Un marchand a laissé de l'or dans la réserve d'une île. */
  deposited(island: IslandState, gold: number): void;
  /** Un marchand a sombré (attaqué par la Marine). */
  sunk(island: IslandState): void;
  /** Son épave a fini de couler : elle laisse son butin. */
  wrecked(ship: Ship): void;
}

/**
 * Marchands alliés (camp « ally », points bleus comme les autres alliés) qui commercent avec tes îles : pour chaque île à toi, un sloop ou un
 * brigantin arrive du large de temps en temps (plus souvent avec le comptoir), mouille devant le port, laisse son or
 * dans la réserve de l'île à l'arrivée, puis repart vers le large où il disparaît, loin de toi. La Marine peut les
 * couler ; leurs canons se défendent seuls. Tient à jour la liste `ships` partagée.
 */
export class MerchantTraffic {
  readonly merchants: Merchant[] = [];
  /** Navires des marchands (radar, carte), tenus à jour sans allocation par image. */
  readonly ships: Ship[] = [];
  /** Temps avant le prochain marchand, par île (le premier arrive assez vite). */
  private readonly timers = new Map<Island, number>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: Ship[],
    private readonly islands: (island: Island) => IslandState,
    private readonly events: MerchantEvents,
  ) {}

  /**
   * Retire un marchand encore à flot sans naufrage ni épave (il passe à l'ennemi : trahison) ; sa place au mouillage
   * est libérée. S'il n'avait pas encore fait escale, son or n'arrive jamais. Renvoie false si ce n'est pas un marchand
   * des îles à flot (le navire escorté d'une mission n'en est pas un).
   */
  release(ship: Ship): boolean {
    const index = this.merchants.findIndex((m) => m.ship === ship);
    if (index < 0 || !ship.alive || this.merchants[index].lost) return false;
    this.remove(index);
    return true;
  }

  update(dt: number, leader: Ship) {
    for (let i = this.merchants.length - 1; i >= 0; i--) {
      const m = this.merchants[i];
      if (m.ship.sunk) {
        this.events.wrecked(m.ship);
        this.remove(i);
        continue;
      }
      if (!m.ship.alive) {
        if (!m.lost) this.events.sunk(this.islands(m.island));
        m.lost = true;
        continue;
      }
      if (this.sail(m, dt, leader)) this.remove(i);
    }
    for (const island of ISLAND_LIST) {
      const state = this.islands(island);
      if (!state.owned) continue;
      const timer = (this.timers.get(island) ?? state.merchantInterval * 0.4) - dt;
      if (timer > 0) {
        this.timers.set(island, timer);
        continue;
      }
      const count = this.merchants.filter((m) => m.island === island).length;
      const spawned = count < ISLAND_TRADE.maxPerIsland && this.spawn(island, leader);
      this.timers.set(island, spawned ? state.merchantInterval : 5);
    }
  }

  /** Mène un marchand ; renvoie true quand il a disparu au large. */
  private sail(m: Merchant, dt: number, leader: Ship): boolean {
    switch (m.phase) {
      case 'inbound':
        if (m.ai.update(dt)) {
          const state = this.islands(m.island);
          const gold = state.deposit();
          if (gold > 0) this.events.deposited(state, gold);
          m.phase = 'moored';
          m.stay = rand(ISLAND_TRADE.stay);
        }
        return false;
      case 'moored': {
        m.ai.update(dt);
        m.stay -= dt;
        if (m.stay > 0) return false;
        releaseMooring(m.ship);
        const mouth = bayMouth(m.island);
        m.ai = new MerchantAI(m.ship, [mouth, ...seaRoute(mouth, this.offing(m.island, leader))], ISLAND_TRADE.sail);
        m.phase = 'outbound';
        return false;
      }
      case 'outbound': {
        const done = m.ai.update(dt);
        const far = m.ship.distanceTo(leader) > ISLAND_TRADE.despawn;
        return far && (done || Math.hypot(m.ship.position.x - m.island.port.x, m.ship.position.z - m.island.port.z) > ISLAND_TRADE.distance[0] * 0.6);
      }
    }
  }

  /** Un marchand arrive du large vers une île. Renvoie false s'il n'y a pas de point d'apparition loin de toi. */
  private spawn(island: Island, leader: Ship): boolean {
    const from = this.offing(island, leader);
    if (Math.hypot(from.x - leader.position.x, from.z - leader.position.z) < ISLAND_TRADE.clearance) return false;
    const types = ISLAND_TRADE.types;
    const ship = createShip(types[Math.floor(Math.random() * types.length)], 'ally', noUpgrades(), MERCHANT_LIVERY);
    const mooring = mooringSpot(island, this.world, ship);
    const mouth = bayMouth(island);
    ship.respawn(from.x, from.z);
    ship.heading = Math.atan2(mouth.x - from.x, mouth.z - from.z);
    const ai = new MerchantAI(ship, [...seaRoute(from, mouth), mooring], ISLAND_TRADE.sail);
    const merchant: Merchant = { ship, island, ai, phase: 'inbound', stay: 0, lost: false };
    this.merchants.push(merchant);
    this.ships.push(ship);
    this.world.push(ship);
    this.scene.add(ship.model.root);
    return true;
  }

  /** Un point au large de l'île, du côté le plus éloigné de ton navire parmi quelques tirages. */
  private offing(island: Island, leader: Ship): Waypoint {
    let best: Waypoint | null = null;
    let bestDistance = -1;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = rand(ISLAND_TRADE.distance);
      const p = land.keepOffshore(island.port.x + Math.sin(angle) * r, island.port.z + Math.cos(angle) * r, LAND.spawnClearance);
      const d = Math.hypot(p.x - leader.position.x, p.z - leader.position.z);
      if (d > bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best!;
  }

  private remove(index: number) {
    const [{ ship }] = this.merchants.splice(index, 1);
    releaseMooring(ship);
    this.ships.splice(this.ships.indexOf(ship), 1);
    this.world.splice(this.world.indexOf(ship), 1);
    this.scene.remove(ship.model.root);
    ship.dispose();
  }
}
