import { BOSSES, ISLAND_INFO, OFFICERS, PORT, type BossId, type IslandId } from './config';
import { Crew } from './fleet/crew';
import { rankName, rankOf } from './fleet/officers';
import { refit } from './fleet/refit';
import { TradeRoutes } from './fleet/tradeRoutes';
import { factor } from './progression/modifiers';
import type { Fleet, FleetMember } from './fleet/fleet';
import { loseCargo, store } from './fleet/holds';
import { MissionDirector } from './missions/missionDirector';
import type { MissionWorld } from './missions/mission';
import { Contracts, fleetLevel, type Contract, type ContractOptions } from './progression/contracts';
import { Harbor } from './progression/harbor';
import { IslandState } from './progression/islandState';
import { Ledger } from './progression/ledger';
import type { PlayerState } from './progression/playerState';
import { isHostile, type Combatant, type Ship } from './ship/ship';
import { SHIP_TYPES } from './shipTypes';
import type { Hud } from './ui/hud';
import type { EnemySpawner } from './world/enemySpawner';
import { MerchantTraffic } from './world/merchantTraffic';
import { ISLAND_LIST, islandById, type Island } from './world/island';
import type { Lighthouse } from './world/lighthouse';
import type { LootKind } from './world/loot';

/** Délai entre deux avertissements « cale pleine » (s). */
const FULL_WARNING_DELAY = 5;

/**
 * La campagne du joueur, hors du combat lui-même : les îles et leurs ports (escales, rachat, améliorations), le
 * registre, les contrats des tavernes et les missions, et ce qui les fait avancer (butin rangé, poisson pêché,
 * navires coulés de part et d'autre).
 */
export class Campaign {
  readonly islands: Record<IslandId, IslandState> = { tortuga: new IslandState('tortuga'), sabre: new IslandState('sabre') };
  readonly ledger = new Ledger();
  readonly contracts = new Contracts();
  /** Officiers engagés et candidats des tavernes. */
  readonly crew = new Crew();
  readonly harbor: Harbor;
  /** Navires de ta flotte confiés à une route commerciale. */
  readonly routes: TradeRoutes;
  readonly missions: MissionDirector;
  /** Marchands alliés qui laissent de l'or dans la réserve de tes îles. */
  readonly merchants: MerchantTraffic;
  /** Dernier port où la flotte a fait escale : elle y réapparaît si elle sombre tout entière. */
  lastPort: IslandId = 'tortuga';
  private fullWarning = 0;

  constructor(
    private readonly state: PlayerState,
    private readonly fleet: Fleet,
    private readonly hud: Hud,
    private readonly world: MissionWorld,
    private readonly lighthouse: Lighthouse,
    private readonly spawner: EnemySpawner,
  ) {
    this.missions = new MissionDirector(world, {
      say: (text, danger) => hud.message(text, 4, danger),
      succeeded: (c) => this.missionSucceeded(c),
      failed: (c, reason) => {
        this.contracts.remove(c);
        hud.message(reason, 4, true);
        hud.notifications.kill(`✖ Contrat échoué : ${c.title}`);
      },
    });
    this.routes = new TradeRoutes(fleet, state, this.ledger, this.islands, world.ships, (text) => hud.notifications.kill(text));
    this.harbor = new Harbor(state, fleet, this.islands.tortuga, this.contracts, this.ledger, this.crew, this.routes, {
      say: (text) => hud.message(text, 2.5),
      log: (text) => hud.notifications.kill(text),
      islandChanged: (island) => this.applyIsland(island),
      contractOptions: () => this.contractOptions(),
      contractAccepted: (c) => this.missions.start(c),
      contractAbandoned: (c) => this.missions.cancel(c),
    });
    this.merchants = new MerchantTraffic(world.scene, world.ships, (island) => this.islands[island.id], {
      deposited: () => this.ledger.merchantVisits++,
      sunk: (island) => hud.notifications.kill(`☠ Un marchand allié a sombré au large de ${island.info.shortName}`),
    });
    for (const island of ISLAND_LIST) {
      this.contracts.refresh(island.id, this.contractOptions());
      this.applyIsland(this.islands[island.id]);
    }
    this.crew.newDay();
  }

  /** Ce que les contrats peuvent demander, et le niveau de ta flotte (étoiles des offres). */
  private contractOptions(): ContractOptions {
    return { ...this.spawner.contractOptions(), level: fleetLevel(this.fleet.members.map((m) => m.type)) };
  }

  /** Les îles produisent même quand tu es au large ; le port où se trouve le bateau piloté devient l'escale. */
  update(dt: number, leader: Ship) {
    for (const island of Object.values(this.islands)) island.update(dt);
    // Nouvelle journée : les tavernes affichent de nouvelles offres du jour.
    if (this.contracts.tick(dt)) {
      for (const island of ISLAND_LIST) this.contracts.refresh(island.id, this.contractOptions());
      this.crew.newDay();
      this.hud.notifications.kill('📜 Nouvelle journée : nouvelles offres et nouvelles recrues dans les tavernes');
    }
    this.fullWarning = Math.max(0, this.fullWarning - dt);
    const port = this.portInRange(leader);
    if (port) this.lastPort = port.id;
    this.missions.update(dt);
    this.merchants.update(dt, leader);
    this.routes.update(dt);
  }

  /** Navires à protéger (marchand escorté), en bleu ciel sur le radar et la carte. */
  escorts(): Ship[] {
    return this.missions.escorts();
  }

  /** L'île dont le port est à portée du bateau (zone d'escale et de réparation), ou null. */
  portInRange(ship: Ship): Island | null {
    if (!ship.alive) return null;
    return ISLAND_LIST.find((i) => Math.hypot(ship.position.x - i.port.x, ship.position.z - i.port.z) < PORT.repairRadius) ?? null;
  }

  /**
   * À quai, les navires de la flotte se réparent vite, mais seulement hors combat : aucun ennemi à moins de
   * PORT.combatRadius du port. Renvoie l'état à afficher pour le bateau piloté abîmé au port, sinon null.
   */
  repairAtPort(dt: number, ships: readonly Ship[], leader: Ship): string | null {
    let status: string | null = null;
    for (const island of ISLAND_LIST) {
      const port = island.port;
      const inPort = (ship: Ship) => Math.hypot(ship.position.x - port.x, ship.position.z - port.z) < PORT.repairRadius;
      const threatened = ships.some(
        (s) => s.alive && isHostile(leader, s) && Math.hypot(s.position.x - port.x, s.position.z - port.z) < PORT.combatRadius,
      );
      if (!threatened) {
        const rate = this.islands[island.id].repairRate;
        for (const ship of ships) {
          if (ship.faction !== 'player' || !ship.alive || !inPort(ship)) continue;
          ship.health = Math.min(ship.stats.maxHealth, ship.health + rate * ship.stats.maxHealth * dt);
        }
      }
      if (leader.alive && inPort(leader) && leader.health < leader.stats.maxHealth) {
        status = threatened ? 'Réparation suspendue : ennemis près du port' : 'Réparation au quai…';
      }
    }
    return status;
  }

  /** Effets des améliorations d'une île sur son fort, le phare de la Tortue et la flotte. */
  private applyIsland(island: IslandState) {
    const a = island.fortArmament;
    this.world.forts[island.id].setArmament(a.guns, a.range, a.damage);
    if (island.id === 'tortuga') {
      this.lighthouse.setLevel(island.levels.lighthouse);
      this.fleet.respawnFactor = island.respawnFactor;
    }
  }

  /**
   * Un navire de la flotte a coulé un ennemi : il compte la victoire (rang), ses officiers gagnent de l'expérience, et
   * il hisse le pavillon du boss qu'il vient de couler.
   */
  private creditKill(member: FleetMember, boss: BossId | null) {
    const rank = rankOf(member.kills);
    member.kills++;
    const promoted = this.crew.onKill(member.id);
    const newRank = rankOf(member.kills);
    const trophy = boss !== null && !member.trophies.includes(boss);
    if (trophy) member.trophies.push(boss);
    if (newRank === rank && !promoted.length && !trophy) return;
    refit(member, this.crew);
    if (newRank > rank) this.hud.notifications.kill(`★ ${member.name} devient ${rankName(newRank)} (${'★'.repeat(newRank)})`);
    for (const o of promoted) this.hud.notifications.kill(`★ ${o.name} gagne une étoile de ${OFFICERS.roles[o.role].name.toLowerCase()}`);
    if (trophy && boss) this.hud.notifications.kill(`☠ Le pavillon de ${BOSSES[boss].name} flotte sous celui de ${member.name}`);
  }

  /** Mission réussie : défense et escorte sont payées sur-le-champ, la chasse se paie à la taverne. */
  private missionSucceeded(c: Contract) {
    if (c.kind === 'hunt') {
      c.progress = c.target;
      this.hud.notifications.kill(`✔ Contrat rempli : ${c.title} (prime à ${ISLAND_INFO[c.claimAt].portName})`);
      return;
    }
    this.contracts.complete(c);
    const officer = this.harbor.pay(c);
    if (officer) this.hud.notifications.kill(`★ ${officer.name} (${OFFICERS.roles[officer.role].name.toLowerCase()}) rejoint ton équipage`);
    const info = ISLAND_INFO[c.from];
    const place = info.shortName.charAt(0).toUpperCase() + info.shortName.slice(1);
    const thanks = c.kind === 'defend' ? `${place} a tenu ! ${info.holders} te remercient` : 'Le marchand est arrivé à bon port';
    this.hud.message(`${thanks} : +${c.reward.gold} or${c.reward.wood ? `, +${c.reward.wood} bois` : ''}`, 4);
  }

  /** Port de réapparition de la flotte (le dernier port visité). */
  get respawnPort(): Island {
    return islandById(this.lastPort);
  }

  /** Butin ramassé par `ship` : or et bois dans la réserve commune, rhum et épices dans sa cale. Renvoie ce qui est pris. */
  collectLoot(ship: Ship, kind: LootKind, value: number): number {
    let taken = value;
    // Un navire allié hors de ta flotte (marchand escorté) ne ramasse rien pour toi.
    if (!this.fleet.members.some((m) => m.ship === ship)) return 0;
    if (kind === 'gold' || kind === 'wood') {
      // Un quartier-maître en tire davantage.
      taken = Math.round(value * factor(ship.modifiers, 'loot'));
      this.state[kind] += taken;
      if (kind === 'gold') this.ledger.goldEarned += taken;
    } else {
      const member = this.fleet.members.find((m) => m.ship === ship);
      taken = member ? store(member, kind, value) : 0;
      if (taken === 0 && member && this.fullWarning === 0) {
        this.fullWarning = FULL_WARNING_DELAY;
        this.hud.message(`${member.name} a la cale pleine`, 2);
      }
    }
    if (taken > 0) this.hud.notifications.pickup(kind, taken);
    return taken;
  }

  /** Un poisson vient d'être pêché. */
  fishCaught() {
    this.ledger.fishCaught++;
    this.hud.notifications.pickup('fish', 1);
  }

  /** Un navire de ta flotte a sombré : sa cargaison est perdue. */
  memberSunk(member: FleetMember) {
    this.ledger.shipsLost++;
    const lost = loseCargo(member);
    if (lost) this.hud.notifications.kill(`⚓ ${member.name} a sombré avec sa cargaison (${lost})`);
  }

  /** Un ennemi a coulé : fil des navires coulés, registre, contrats, et un point pour le navire qui l'a achevé. */
  enemySunk(ship: Ship, attacker: Combatant | null) {
    const enemy = this.spawner.enemies.find((e) => e.ship === ship);
    const elite = enemy?.elite ?? false;
    const boss = enemy?.boss ?? null;
    const killer = this.fleet.members.find((m) => m.ship === attacker);
    if (killer) this.creditKill(killer, enemy?.boss ?? null);
    const forts = this.world.forts;
    // Coulé par un allié hors de ta flotte (pirate) : le fil l'indique, mais ce n'est pas ta victoire.
    const byPirates = !killer && attacker?.faction === 'ally';
    const fort = Object.values(forts).find((f) => f === attacker);
    const fortInfo = fort ? ISLAND_INFO[fort.island].fort : null;
    const byFort = fortInfo ? ` par ${fortInfo.feminine ? 'la' : 'le'} ${fortInfo.noun}` : '';
    const by = killer ? ` par ${killer.name}` : fortInfo ? byFort : byPirates ? ' par des pirates' : '';
    if (byPirates && enemy) enemy.uncounted = true;
    if (!byPirates) this.ledger.recordSunk(ship.type, elite, boss);
    const def = SHIP_TYPES[ship.type];
    const e = def.feminine ? 'e' : '';
    if (boss) {
      const b = BOSSES[boss];
      const be = b.feminine ? 'e' : '';
      this.hud.notifications.kill(`☠ ${b.name} coulé${be}${by}`);
      this.hud.message(`${b.name} est coulé${be} ! Son pavillon rejoint ton registre.`, 5);
    } else if (enemy?.name) {
      this.hud.notifications.kill(`☠ ${enemy.name} coulé${by}`);
    } else {
      this.hud.notifications.kill(`☠ ${def.name} ennemi${e}${elite ? " d'élite" : ''} coulé${e}${by}`);
    }
    if (byPirates) return;
    for (const c of this.contracts.onSunk(ship.type, elite, boss)) {
      this.hud.notifications.kill(`✔ Contrat rempli : ${c.title} (prime à la taverne)`);
    }
  }
}
