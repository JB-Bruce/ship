import type * as THREE from 'three';
import { mooringSpot, PirateAI } from '../ai/pirateAI';
import { ENEMIES, LIVERIES, PIRATES } from '../config';
import { randomLevels } from '../progression/upgrades';
import { createShip, type Ship } from '../ship/ship';
import { maxRank, sizeRank, typeOfRank, type ShipType } from '../shipTypes';
import type { FleetPower } from './enemySpawner';
import type { FishSchool } from './fishSchools';
import { ISLAND_LIST } from './island';
import type { Crate } from './loot';

interface Pirate {
  readonly ship: Ship;
  readonly ai: PirateAI;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Pirates alliés indépendants (camp « ally », points bleus) : 1 à 3 en mer, de la chaloupe jusqu'à un cran au-dessus
 * de ton plus gros navire. Ils prennent la mer à un mouillage loin de toi ; un pirate coulé est remplacé plus tard.
 * Tient à jour la liste `ships` partagée.
 */
export class PirateTraffic {
  readonly pirates: Pirate[] = [];
  private wanted = randInt(PIRATES.count);
  private timer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ships: Ship[],
    private readonly fleetPower: () => FleetPower,
    /** Un pirate a fini de couler : son épave laisse son butin. */
    private readonly onWreck: (ship: Ship) => void,
  ) {}

  /** Ce navire est-il un pirate allié ? */
  has(ship: Ship): boolean {
    return this.pirates.some((p) => p.ship === ship);
  }

  /**
   * Retire un pirate encore à flot sans naufrage ni épave (il passe à l'ennemi : trahison). Un autre prendra la mer plus
   * tard, comme après un naufrage. Renvoie false si ce n'est pas un pirate allié à flot.
   */
  release(ship: Ship): boolean {
    const index = this.pirates.findIndex((p) => p.ship === ship);
    if (index < 0 || !ship.alive) return false;
    this.remove(index);
    return true;
  }

  update(dt: number, crates: readonly Crate[], schools: readonly FishSchool[], leader: Ship) {
    for (let i = this.pirates.length - 1; i >= 0; i--) {
      const { ship, ai } = this.pirates[i];
      if (ship.sunk) {
        this.onWreck(ship);
        this.remove(i);
        continue;
      }
      if (ship.alive) ai.update(dt, this.ships, crates, schools);
    }
    if (this.pirates.length >= this.wanted) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.spawn(leader) ? rand(PIRATES.respawnDelay) : 5;
  }

  /** Un pirate prend la mer au mouillage d'un port loin du joueur. Renvoie false s'il n'y en a pas. */
  private spawn(leader: Ship): boolean {
    const harbors = ISLAND_LIST.filter((i) => Math.hypot(i.port.x - leader.position.x, i.port.z - leader.position.z) > PIRATES.spawnClearance);
    if (!harbors.length) return false;
    const island = harbors[Math.floor(Math.random() * harbors.length)];
    const type = this.pickType();
    const ship = createShip(type, 'ally', randomLevels(type, PIRATES.upgrades, ENEMIES.extensionChance), LIVERIES.ally);
    const m = mooringSpot(island, this.ships, ship);
    ship.respawn(m.x, m.z);
    ship.heading = island.def.bay.angle + (Math.random() - 0.5) * Math.PI;
    this.pirates.push({ ship, ai: new PirateAI(ship, island) });
    this.ships.push(ship);
    this.scene.add(ship.model.root);
    return true;
  }

  /** De la chaloupe jusqu'à un cran au-dessus de ton plus gros navire. */
  private pickType(): ShipType {
    const max = Math.min(maxRank(), sizeRank(this.fleetPower().best) + 1);
    const min = sizeRank('longboat');
    return typeOfRank(min + Math.floor(Math.random() * (max - min + 1)));
  }

  private remove(index: number) {
    const [{ ship, ai }] = this.pirates.splice(index, 1);
    ai.dispose();
    this.ships.splice(this.ships.indexOf(ship), 1);
    this.scene.remove(ship.model.root);
    ship.dispose();
    this.wanted = randInt(PIRATES.count);
  }
}
