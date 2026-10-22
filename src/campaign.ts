import { BOSSES, ISLAND_INFO, OFFICERS, PORT, TREASURE, type BossId, type IslandId } from './config';
import { Crew, type CrewSnapshot } from './fleet/crew';
import { rankName, rankOf } from './fleet/officers';
import { refit } from './fleet/refit';
import { TradeRoutes, type RunnerSnapshot } from './fleet/tradeRoutes';
import { factor } from './progression/modifiers';
import { blueprints, labelFeminine, revealTypes, shipTypeLabel, type BlueprintsSnapshot } from './progression/blueprints';
import type { Fleet, FleetMember } from './fleet/fleet';
import { loseCargo, store } from './fleet/holds';
import { MissionDirector } from './missions/missionDirector';
import { TreasureDirector } from './missions/treasure/treasureDirector';
import { treasures, type TreasuresSnapshot } from './progression/treasures';
import type { MissionWorld } from './missions/mission';
import { Contracts, fleetLevel, MISSION_KINDS, type Contract, type ContractOptions, type ContractsSnapshot } from './progression/contracts';
import { Harbor } from './progression/harbor';
import { IslandState, type IslandSnapshot } from './progression/islandState';
import { Ledger, type LedgerSnapshot } from './progression/ledger';
import { MapDiscovery } from './progression/mapDiscovery';
import { NavyIslands } from './progression/navyIslands';
import { repairAtPort } from './progression/portRepair';
import { visitedIslands } from './save/visitedIslands';
import type { PlayerState } from './progression/playerState';
import type { Combatant, Ship } from './ship/ship';
import type { Hud } from './ui/hud';
import type { EnemySpawner } from './world/enemySpawner';
import type { Fort } from './world/fort';
import { harbors } from './world/harbors';
import { MerchantTraffic } from './world/merchantTraffic';
import { ISLAND_LIST, islandById, tortuga, type Island } from './world/island';
import type { Lighthouse } from './world/lighthouse';
import type { LootKind } from './world/loot';

/** Délai entre deux avertissements « cale pleine » (s). */
const FULL_WARNING_DELAY = 5;

/** Ce qu'une sauvegarde garde de la campagne. */
export interface CampaignSnapshot {
  islands: Record<IslandId, IslandSnapshot>;
  lastPort: IslandId;
  ledger: LedgerSnapshot;
  contracts: ContractsSnapshot;
  crew: CrewSnapshot;
  routes: RunnerSnapshot[];
  /** Vie des forts de la Marine encore debout (part du maximum), par île qu'elle tient. */
  navyForts?: Partial<Record<IslandId, number>>;
  /** Ce que la carte a découvert (voir mapDiscovery.ts) ; absent d'une sauvegarde d'avant la brume de la carte. */
  discovery?: string;
  /** Plans de navires (absents avant la v4 : seuls les types de la flotte sont alors connus). */
  blueprints?: BlueprintsSnapshot;
  /** Chasses au trésor (absentes avant la v6 : aucune chasse). */
  treasures?: TreasuresSnapshot;
}

/**
 * La campagne du joueur, hors du combat lui-même : les îles et leurs ports (escales, rachat, améliorations), le
 * registre, les contrats des tavernes et les missions, et ce qui les fait avancer (butin rangé, poisson pêché,
 * navires coulés de part et d'autre).
 */
export class Campaign {
  readonly islands = Object.fromEntries(ISLAND_LIST.map((i) => [i.id, new IslandState(i.id)])) as Record<IslandId, IslandState>;
  readonly ledger = new Ledger();
  readonly contracts = new Contracts();
  /** Officiers engagés et candidats des tavernes. */
  readonly crew = new Crew();
  readonly harbor: Harbor;
  /** Navires de ta flotte confiés à une route commerciale. */
  readonly routes: TradeRoutes;
  readonly missions: MissionDirector;
  /** Chasses au trésor en cours. */
  readonly treasure: TreasureDirector;
  /** Marchands alliés qui laissent de l'or dans la réserve de tes îles. */
  readonly merchants: MerchantTraffic;
  /** Îles de la Marine (l'Île Royale) : fort, garnison, prise, contre-attaques. */
  readonly navy: NavyIslands;
  /** Ce que la carte connaît : au départ, la Tortue et ses abords. */
  readonly discovery = new MapDiscovery();
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
      // Les alertes de mission (embuscade, attaque) au centre ; le reste en petit message.
      say: (text, danger) => (danger ? hud.message(text, 4, true) : hud.toast(text, 4)),
      succeeded: (c) => this.missionSucceeded(c),
      failed: (c, reason) => {
        this.contracts.remove(c);
        hud.message(reason, 4, true);
        hud.notifications.kill(`✖ Contrat échoué : ${revealTypes(c.title)}`);
      },
    });
    this.treasure = new TreasureDirector(world, state, {
      toast: (text, tone) => hud.toast(text, 4, tone),
      alert: (text, danger) => hud.message(text, 5, danger),
      log: (text) => hud.notifications.kill(text),
    });
    treasures.reset();
    this.routes = new TradeRoutes(fleet, state, this.ledger, this.islands, world.ships, (text) => hud.notifications.kill(text));
    this.harbor = new Harbor(state, fleet, this.islands.tortuga, this.contracts, this.ledger, this.crew, this.routes, {
      say: (text) => hud.toast(text, 2.5),
      log: (text) => hud.notifications.kill(text),
      islandChanged: (island) => this.applyIsland(island),
      contractOptions: () => this.contractOptions(),
      contractAccepted: (c) => this.missions.start(c),
      contractAbandoned: (c) => this.missions.cancel(c),
      treasureRumor: (id) => this.treasure.start(id, 'rumor'),
    });
    this.merchants = new MerchantTraffic(world.scene, world.ships, (island) => this.islands[island.id], {
      deposited: () => this.ledger.merchantVisits++,
      sunk: (island) => hud.notifications.kill(`☠ Un marchand allié a sombré au large de ${island.info.shortName}`),
      wrecked: (ship) => world.wreckLoot(ship),
    });
    this.navy = new NavyIslands(this.islands, world, {
      alert: (text) => hud.message(text, 5, true),
      toast: (text, tone) => hud.toast(text, 4, tone),
      changed: (island, captured) => this.navyIslandChanged(island, captured),
      fleetLevel: () => fleetLevel(fleet.members.map((m) => m.type)),
    });
    for (const island of ISLAND_LIST) {
      this.contracts.refresh(island.id, this.contractOptions());
      this.applyIsland(this.islands[island.id]);
    }
    this.crew.newDay();
    this.discovery.revealLand(tortuga);
    // Plans de navires : la chaloupe, et les types de la flotte (de départ, ou de la sauvegarde à reprendre).
    blueprints.reset(fleet.members.map((m) => m.type));
  }

  /** Une île de la Marine prise, ou reprise par elle : son fort, sa taverne, et ce qui partait vers son port. */
  private navyIslandChanged(island: Island, captured: boolean) {
    this.applyIsland(this.islands[island.id]);
    if (captured) {
      this.contracts.refresh(island.id, this.contractOptions());
      this.hud.notifications.kill(`⚑ ${ISLAND_INFO[island.id].portName} est à toi`);
      return;
    }
    if (this.lastPort === island.id) this.lastPort = 'tortuga';
    // Les navires en route commerciale vers ce port rejoignent la flotte.
    for (const m of this.fleet.members) if (m.trade?.ports.includes(island.id)) this.routes.recall(m);
    this.hud.notifications.kill(`⚑ La Marine a repris ${ISLAND_INFO[island.id].portName}`);
  }

  /** État à sauvegarder : îles, dernier port, registre, contrats, équipage, routes commerciales. */
  snapshot(): CampaignSnapshot {
    const islands = Object.fromEntries(ISLAND_LIST.map((i) => [i.id, this.islands[i.id].snapshot()])) as Record<IslandId, IslandSnapshot>;
    const { lastPort, ledger, contracts, crew, routes, navy } = this;
    return { islands, lastPort, ledger: ledger.snapshot(), contracts: contracts.snapshot(), crew: crew.snapshot(), routes: routes.snapshot(), navyForts: navy.snapshot(), discovery: this.discovery.snapshot(), blueprints: blueprints.snapshot(), treasures: treasures.snapshot() };
  }

  /** Reprend une sauvegarde, la flotte déjà rétablie. Les missions en cours (chasse, défense, escorte) recommencent. */
  restore(s: CampaignSnapshot) {
    for (const island of ISLAND_LIST) {
      const state = this.islands[island.id];
      if (s.islands[island.id]) state.restore(s.islands[island.id]);
    }
    this.navy.restore(s.navyForts);
    for (const island of ISLAND_LIST) this.applyIsland(this.islands[island.id]);
    this.lastPort = s.lastPort;
    this.ledger.restore(s.ledger);
    this.contracts.restore(s.contracts);
    this.crew.restore(s.crew);
    this.routes.restore(s.routes);
    // Ancienne sauvegarde (ou grille illisible) : la carte connaît les îles déjà visitées.
    if (!s.discovery || !this.discovery.restore(s.discovery)) for (const id of visitedIslands(s)) this.discovery.revealLand(islandById(id));
    blueprints.restore(s.blueprints, this.fleet.members.map((m) => m.type));
    treasures.restore(s.treasures);
    this.treasure.restore();
    for (const c of this.contracts.active) {
      if (MISSION_KINDS.includes(c.kind) && !this.contracts.isDone(c)) this.missions.start(c);
    }
  }

  /** Ce que les contrats peuvent demander, et le niveau de ta flotte (étoiles des offres). */
  private contractOptions(): ContractOptions {
    return { ...this.spawner.contractOptions(), level: fleetLevel(this.fleet.members.map((m) => m.type)), best: this.fleet.strongest };
  }

  /** Les îles produisent même quand tu es au large ; le port où se trouve le bateau piloté devient l'escale. */
  update(dt: number, leader: Ship) {
    this.ledger.logSailing(leader);
    for (const island of Object.values(this.islands)) island.update(dt);
    // Nouvelle journée (à l'aube) : les tavernes affichent de nouvelles offres du jour.
    if (this.contracts.tick(dt)) {
      for (const island of ISLAND_LIST) this.contracts.refresh(island.id, this.contractOptions());
      this.crew.newDay();
      this.hud.notifications.kill('🌅 L’aube se lève : nouvelles offres et nouvelles recrues dans les tavernes');
    }
    this.fullWarning = Math.max(0, this.fullWarning - dt);
    const port = this.portInRange(leader);
    if (port) this.lastPort = port.id;
    this.missions.update(dt);
    this.treasure.update(dt);
    this.navy.update(dt, leader);
    this.merchants.update(dt, leader);
    this.routes.update(dt);
  }

  /** Navires à protéger (marchand escorté), en bleu ciel sur le radar et la carte. */
  escorts(): Ship[] {
    return this.missions.escorts();
  }

  /** L'île dont le port (ouvert) est à portée du bateau (zone d'escale et de réparation), ou null. */
  portInRange(ship: Ship): Island | null {
    if (!ship.alive) return null;
    return ISLAND_LIST.find((i) => harbors.isOpen(i.id) && Math.hypot(ship.position.x - i.port.x, ship.position.z - i.port.z) < PORT.repairRadius) ?? null;
  }

  /** Ouvrages que les boulets peuvent toucher : forts assiégés (missions, contre-attaques) et forts de la Marine debout. */
  besieged(): Fort[] {
    return this.navy.besieged(this.missions.besieged());
  }

  /** Fort dont la barre de vie s'affiche : assiégé par une mission, sinon celui d'une île de la Marine. */
  objectiveFort(eye: { x: number; z: number }, fog: { near: number; far: number }): Fort | null {
    return this.missions.besieged()[0] ?? this.navy.barFort(eye, fog);
  }

  /** Réparation rapide à quai (voir portRepair.ts). Renvoie l'état à afficher pour le bateau piloté, sinon null. */
  repairAtPort(dt: number, ships: readonly Ship[], leader: Ship): string | null {
    return repairAtPort(dt, ships, leader, this.islands, this.spawner.enemies);
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

  /** Mission réussie : défense, escorte et aide au combat sont payées sur-le-champ, les chasses à la taverne. */
  private missionSucceeded(c: Contract) {
    if (c.kind === 'hunt' || c.kind === 'planHunt') {
      c.progress = c.target;
      this.hud.notifications.kill(`✔ Contrat rempli : ${revealTypes(c.title)} (prime à ${ISLAND_INFO[c.claimAt].portName})`);
      return;
    }
    this.contracts.complete(c);
    const officer = this.harbor.pay(c);
    if (officer) this.hud.notifications.kill(`★ ${officer.name} (${OFFICERS.roles[officer.role].name.toLowerCase()}) rejoint ton équipage`);
    const info = ISLAND_INFO[c.from];
    const place = info.shortName.charAt(0).toUpperCase() + info.shortName.slice(1);
    const thanks = c.kind === 'defend' ? `${place} a tenu ! ${info.holders} te remercient` : c.kind === 'battle' ? 'Victoire ! Les pirates te remercient' : 'Le marchand est arrivé à bon port';
    this.hud.toast(`${thanks} : +${c.reward.gold} or${c.reward.wood ? `, +${c.reward.wood} bois` : ''}`, 4, 'good');
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
        this.hud.toast(`${member.name} a la cale pleine`, 2.5);
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
    // Un navire maudit coulé par la Marine n'est pas non plus ta victoire.
    const byNavy = !killer && !!enemy?.cursed && attacker?.faction === 'enemy';
    const byPirates = (!killer && attacker?.faction === 'ally') || byNavy;
    const fort = Object.values(forts).find((f) => f === attacker);
    const fortInfo = fort ? ISLAND_INFO[fort.island].fort : null;
    const byFort = fortInfo ? ` par ${fortInfo.feminine ? 'la' : 'le'} ${fortInfo.noun}` : '';
    const by = killer ? ` par ${killer.name}` : fortInfo ? byFort : byNavy ? ' par la Marine' : byPirates ? ' par des pirates' : '';
    if (byPirates && enemy) enemy.uncounted = true;
    if (!byPirates) this.ledger.recordSunk(ship.type, elite, boss);
    const e = labelFeminine(ship.type) ? 'e' : '';
    if (boss) {
      const b = BOSSES[boss];
      const be = b.feminine ? 'e' : '';
      this.hud.notifications.kill(`☠ ${b.name} coulé${be}${by}`);
      this.hud.message(`${b.name} est coulé${be} ! Son pavillon rejoint ton registre.`, 5);
    } else if (enemy?.cursed) {
      this.hud.notifications.kill(`☠ ${shipTypeLabel(ship.type)} maudit${e} renvoyé${e} aux abysses${by}`);
    } else if (enemy?.name) {
      this.hud.notifications.kill(`☠ ${enemy.name} coulé${by}`);
    } else {
      this.hud.notifications.kill(`☠ ${shipTypeLabel(ship.type)} ennemi${e}${elite ? " d'élite" : ''} coulé${e}${by}`);
    }
    // Un navire maudit n'est pas de la Marine : il ne compte pas pour les contrats.
    if (byPirates || enemy?.cursed) return;
    // Une élite coulée par ta flotte lâche parfois le début d'une chasse au trésor.
    const hunt = treasures.untouched()[0];
    if (killer && elite && !boss && hunt && Math.random() < TREASURE.eliteStart) this.treasure.start(hunt, 'elite');
    for (const c of this.contracts.onSunk(ship.type, elite, boss)) {
      this.hud.notifications.kill(`✔ Contrat rempli : ${revealTypes(c.title)} (prime à la taverne)`);
    }
  }
}
