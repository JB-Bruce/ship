import { CONTRACTS, LAND } from '../config';
import type { Contract } from '../progression/contracts';
import type { Enemy } from '../world/enemySpawner';
import { ISLAND_LIST, islandById, land, type Island } from '../world/island';
import { squadronTypes, type MapZone, type Mission, type MissionOutcome, type MissionWorld } from './mission';

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));
/** Tirages pour trouver une zone de chasse en pleine mer. */
const TRIES = 30;

/**
 * Chasse à un capitaine de la Marine : un navire d'élite nommé et son escorte patrouillent dans une zone marquée
 * sur la carte, à quelques centaines de mètres de l'île qui offre la prime. La mission réussit quand le capitaine
 * coule ; la prime se touche ensuite à la taverne de cette île. Ils ne disparaissent pas quand le joueur s'éloigne.
 */
export class HuntMission implements Mission {
  readonly failure = 'Le capitaine t’a échappé.';
  private readonly squadron: Enemy[];
  private readonly area: MapZone;

  constructor(
    private readonly world: MissionWorld,
    contract: Contract,
  ) {
    const h = CONTRACTS.hunt;
    const center = findOpenSea(islandById(contract.from));
    const name = contract.captain ?? 'Capitaine de la Marine';
    this.area = { ...center, radius: h.radius, label: name };
    // Les étoiles règlent le navire du capitaine et son escorte.
    const s = contract.stars - 1;
    // Escadre imposée par une mission spéciale, ou tirée selon les étoiles.
    const types = contract.squadron ?? squadronTypes(h.captain[s], randInt(h.escorts[s]), h.escortMin[s]);
    const home = { x: center.x, z: center.z, radius: h.radius };
    this.squadron = world.spawner.spawnSquadron(types, center.x, center.z, Math.random() * Math.PI * 2, name, { home });
  }

  update(): MissionOutcome {
    return this.squadron[0].ship.alive ? 'running' : 'success';
  }

  status(): string | null {
    return 'Zone de chasse marquée sur la carte (M)';
  }

  zone(): MapZone | null {
    return this.squadron[0].ship.alive ? this.area : null;
  }

  /** L'escorte qui reste redevient une patrouille ordinaire (elle disparaîtra si le joueur s'éloigne). */
  dispose() {
    for (const enemy of this.squadron) enemy.persistent = false;
    if (this.squadron[0].ship.alive) this.world.spawner.discard(this.squadron[0]);
  }
}

/** Un point en pleine mer, à la bonne distance de l'île, loin des côtes et des ports. */
function findOpenSea(island: Island): { x: number; z: number } {
  const h = CONTRACTS.hunt;
  for (let i = 0; i < TRIES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const d = rand(h.distance);
    const x = island.cx + Math.sin(angle) * d;
    const z = island.cz + Math.cos(angle) * d;
    const nearPort = ISLAND_LIST.some((island) => Math.hypot(x - island.port.x, z - island.port.z) < LAND.portClearance);
    if (!nearPort && land.sdf(x, z) > h.radius + LAND.spawnClearance) return { x, z };
  }
  return land.keepOffshore(island.cx - h.distance[1], island.cz, h.radius + LAND.spawnClearance);
}
