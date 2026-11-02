import { NAVY_HOLDS, type IslandId } from '../config';
import type { MissionWorld } from '../missions/mission';
import type { Ship } from '../ship/ship';
import type { Fort } from '../world/fort';
import { ISLAND_LIST, type Island } from '../world/island';
import type { IslandState } from './islandState';
import { NavyIsland, type NavyIslandEvents, type Objective } from './navyIsland';

export interface NavyIslandsEvents extends Omit<NavyIslandEvents, 'changed'> {
  changed(island: Island, captured: boolean): void;
}

/** Les îles de la Marine (NAVY_HOLDS : l'Île Royale, l'Île du Dauphin), vues ensemble par la campagne, le jeu et la sauvegarde. */
export class NavyIslands {
  private readonly list: NavyIsland[];

  constructor(states: Record<IslandId, IslandState>, world: MissionWorld, events: NavyIslandsEvents) {
    this.list = [];
    for (const i of ISLAND_LIST) {
      const def = NAVY_HOLDS[i.id];
      if (def) this.list.push(new NavyIsland(i, states[i.id], world.forts[i.id], world, { ...events, changed: (captured) => events.changed(i, captured) }, def));
    }
  }

  update(dt: number, leader: Ship) {
    for (const n of this.list) n.update(dt, leader);
  }

  /** Vie des forts de la Marine encore à elle (part du maximum), par île. */
  snapshot(): Partial<Record<IslandId, number>> {
    const forts: Partial<Record<IslandId, number>> = {};
    for (const n of this.list) {
      const share = n.snapshot();
      if (share !== null) forts[n.island.id] = share;
    }
    return forts;
  }

  /** Après le chargement des îles (qui les tient) : camp des forts, ports, vie des forts de la Marine. */
  restore(forts: Partial<Record<IslandId, number>> | undefined) {
    for (const n of this.list) n.restore(forts?.[n.island.id]);
  }

  /** Ajoute à `forts` ceux que les boulets peuvent toucher : forts de la Marine debout, les tiens contre-attaqués. */
  besieged(forts: Fort[]): Fort[] {
    for (const n of this.list) {
      const fort = n.besieged;
      if (fort && !forts.includes(fort)) forts.push(fort);
    }
    return forts;
  }

  /** Fort dont la barre de vie s'affiche (contre-attaque, ou fort de la Marine en vue de la caméra `eye`), ou null. */
  barFort(eye: { x: number; z: number }, fog: { near: number; far: number }): Fort | null {
    for (const n of this.list) {
      const fort = n.barFort(eye, fog);
      if (fort) return fort;
    }
    return null;
  }

  /** Contre-attaques en cours (suivi des contrats). */
  objectives(): Objective[] {
    const list: Objective[] = [];
    for (const n of this.list) if (n.objective) list.push(n.objective);
    return list;
  }

  /** Consigne près d'un port de la Marine (prendre l'île), ou null. */
  status(leader: Ship): string | null {
    for (const n of this.list) {
      const status = n.status(leader);
      if (status) return status;
    }
    return null;
  }
}
