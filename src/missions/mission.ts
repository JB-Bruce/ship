import type * as THREE from 'three';
import type { IslandId } from '../config';
import type { Ship } from '../ship/ship';
import { sizeRank, typeOfRank, type ShipType } from '../shipTypes';
import type { EnemySpawner } from '../world/enemySpawner';
import type { Fort } from '../world/fort';

export type MissionOutcome = 'running' | 'success' | 'failure';

/** Zone à marquer sur la carte (zone de chasse d'un capitaine). */
export interface MapZone {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly label: string;
}

/** Ce dont une mission a besoin pour agir en mer. */
export interface MissionWorld {
  readonly scene: THREE.Scene;
  /** Tous les bateaux dans le monde (liste partagée). */
  readonly ships: Ship[];
  readonly spawner: EnemySpawner;
  readonly forts: Record<IslandId, Fort>;
  /** Un navire allié hors de ta flotte (pirate, marchand des îles) a fini de couler : il laisse son butin. */
  wreckLoot(ship: Ship): void;
}

/**
 * Types d'une escadre de mission : le chef (`leader`), puis `followers` suiveurs tirés entre `followerMin` et la
 * taille du chef.
 */
export function squadronTypes(leader: string, followers: number, followerMin: string): ShipType[] {
  const top = sizeRank(leader as ShipType);
  const low = Math.min(top, sizeRank(followerMin as ShipType));
  const types: ShipType[] = [leader as ShipType];
  for (let i = 0; i < followers; i++) types.push(typeOfRank(low + Math.floor(Math.random() * (top - low + 1))));
  return types;
}

/** Une mission en cours, née d'un contrat accepté (chasse, défense, escorte). */
export interface Mission {
  update(dt: number): MissionOutcome;
  /** État affiché sous le contrat, en haut à droite (null = rien de plus que l'avancement). */
  status(): string | null;
  /** Message en cas d'échec. */
  readonly failure: string;
  zone(): MapZone | null;
  /** Fin de la mission (réussie, échouée ou abandonnée) : ce qui reste en mer s'en va. */
  dispose(): void;
}
