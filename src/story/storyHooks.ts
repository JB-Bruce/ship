import type { IslandId } from '../config';
import type { Enemy } from '../world/enemySpawner';

/**
 * Points où le reste du jeu prévient l'histoire (posés par `Game`) : une taverne vient d'ouvrir (c'est là qu'on
 * retrouve certains personnages), le port vient d'ouvrir (`PortMenu.openOn` : Kerdal au quai de la Tortue), un ennemi a sombré (`byFleet` : coulé par ta flotte ; appelé par `Campaign.enemySunk`).
 */
export const storyHooks = {
  tavernOpened: (_island: IslandId): void => {},
  portOpened: (_island: IslandId): void => {},
  enemySunk: (_enemy: Enemy, _byFleet: boolean): void => {},
};
