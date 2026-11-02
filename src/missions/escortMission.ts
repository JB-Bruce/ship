import { MerchantAI } from '../ai/merchantAI';
import { bayMouth, seaRoute } from '../ai/seaRoute';
import { CONTRACTS, ISLAND_INFO, LAND, MERCHANT, MERCHANT_LIVERY } from '../config';
import type { Contract } from '../progression/contracts';
import { noUpgrades } from '../progression/upgrades';
import { createShip, type Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import { islandById, land } from '../world/island';
import { squadronTypes, type MapZone, type Mission, type MissionOutcome, type MissionWorld } from './mission';

/**
 * Escorte : un sloop marchand (camp allié, hors de ta flotte) sort de la crique de l'île qui offre le contrat et met le
 * cap sur une autre île, par une route chaque fois différente. Les ennemis peuvent l'attaquer ; selon les étoiles, des
 * embuscades (ou celles d'une mission spéciale) surgissent devant lui, réparties sur le trajet. Réussite à son arrivée devant le port visé
 * (prime versée sur-le-champ), échec s'il coule.
 */
export class EscortMission implements Mission {
  readonly failure = `${MERCHANT.name} a sombré avec sa cargaison…`;
  readonly ship: Ship;
  private readonly ai: MerchantAI;
  /** Longueur de la route au départ (m), pour situer les embuscades. */
  private readonly length: number;
  /** Embuscades prévues, et celles qui restent à surgir. */
  private readonly totalAmbushes: number;
  private ambushes: number;
  private readonly attackers: Enemy[] = [];
  private readonly stars: number;
  /** Port visé, dans les phrases (« la Tortue »). */
  private readonly destination: string;

  constructor(
    private readonly world: MissionWorld,
    contract: Contract,
    private readonly onAmbush: () => void,
  ) {
    this.stars = contract.tier ?? contract.stars;
    const from = islandById(contract.from);
    const to = islandById(contract.claimAt);
    this.destination = ISLAND_INFO[to.id].shortName;
    this.ship = createShip('sloop', 'ally', noUpgrades(), MERCHANT_LIVERY);
    const start = from.portSpawn;
    this.ship.respawn(start.x, start.z);
    this.ship.heading = start.heading;
    // Sortie de la crique, route en mer (détours au hasard), entrée de l'autre crique, puis le mouillage devant le quai.
    const exit = bayMouth(from);
    const route = [exit, ...seaRoute(exit, bayMouth(to)), to.portSpawn];
    this.ai = new MerchantAI(this.ship, route);
    this.length = this.ai.remaining;
    this.totalAmbushes = this.ambushes = contract.ambushes ?? CONTRACTS.escort.ambushes[this.stars - 1];
    world.ships.push(this.ship);
    world.scene.add(this.ship.model.root);
  }

  update(dt: number): MissionOutcome {
    // Il coule : la mission échoue une fois l'épave disparue.
    if (!this.ship.alive) return this.ship.sunk ? 'failure' : 'running';
    // Embuscades réparties sur le trajet : à 1/2 ; ou à 1/3 et 2/3 ; ou à 1/4, 1/2 et 3/4…
    const done = this.totalAmbushes - this.ambushes;
    if (this.ambushes > 0 && 1 - this.ai.remaining / this.length > (done + 1) / (this.totalAmbushes + 1)) this.ambush();
    return this.ai.update(dt) ? 'success' : 'running';
  }

  status(): string | null {
    if (!this.ship.alive) return `${MERCHANT.name} coule…`;
    const health = Math.round((this.ship.health / this.ship.stats.maxHealth) * 100);
    return `${MERCHANT.name} : vie ${health} % · ${Math.round(this.ai.remaining)} m de ${this.destination}`;
  }

  zones(): readonly MapZone[] {
    return [];
  }

  /** Une escadre surgit devant le marchand, un peu sur le côté, cap sur lui. */
  private ambush() {
    this.ambushes--;
    const e = CONTRACTS.escort;
    const s = this.stars - 1;
    const h = this.ship.heading + (Math.random() < 0.5 ? 0.4 : -0.4);
    const p = land.keepOffshore(this.ship.position.x + Math.sin(h) * e.ambushDistance, this.ship.position.z + Math.cos(h) * e.ambushDistance, LAND.spawnClearance);
    const heading = Math.atan2(this.ship.position.x - p.x, this.ship.position.z - p.z);
    const types = squadronTypes(e.ambushLeader[s], e.ambushSize[s] - 1, e.ambushMin[s]);
    this.attackers.push(...this.world.spawner.spawnSquadron(types, p.x, p.z, heading, null, {}));
    this.onAmbush();
  }

  dispose() {
    // Les embusqués qui restent redeviennent des patrouilles ordinaires.
    for (const enemy of this.attackers) enemy.persistent = false;
    const i = this.world.ships.indexOf(this.ship);
    if (i >= 0) this.world.ships.splice(i, 1);
    this.world.scene.remove(this.ship.model.root);
    this.ship.dispose();
  }
}
