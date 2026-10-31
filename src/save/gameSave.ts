import type { Campaign } from '../campaign';
import { SAVE } from '../config';
import type { Fleet } from '../fleet/fleet';
import type { PlayerState } from '../progression/playerState';
import { isHostile, type Ship } from '../ship/ship';
import type { EnemySpawner } from '../world/enemySpawner';
import type { Weather } from '../world/weather';
import { finishFleet, rebuildFleet, snapshotMember } from './fleetSnapshot';
import { healthScaleOf, SAVE_GAME_ID, SAVE_VERSION, type SaveData } from './saveData';

/** Ce que la sauvegarde lit et rétablit. */
export interface SaveTargets {
  readonly state: PlayerState;
  readonly fleet: Fleet;
  readonly campaign: Campaign;
  readonly spawner: EnemySpawner;
  readonly weather: Weather;
  /** Tous les bateaux du monde (pour savoir si un ennemi est proche). */
  readonly ships: readonly Ship[];
}

/** Pourquoi on ne peut pas sauvegarder maintenant (texte affiché), ou null si on peut. */
export function saveBlocker(t: SaveTargets): string | null {
  const leader = t.fleet.leader;
  if (!leader.alive) return 'Impossible de sauvegarder pendant un naufrage.';
  const near = t.ships.some((s) => s.alive && isHostile(leader, s) && t.fleet.hand.some((m) => m.inWorld && m.ship.alive && m.ship.distanceTo(s) < SAVE.enemyRange));
  return near ? 'Impossible de sauvegarder avec un ennemi à portée.' : null;
}

/** L'état de la partie, à l'instant présent. */
export function captureGame(t: SaveTargets, name: string): SaveData {
  const { state, fleet } = t;
  return {
    game: SAVE_GAME_ID,
    version: SAVE_VERSION,
    name,
    savedAt: new Date().toISOString(),
    player: { gold: state.gold, wood: state.wood, slots: state.slots },
    kills: t.spawner.kills,
    weather: t.weather.target,
    fleet: { formation: fleet.formation, controlledId: fleet.controlled.id, members: fleet.members.map((m) => snapshotMember(m, fleet.respawnFactor)) },
    campaign: t.campaign.snapshot(),
  };
}

/** Premier temps du chargement, avant que la campagne existe : la flotte, chacun à sa place. */
export function restoreFleet(fleet: Fleet, data: SaveData) {
  rebuildFleet(fleet, data.fleet);
}

/** Second temps, une fois tout le jeu créé : ressources, progression, campagne, puis caractéristiques des navires. */
export function restoreGame(t: SaveTargets, data: SaveData) {
  Object.assign(t.state, data.player);
  t.spawner.kills = data.kills;
  t.weather.target = data.weather;
  t.campaign.restore(data.campaign);
  finishFleet(t.fleet, data.fleet, t.campaign.crew, healthScaleOf(data.version));
}
