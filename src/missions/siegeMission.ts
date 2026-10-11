import * as THREE from 'three';
import { CONTRACTS, ISLAND_INFO, LAND } from '../config';
import type { Contract } from '../progression/contracts';
import type { ShipType } from '../shipTypes';
import type { Enemy } from '../world/enemySpawner';
import type { Fort } from '../world/fort';
import { land } from '../world/island';
import { squadronTypes, type MapZone, type Mission, type MissionOutcome, type MissionWorld } from './mission';

/** Les assiégeants arrivent de la mer, dans un cône de ±… (rad) autour de l'axe du bastion principal du fort. */
const APPROACH_SPREAD = 0.6;

/**
 * Défense d'un port : après un délai, une escadre de la Marine surgit au large et bombarde le fort de l'île (la
 * citadelle de Port-Sabre, le fort de la Tortue). Réussite quand toute l'escadre a coulé ; échec si le fort tombe
 * (ses canons se taisent, l'escadre repart). À la fin du siège, le fort est remis en état.
 */
export class SiegeMission implements Mission {
  readonly failure: string;
  private readonly fort: Fort;
  /** Nom commun du fort, pour le suivi (« Citadelle 80 % »). */
  private readonly noun: string;
  private timer = CONTRACTS.defend.delay;
  private attackers: Enemy[] = [];
  private readonly stars: number;
  /** Escadre imposée par une mission spéciale (le chef d'abord), sinon tirée selon les étoiles. */
  private readonly squadron: readonly ShipType[] | undefined;

  constructor(
    private readonly world: MissionWorld,
    contract: Contract,
    private readonly onAttack: () => void,
  ) {
    const island = contract.from;
    this.stars = contract.stars;
    this.squadron = contract.squadron;
    this.fort = world.forts[island];
    const { fort, shortName } = ISLAND_INFO[island];
    const e = fort.feminine ? 'e' : '';
    this.failure = `${fort.feminine ? 'La' : 'Le'} ${fort.noun} de ${shortName} est tombé${e}…`;
    this.noun = fort.noun.charAt(0).toUpperCase() + fort.noun.slice(1);
  }

  /** Le fort, tant qu'il est assiégé (les boulets ennemis peuvent le toucher). */
  get besieged(): Fort | null {
    return this.attackers.length ? this.fort : null;
  }

  update(dt: number): MissionOutcome {
    if (!this.attackers.length) {
      this.timer -= dt;
      if (this.timer <= 0) this.launch();
      return 'running';
    }
    if (!this.fort.alive) return 'failure';
    return this.attackers.some((e) => e.ship.alive) ? 'running' : 'success';
  }

  status(): string | null {
    if (!this.attackers.length) return `L'escadre arrive dans ${Math.ceil(this.timer)} s`;
    const left = this.attackers.filter((e) => e.ship.alive).length;
    return `${this.noun} ${Math.round((this.fort.health / this.fort.maxHealth) * 100)} % · ${left} assaillant${left > 1 ? 's' : ''}`;
  }

  zone(): MapZone | null {
    return null;
  }

  /** Fin du siège : les survivants repartent, le fort est remis en état. */
  dispose() {
    for (const enemy of this.attackers) {
      enemy.ship.siegeTarget = null;
      enemy.persistent = false;
      if (enemy.ship.alive) enemy.ai.leave();
    }
    this.fort.restore();
  }

  /** L'escadre surgit au large du fort, cap sur lui. */
  private launch() {
    const d = CONTRACTS.defend;
    const b = this.fort.bounds;
    const angle = this.fort.facing + (Math.random() * 2 - 1) * APPROACH_SPREAD;
    const p = land.keepOffshore(b.x + Math.sin(angle) * d.distance, b.z + Math.cos(angle) * d.distance, LAND.spawnClearance);
    // Point visé : le milieu des remparts (les boulets touchent l'enceinte en chemin).
    const aim = new THREE.Vector3(b.x, (b.bottom + b.top) / 2, b.z);
    const heading = Math.atan2(b.x - p.x, b.z - p.z);
    // Les étoiles règlent la taille de l'escadre et ses navires.
    const s = this.stars - 1;
    const types = this.squadron ?? squadronTypes(d.leader[s], d.squadron[s] - 1, d.followerMin[s]);
    this.attackers = this.world.spawner.spawnSquadron(types, p.x, p.z, heading, null, { siege: { position: aim } });
    for (const enemy of this.attackers) enemy.ship.siegeTarget = { position: aim, velocityX: 0, velocityZ: 0, radius: b.radius };
    this.onAttack();
  }
}
