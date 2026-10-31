import { CONTRACTS } from '../config';
import type { Contract } from '../progression/contracts';
import type { Enemy } from '../world/enemySpawner';
import { islandById } from '../world/island';
import { squadronTypes, type MapZone, type Mission, type MissionOutcome, type MissionWorld } from './mission';
import { findOpenSea } from './openSea';

const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Chasse dans une zone marquée sur la carte, à quelques centaines de mètres de l'île qui offre la prime : un capitaine
 * de la Marine (navire d'élite nommé) et son escorte, ou (chasse aux plans) un seul navire, jamais d'élite, qui porte
 * les plans de son type et en lâche à coup sûr un bout. La mission réussit quand il coule ; la prime se touche ensuite
 * à la taverne de cette île. Ils ne disparaissent pas quand le joueur s'éloigne.
 */
export class HuntMission implements Mission {
  readonly failure: string;
  private readonly squadron: Enemy[];
  private readonly area: MapZone;

  constructor(
    private readonly world: MissionWorld,
    contract: Contract,
  ) {
    const h = CONTRACTS.hunt;
    const island = islandById(contract.from);
    const center = findOpenSea(island.cx, island.cz, h.distance, h.radius);
    const home = { x: center.x, z: center.z, radius: h.radius };
    const heading = Math.random() * Math.PI * 2;
    if (contract.kind === 'planHunt') {
      this.failure = 'Le porteur de plans t’a échappé.';
      this.area = { ...center, radius: h.radius, label: '📜 Porteur de plans' };
      this.squadron = world.spawner.spawnSquadron([contract.shipType ?? 'sloop'], center.x, center.z, heading, null, { home }, false);
      this.squadron[0].carriesPlan = true;
      return;
    }
    const name = contract.captain ?? 'Capitaine de la Marine';
    this.failure = 'Le capitaine t’a échappé.';
    this.area = { ...center, radius: h.radius, label: name };
    // Les étoiles règlent le navire du capitaine et son escorte.
    const s = (contract.tier ?? contract.stars) - 1;
    // Escadre imposée par une mission spéciale, ou tirée selon les étoiles.
    const types = contract.squadron ?? squadronTypes(h.captain[s], randInt(h.escorts[s]), h.escortMin[s]);
    this.squadron = world.spawner.spawnSquadron(types, center.x, center.z, heading, name, { home });
  }

  update(): MissionOutcome {
    return this.squadron[0].ship.alive ? 'running' : 'success';
  }

  status(): string | null {
    return 'Zone de chasse marquée sur la carte (M)';
  }

  zones(): readonly MapZone[] {
    return this.squadron[0].ship.alive ? [this.area] : [];
  }

  /** L'escorte qui reste redevient une patrouille ordinaire (elle disparaîtra si le joueur s'éloigne). */
  dispose() {
    for (const enemy of this.squadron) enemy.persistent = false;
    if (this.squadron[0].ship.alive) this.world.spawner.discard(this.squadron[0]);
  }
}
