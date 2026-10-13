import type * as THREE from 'three';
import { CITADEL, FORT, ROYAL_FORT, type IslandId } from '../config';
import { Fort } from './fort';
import { FORT_LAYOUTS } from './fortModel';
import { ISLAND_LIST, royale, sabre, type Island } from './island';
import { buildTerrain, buildVegetation } from './islandTerrain';
import { CITADEL_SPOT, FORT_SPOT, ROYAL_FORT_SPOT } from './landmarks';
import { Lighthouse } from './lighthouse';
import { buildPort } from './port';
import type { LanternSpot } from '../ship/parts/nightGlow';

/** Ce qui, dans le décor des îles, vit et réagit (tir, lumière, améliorations). */
export interface IslandWorks {
  readonly forts: Record<IslandId, Fort>;
  readonly lighthouse: Lighthouse;
  /** Décor fixe qu'on peut cesser de dessiner quand il est noyé dans la brume (pas le phare, qui la perce). */
  readonly decor: readonly THREE.Object3D[];
  /** Lanternes des ports (repère du monde), pour les halos de nuit. */
  readonly lanterns: readonly LanternSpot[];
}

/** Cap depuis un fort vers un point au large de l'entrée de la crique de son île (à `offing` m de la côte). */
function bayMouthBearing(island: Island, fort: { x: number; z: number }, offing: number): number {
  const mouth = island.pointAt(island.def.bay.angle, -offing);
  return Math.atan2(mouth.x - fort.x, mouth.z - fort.z);
}

/** Ajoute à la scène toutes les îles (relief, végétation, port), leurs forts et le phare de la Tortue. */
export function buildIslands(scene: THREE.Scene): IslandWorks {
  const decor: THREE.Object3D[] = [];
  const lanterns: LanternSpot[] = [];
  for (const island of ISLAND_LIST) {
    const port = buildPort(island);
    decor.push(buildTerrain(island), buildVegetation(island), port.group);
    lanterns.push(...port.lanterns);
  }
  const forts = {
    tortuga: new Fort('tortuga', FORT_SPOT, FORT_LAYOUTS.fort, FORT.health),
    // La citadelle regarde l'entrée de sa crique : ses canons couvrent le port et ses approches.
    sabre: new Fort('sabre', CITADEL_SPOT, FORT_LAYOUTS.citadel, CITADEL.health, bayMouthBearing(sabre, CITADEL_SPOT, CITADEL.facingOffing)),
    // Fort-Royal aussi ; il est à la Marine tant que tu n'as pas pris l'île (la campagne règle son camp).
    royale: new Fort('royale', ROYAL_FORT_SPOT, FORT_LAYOUTS.royal, ROYAL_FORT.health, bayMouthBearing(royale, ROYAL_FORT_SPOT, ROYAL_FORT.facingOffing)),
  };
  const lighthouse = new Lighthouse();
  decor.push(forts.tortuga.group, forts.sabre.group, forts.royale.group);
  scene.add(...decor, lighthouse.group);
  return { forts, lighthouse, decor, lanterns };
}
