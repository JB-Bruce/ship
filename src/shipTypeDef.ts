// Forme d'un type de bateau (shipTypes.ts) : tables d'amélioration, allongements, masse, et noms des améliorations.

import type { Cost, ShipStats } from './config';

export interface UpgradeTable {
  /** Multiplicateur de l'imprécision (écart d'angle et de distance). */
  accuracy: { costs: Cost[]; spreadFactor: number[] };
  /** Multiplicateur de portée des canons (tableau vide = amélioration indisponible pour ce navire). */
  range: { costs: Cost[]; rangeFactor: number[] };
  /**
   * Nombre de canons par flanc. `chaseFrom` : niveau (1 = premier) à partir duquel le canon de chasse est monté
   * (caravelle) ; ce niveau-là garde le nombre de canons par flanc du précédent. `chaseGuns` : canons de chasse à
   * chaque niveau, pour un navire qui en a dès la base (chébec : `ShipStats.chaseGuns`). `mortars` : mortiers à chaque
   * niveau (galiote à bombes : `ShipStats.mortars`).
   */
  cannons: { costs: Cost[]; cannonsPerSide: number[]; chaseFrom?: number; chaseGuns?: number[]; mortars?: number[] };
  /** Multiplicateur de la vie max (≈ +10 % de la vie de base par niveau). */
  hull: { costs: Cost[]; healthFactor: number[] };
  /** Multiplicateur de vitesse et d'accélération. */
  sails: { costs: Cost[]; speedFactor: number[] };
  /** Places dans la cale (poisson, rhum, épices), remplaçant la capacité de base. */
  hold: { costs: Cost[]; capacity: number[] };
  /** Filets de pêche (navires pêcheurs) : multiplicateur du temps entre deux poissons. */
  nets: { costs: Cost[]; catchFactor: number[] };
}

/**
 * Un allongement d'un type (la frégate en a deux) : la coque est sciée et rallongée. Une amélioration à part (niveau
 * `extension` : nombre d'allongements faits), achetée au chantier : plus de vie, un peu plus de vitesse, un virage plus
 * lent, plus de masse (les effets de chaque allongement se cumulent), et les derniers niveaux de certaines améliorations
 * (extraLevels, au bout de leurs tables, dans l'ordre des allongements) ne s'ouvrent qu'avec lui.
 */
export interface ExtensionDef {
  /** Nom du navire une fois allongé (« Frégate allongée »). */
  name: string;
  description: string;
  cost: Cost;
  /** Longueur ajoutée à la coque (m). */
  length: number;
  healthFactor: number;
  speedFactor: number;
  turnFactor: number;
  mass: number;
  /** Nombre de niveaux, à la fin de chaque table, réservés au navire allongé. */
  extraLevels: Partial<Record<keyof UpgradeTable, number>>;
}

/** Masse : chaque équipement alourdit le bateau et le ralentit un peu. */
export interface MassTable {
  base: number;
  perExtraCannon: number;
  /** Canon de chasse, une fois monté. */
  chaseGun?: number;
  /** Mortier en plus de ceux de la base (galiote à bombes). */
  mortar?: number;
  hull: number[];
  sails: number[];
  /** Cale agrandie : la marchandise et l'arrimage pèsent (par niveau). */
  hold: number[];
  /** Vitesse perdue par unité de masse au-dessus de la base (fraction). */
  speedLossPerUnit: number;
}

export interface ShipTypeDef {
  name: string;
  /** Nom féminin (« une barque ») : accorde les textes affichés (« Barque ennemie coulée »). */
  feminine?: boolean;
  /** Présentation à l'achat ; un autre type s'y nomme à trous (« {le:corvette} », `revealTypes` de progression/blueprints.ts). */
  description: string;
  /**
   * Disposition des canons : sur les flancs (bordée) ou à l'avant (l'IA attaque alors en passes) ; `ram` : aucun canon,
   * l'IA fonce sur sa cible pour l'éperonner (brûlot).
   */
  armament: 'broadside' | 'bow' | 'ram';
  /**
   * Menace en points (barque 1 … frégate 6) : la taille du navire pour les contrats (étoiles) et le niveau de la
   * flotte. Elle ne suit pas l'ordre de SHIP_SIZE_ORDER (la caravelle, entre le sloop et le brigantin, vaut 3,5).
   */
  threat: number;
  /**
   * Rang de taille (0 = barque) : il sert à adapter les ennemis à ta flotte (« un cran au-dessus ») et aux escadres.
   * Plusieurs types peuvent partager un rang (caravelle et goélette).
   */
  rank: number;
  /** Butin laissé par l'épave, relatif à une chaloupe. */
  lootFactor: number;
  price: Cost;
  /** Délai avant qu'un bateau de la flotte coulé réapparaisse (s). */
  respawnTime: number;
  /** Places dans la cale sans amélioration (poisson, rhum, épices). */
  hold: number;
  /** Peut pêcher (chaloupe, sloop). */
  canFish?: boolean;
  /** Caractéristiques de base d'un bateau du joueur. */
  stats: ShipStats;
  /** Caractéristiques de base du même bateau chez l'ennemi (aujourd'hui les mêmes que celles du joueur). */
  enemyStats: ShipStats;
  upgrades: UpgradeTable;
  mass: MassTable;
  /** Vent de face : part de la perte de vitesse habituelle qu'il subit (goélette 0,5 = deux fois moins ; 1 par défaut). */
  upwindLoss?: number;
  /** Discrétion : les ennemis en patrouille le repèrent à cette part de leur portée habituelle (1 par défaut). */
  detectability?: number;
  /**
   * Avirons (chébec, galéasse) : par vent de face, les rameurs les sortent d'eux-mêmes et la vitesse gagne cette part
   * (réglages communs OARS).
   */
  oars?: number;
  /** Seulement dans la Marine (et à l'achat) : jamais chez les pirates alliés (galion). */
  navyOnly?: boolean;
  /** Négoce : ses ventes sur une route commerciale rapportent cette part en plus (0 par défaut). */
  tradeBonus?: number;
  /** Noms des deux calibres au chantier (par défaut « Batterie » et « Canons des gaillards »). */
  gunLabels?: { main: string; deck: string };
  /**
   * Brûlot : il explose au premier contact avec une coque adverse (combat/fireships.ts). Dégâts au navire touché et
   * rayon du souffle (m), par nombre d'allongements faits.
   */
  fireship?: { damage: readonly number[]; radius: readonly number[] };
  /** Allongements possibles, dans l'ordre (frégate). */
  extensions?: readonly ExtensionDef[];
}

/** Nom et description des améliorations, communs à tous les types. */
export const UPGRADE_INFO = {
  accuracy: { name: 'Précision des canons', description: 'Des canonniers mieux entraînés : les boulets s’écartent moins de leur cible.' },
  range: { name: 'Portée des canons', description: 'Fûts plus longs et meilleure poudre : les boulets portent plus loin.' },
  cannons: { name: 'Canons supplémentaires', description: 'Un canon de plus sur chaque flanc : plus de boulets par bordée.' },
  hull: { name: 'Défense de la coque', description: 'Bordages doublés et cerclés de fer : le bateau encaisse davantage.' },
  sails: { name: 'Voilure', description: 'Des voiles plus larges et mieux taillées : plus de vitesse et d’accélération.' },
  hold: { name: 'Cale', description: 'Une cale agrandie et mieux arrimée : plus de place pour le poisson, le rhum et les épices.' },
  nets: { name: 'Filets de pêche', description: 'Des filets plus grands et un treuil pour les haler : la pêche remonte le poisson bien plus vite.' },
};
