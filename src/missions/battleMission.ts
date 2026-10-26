import { ArmadaAI, armadaSlot } from '../ai/armadaAI';
import type { Waypoint } from '../ai/seaRoute';
import { CONTRACTS, ENEMIES, LAND, LIVERIES, PIRATES } from '../config';
import type { Contract } from '../progression/contracts';
import { randomLevels } from '../progression/upgrades';
import { createShip, type Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import { islandById, land } from '../world/island';
import { squadronTypes, type MapZone, type Mission, type MissionOutcome, type MissionWorld } from './mission';
import { findOpenSea } from './openSea';

/** Places des suiveurs dans le V (la première, celle du chef, ne sert pas). */
const SLOTS = Array.from({ length: Math.max(...CONTRACTS.battle.allies) }, (_, k) => armadaSlot(k));

interface Pirate {
  readonly ship: Ship;
  readonly ai: ArmadaAI;
}

/**
 * Aide au combat : une armada pirate (camp allié, hors de ta flotte) attend, voiles carguées, à un rendez-vous au large
 * de l'île qui offre le contrat ; une escadre de la Marine aussi nombreuse, mais au chef d'élite, croise plus au large.
 * Quand ton navire piloté arrive au rendez-vous (ou qu'elle est attaquée), l'armada met le cap sur l'escadre.
 * Réussite (prime versée sur-le-champ) quand toute l'escadre a coulé avec au moins un pirate à flot ; échec quand tous
 * les pirates ont sombré. Les survivants redeviennent ensuite des pirates ordinaires, de port en port.
 */
export class BattleMission implements Mission {
  readonly failure = 'L’armada pirate a été anéantie…';
  private readonly pirates: Pirate[] = [];
  private readonly total: number;
  private readonly enemies: Enemy[];
  private readonly meeting: MapZone;
  private readonly enemyArea: MapZone;
  private readonly orders: { sailing: boolean; leader: Ship; objective: Waypoint | null };

  constructor(
    private readonly world: MissionWorld,
    contract: Contract,
    /** L'armada lève l'ancre : la bataille commence. */
    private readonly onSail: () => void,
  ) {
    const b = CONTRACTS.battle;
    const s = (contract.tier ?? contract.stars) - 1;
    const island = islandById(contract.from);
    const meet = findOpenSea(island.cx, island.cz, b.rendezvous, b.joinRadius);
    // L'escadre croise plus au large, du côté opposé à l'île.
    const outward = Math.atan2(meet.x - island.cx, meet.z - island.cz);
    const foe = findOpenSea(meet.x, meet.z, b.enemyDistance, b.enemyRadius, outward, Math.PI / 3);
    const toFoe = Math.atan2(foe.x - meet.x, foe.z - meet.z);
    this.meeting = { ...meet, radius: b.joinRadius, label: '⚓ Armada pirate', ally: true };
    this.enemyArea = { ...foe, radius: b.enemyRadius, label: 'Escadre de la Marine' };

    // L'armada en V au rendez-vous, proues tournées vers l'escadre.
    const fx = Math.sin(toFoe);
    const fz = Math.cos(toFoe);
    const types = squadronTypes(b.allyLeader[s], b.allies[s] - 1, b.allyMin[s]);
    types.forEach((type, k) => {
      const { side, back } = SLOTS[k];
      const post = land.keepOffshore(meet.x - fx * back + fz * side, meet.z - fz * back - fx * side, LAND.spawnClearance);
      const ship = createShip(type, 'ally', randomLevels(type, PIRATES.upgrades, ENEMIES.extensionChance), LIVERIES.ally);
      ship.respawn(post.x, post.z);
      ship.heading = toFoe;
      world.ships.push(ship);
      world.scene.add(ship.model.root);
      this.pirates.push({ ship, ai: new ArmadaAI(ship, post) });
    });
    this.total = types.length;
    this.orders = { sailing: false, leader: this.pirates[0].ship, objective: null };

    const enemyTypes = squadronTypes(b.enemyLeader[s], b.enemies[s] - 1, b.enemyMin[s]);
    this.enemies = world.spawner.spawnSquadron(enemyTypes, foe.x, foe.z, toFoe + Math.PI, null, { home: { ...foe, radius: b.enemyRadius }, stand: true });
  }

  update(): MissionOutcome {
    // Les épaves des pirates coulés laissent leur butin, puis quittent le monde.
    for (let i = this.pirates.length - 1; i >= 0; i--) {
      const { ship } = this.pirates[i];
      if (!ship.sunk) continue;
      this.world.wreckLoot(ship);
      this.removeShip(ship);
      this.pirates.splice(i, 1);
    }
    const afloat = this.afloat();
    if (afloat === 0) return 'failure';
    if (this.enemiesLeft() === 0) return 'success';
    if (!this.orders.sailing && (this.joined() || this.attacked())) {
      this.orders.sailing = true;
      this.onSail();
    }
    // Le chef : le premier pirate à flot ; il va vers l'ennemi le plus proche de lui.
    const leader = this.pirates.find((p) => p.ship.alive)!.ship;
    this.orders.leader = leader;
    this.orders.objective = this.nearestEnemy(leader);
    let k = 0;
    for (const { ship, ai } of this.pirates) {
      if (!ship.alive) continue;
      ai.update(this.world.ships, this.orders, k > 0 ? SLOTS[k] : null);
      k++;
    }
    return 'running';
  }

  status(): string | null {
    if (!this.orders.sailing) return 'Rejoins l’armada pirate au rendez-vous (M)';
    return `Pirates : ${this.afloat()}/${this.total} · Marine : ${this.enemiesLeft()}/${this.enemies.length}`;
  }

  zones(): readonly MapZone[] {
    if (!this.orders.sailing) return [this.meeting, this.enemyArea];
    return this.enemiesLeft() > 0 ? [this.enemyArea] : [];
  }

  /** Les pirates de l'armada (à flot ou en train de couler), pour la carte. */
  get ships(): Ship[] {
    return this.pirates.map((p) => p.ship);
  }

  /** Les survivants (et ceux qui coulent encore) rejoignent les pirates ordinaires ; l'escadre redevient une patrouille. */
  dispose() {
    for (const enemy of this.enemies) enemy.persistent = false;
    for (const { ship } of this.pirates) this.world.adoptPirate(ship);
    this.pirates.length = 0;
  }

  /** Ton navire piloté arrive au rendez-vous, ou près d'un pirate. */
  private joined(): boolean {
    const you = this.world.leader();
    if (!you.alive) return false;
    const r = CONTRACTS.battle.joinRadius;
    const near = (x: number, z: number) => Math.hypot(x - you.position.x, z - you.position.z) < r;
    return near(this.meeting.x, this.meeting.z) || this.pirates.some((p) => near(p.ship.position.x, p.ship.position.z));
  }

  /** Un pirate a été touché (par l'escadre ou une patrouille) : l'armada appareille. */
  private attacked(): boolean {
    return this.pirates.some((p) => p.ship.health < p.ship.stats.maxHealth);
  }

  private afloat(): number {
    let n = 0;
    for (const p of this.pirates) if (p.ship.alive) n++;
    return n;
  }

  private enemiesLeft(): number {
    let n = 0;
    for (const e of this.enemies) if (e.ship.alive) n++;
    return n;
  }

  private nearestEnemy(from: Ship): Waypoint | null {
    let best: Waypoint | null = null;
    let bestDistance = Infinity;
    for (const e of this.enemies) {
      if (!e.ship.alive) continue;
      const d = from.distanceTo(e.ship);
      if (d < bestDistance) {
        bestDistance = d;
        best = e.ship.position;
      }
    }
    return best;
  }

  private removeShip(ship: Ship) {
    const i = this.world.ships.indexOf(ship);
    if (i >= 0) this.world.ships.splice(i, 1);
    this.world.scene.remove(ship.model.root);
    ship.dispose();
  }
}
