import type { CannonMount } from './shipModel';

/** Un poste sur le pont, dans le repère du modèle : position des pieds et orientation (0 = vers la proue, +π/2 = vers bâbord). */
export interface DeckSpot {
  x: number;
  y: number;
  z: number;
  facing: number;
}

/** Un chemin de promenade sur un pont : un segment à la hauteur y, d'un point (ax, az) à un autre (bx, bz). */
export interface DeckWalk {
  y: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/**
 * Ce que l'équipage animé sait du pont d'un navire (deckCrew/) : combien de matelots, où se tiennent le barreur et la
 * vigie, où les matelots flânent, où ils halent les cordages, et quels canons sont servis à découvert (les autres sont
 * dans une batterie couverte ou un château, hors de vue).
 */
export interface DeckPlan {
  /** Matelots à bord, navire intact (en plus du barreur et de la vigie). */
  hands: number;
  helm: DeckSpot;
  lookout: DeckSpot | null;
  walks: readonly DeckWalk[];
  /** Postes aux cordages (pied des mâts, contre le pavois), pour les manœuvres de voilure. */
  ropes: readonly DeckSpot[];
  /** Un canon servi à découvert : un canonnier se tient derrière sa culasse en combat. */
  isOpenGun(mount: CannonMount): boolean;
}

/** Chemins le long du pont, à ces écarts x de l'axe (un par écart), de z = from à z = to. */
export function deckWalks(y: number, xs: readonly number[], from: number, to: number): DeckWalk[] {
  return xs.map((x) => ({ y, ax: x, az: from, bx: x, bz: to }));
}

/** Postes aux cordages au pied de chaque mât (z donné), de part et d'autre, à `inset` du bordé (demi-largeur `halfWidth(z)`). */
export function ropeSpots(y: number, mastZs: readonly number[], halfWidth: (z: number) => number, inset = 0.5): DeckSpot[] {
  return mastZs.flatMap((z) => [1, -1].map((side) => ({ x: side * (halfWidth(z) - inset), y, z: z - 0.6, facing: (side * Math.PI) / 2 })));
}
