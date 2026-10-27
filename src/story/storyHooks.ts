import type { IslandId } from '../config';

/**
 * Points où le reste du jeu prévient l'histoire (posés par `Game`) : une taverne vient d'ouvrir (c'est là qu'on
 * retrouve certains personnages).
 */
export const storyHooks = {
  tavernOpened: (_island: IslandId): void => {},
};
