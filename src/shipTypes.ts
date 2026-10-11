// Les types de bateaux : caractéristiques, prix, améliorations et masse.
// Un tableau d'amélioration = une valeur par niveau (le niveau 1 est la première case).

import type { Cost, ShipStats } from './config';
import { BRIGANTINE_STATS, CORVETTE_STATS, FRIGATE_STATS, LONGBOAT_STATS, ROWBOAT_STATS, SLOOP_STATS, weaker } from './shipStats';

export type ShipType = 'rowboat' | 'longboat' | 'sloop' | 'brigantine' | 'corvette' | 'frigate';
/** Du plus petit au plus gros. */
export const SHIP_SIZE_ORDER: readonly ShipType[] = ['rowboat', 'longboat', 'sloop', 'brigantine', 'corvette', 'frigate'];
/** Nom du type d'un navire selon ses allongements (« Frégate allongée », « Grande frégate »). */
export function typeName(type: ShipType, extension = 0): string {
  return extension > 0 ? (SHIP_TYPES[type].extensions?.[extension - 1]?.name ?? SHIP_TYPES[type].name) : SHIP_TYPES[type].name;
}

/** Rang de taille d'un type (0 = barque). */
export const sizeRank = (type: ShipType) => SHIP_SIZE_ORDER.indexOf(type);

/** Types que le joueur peut acheter (la barque est réservée aux ennemis). */
export const PLAYER_SHIP_TYPES: ShipType[] = ['longboat', 'sloop', 'brigantine', 'corvette', 'frigate'];

export interface UpgradeTable {
  /** Multiplicateur de l'imprécision (écart d'angle et de distance). */
  accuracy: { costs: Cost[]; spreadFactor: number[] };
  /** Multiplicateur de portée des canons (tableau vide = amélioration indisponible pour ce navire). */
  range: { costs: Cost[]; rangeFactor: number[] };
  /** Nombre de canons par flanc. */
  cannons: { costs: Cost[]; cannonsPerSide: number[] };
  /** Vie max ajoutée. */
  hull: { costs: Cost[]; healthBonus: number[] };
  /** Multiplicateur de vitesse et d'accélération. */
  sails: { costs: Cost[]; speedFactor: number[] };
  /** Places dans la cale (poisson, rhum, épices), remplaçant la capacité de base. */
  hold: { costs: Cost[]; capacity: number[] };
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
  description: string;
  /** Disposition des canons : sur les flancs (bordée) ou à l'avant (l'IA attaque alors en passes). */
  armament: 'broadside' | 'bow';
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
  /** Caractéristiques de base du même bateau chez l'ennemi (un peu plus faible). */
  enemyStats: ShipStats;
  upgrades: UpgradeTable;
  mass: MassTable;
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
};

export const SHIP_TYPES: Record<ShipType, ShipTypeDef> = {
  rowboat: {
    name: 'Barque',
    feminine: true,
    description: 'Barque à rames de la marine, un pierrier à l’avant.',
    armament: 'bow',
    lootFactor: 0.5,
    price: { gold: 0, wood: 0 },
    respawnTime: 0,
    hold: 0,
    stats: ROWBOAT_STATS,
    enemyStats: ROWBOAT_STATS,
    // Pas de canon en plus ; les autres niveaux ne servent qu'aux barques ennemies aguerries.
    upgrades: {
      accuracy: { costs: [{ gold: 0, wood: 0 }], spreadFactor: [0.7] },
      range: { costs: [], rangeFactor: [] },
      cannons: { costs: [], cannonsPerSide: [] },
      hull: { costs: [{ gold: 0, wood: 0 }], healthBonus: [12] },
      sails: { costs: [{ gold: 0, wood: 0 }], speedFactor: [1.12] },
      hold: { costs: [], capacity: [] },
    },
    mass: { base: 50, perExtraCannon: 0, hull: [6], sails: [0], hold: [], speedLossPerUnit: 0.002 },
  },
  longboat: {
    name: 'Chaloupe',
    feminine: true,
    description: 'Petite et nerveuse : une voile carrée, un pierrier par flanc.',
    armament: 'broadside',
    lootFactor: 1,
    price: { gold: 150, wood: 0 },
    respawnTime: 45,
    hold: 20,
    canFish: true,
    stats: LONGBOAT_STATS,
    enemyStats: weaker(LONGBOAT_STATS, 45, 8),
    upgrades: {
      accuracy: { costs: [{ gold: 20, wood: 0 }, { gold: 40, wood: 0 }, { gold: 60, wood: 0 }], spreadFactor: [0.7, 0.5, 0.3] },
      range: { costs: [], rangeFactor: [] },
      cannons: { costs: [{ gold: 40, wood: 30 }], cannonsPerSide: [2] },
      hull: { costs: [{ gold: 15, wood: 20 }, { gold: 30, wood: 35 }], healthBonus: [25, 55] },
      sails: { costs: [{ gold: 25, wood: 5 }, { gold: 40, wood: 10 }], speedFactor: [1.08, 1.16] },
      hold: { costs: [{ gold: 25, wood: 15 }, { gold: 45, wood: 25 }], capacity: [30, 40] },
    },
    mass: { base: 100, perExtraCannon: 5, hull: [10, 22], sails: [2, 4], hold: [4, 8], speedLossPerUnit: 0.0015 },
  },
  sloop: {
    name: 'Sloop',
    description: 'Polyvalent : grand-voile et foc, pont fermé, canons sur affût. Solide et presque aussi rapide.',
    armament: 'broadside',
    lootFactor: 2,
    price: { gold: 600, wood: 125 },
    respawnTime: 55,
    hold: 40,
    canFish: true,
    stats: SLOOP_STATS,
    enemyStats: weaker(SLOOP_STATS, 100, 10),
    upgrades: {
      accuracy: { costs: [{ gold: 40, wood: 0 }, { gold: 70, wood: 0 }, { gold: 110, wood: 0 }], spreadFactor: [0.7, 0.5, 0.3] },
      range: { costs: [], rangeFactor: [] },
      cannons: { costs: [{ gold: 60, wood: 40 }, { gold: 100, wood: 60 }], cannonsPerSide: [3, 4] },
      hull: { costs: [{ gold: 30, wood: 30 }, { gold: 50, wood: 50 }, { gold: 80, wood: 80 }], healthBonus: [40, 80, 130] },
      sails: { costs: [{ gold: 40, wood: 10 }, { gold: 60, wood: 15 }, { gold: 90, wood: 25 }], speedFactor: [1.06, 1.12, 1.18] },
      hold: { costs: [{ gold: 40, wood: 25 }, { gold: 70, wood: 40 }, { gold: 100, wood: 60 }], capacity: [55, 70, 90] },
    },
    mass: { base: 220, perExtraCannon: 8, hull: [15, 32, 50], sails: [4, 8, 12], hold: [6, 10, 16], speedLossPerUnit: 0.0006 },
  },
  brigantine: {
    name: 'Brigantin',
    description: 'Tireur d’élite : château arrière abritant deux canons, gaillard d’avant, deux mâts à voiles carrées. Très précis, longue portée, lent à virer.',
    armament: 'broadside',
    lootFactor: 3.5,
    price: { gold: 1800, wood: 480 },
    respawnTime: 70,
    hold: 60,
    stats: BRIGANTINE_STATS,
    enemyStats: weaker(BRIGANTINE_STATS, 160, 12),
    upgrades: {
      accuracy: {
        costs: [{ gold: 50, wood: 0 }, { gold: 80, wood: 0 }, { gold: 120, wood: 0 }, { gold: 170, wood: 0 }, { gold: 230, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32, 0.2],
      },
      range: { costs: [{ gold: 80, wood: 20 }, { gold: 130, wood: 35 }], rangeFactor: [1.15, 1.3] },
      // Les canons « bleus » du pont principal, achetés un par un ; brigantin allongé : un de plus au milieu, puis un
      // sous le gaillard d'avant.
      cannons: { costs: [{ gold: 100, wood: 60 }, { gold: 150, wood: 90 }, { gold: 200, wood: 110 }, { gold: 250, wood: 140 }], cannonsPerSide: [4, 5, 6, 7] },
      hull: {
        costs: [{ gold: 40, wood: 40 }, { gold: 70, wood: 70 }, { gold: 100, wood: 100 }, { gold: 140, wood: 140 }, { gold: 190, wood: 190 }],
        healthBonus: [50, 100, 160, 230, 320],
      },
      // Brigantin allongé : deux niveaux de toile mieux taillée qui en font un coureur des mers.
      sails: {
        costs: [{ gold: 60, wood: 15 }, { gold: 90, wood: 25 }, { gold: 130, wood: 35 }, { gold: 180, wood: 50 }, { gold: 240, wood: 65 }],
        speedFactor: [1.06, 1.12, 1.18, 1.26, 1.35],
      },
      hold: { costs: [{ gold: 60, wood: 40 }, { gold: 100, wood: 60 }, { gold: 140, wood: 90 }, { gold: 190, wood: 120 }], capacity: [80, 105, 130, 165] },
    },
    mass: { base: 320, perExtraCannon: 9, hull: [12, 25, 40, 58, 78], sails: [5, 10, 15, 20, 25], hold: [8, 14, 22, 30], speedLossPerUnit: 0.0005 },
    extensions: [
      {
        name: 'Brigantin allongé',
        description: 'Le chantier rallonge le pont principal de trois mètres : un canon de plus par bord au milieu, un autre à l’abri sous le gaillard d’avant, des membrures doublées, de la toile pour filer très vite et plus de cargaison.',
        cost: { gold: 1500, wood: 750 },
        length: 3,
        healthFactor: 1.2,
        speedFactor: 1.04,
        turnFactor: 0.9,
        mass: 70,
        extraLevels: { cannons: 2, hull: 1, sails: 2, hold: 1 },
      },
    ],
  },
  corvette: {
    name: 'Corvette',
    feminine: true,
    description: 'Navire de guerre à trois mâts : une batterie couverte de canons lourds (angle de tir étroit) et, en achetant le pont, des canons légers et rapides au-dessus.',
    armament: 'broadside',
    lootFactor: 4.5,
    price: { gold: 3500, wood: 1050 },
    respawnTime: 80,
    hold: 80,
    stats: CORVETTE_STATS,
    enemyStats: weaker(CORVETTE_STATS, 260, 14),
    upgrades: {
      accuracy: {
        costs: [{ gold: 60, wood: 0 }, { gold: 100, wood: 0 }, { gold: 150, wood: 0 }, { gold: 210, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 100, wood: 30 }, { gold: 160, wood: 50 }], rangeFactor: [1.15, 1.3] },
      // Les canons légers du pont supérieur, deux par deux sur chaque flanc ; corvette allongée : un canon de plus
      // par bord en batterie à chacun des deux niveaux suivants.
      cannons: { costs: [{ gold: 150, wood: 90 }, { gold: 220, wood: 130 }, { gold: 300, wood: 170 }, { gold: 380, wood: 210 }], cannonsPerSide: [6, 8, 9, 10] },
      hull: {
        costs: [{ gold: 50, wood: 50 }, { gold: 90, wood: 90 }, { gold: 130, wood: 130 }, { gold: 180, wood: 180 }, { gold: 240, wood: 240 }],
        healthBonus: [60, 130, 210, 300, 400],
      },
      sails: { costs: [{ gold: 70, wood: 20 }, { gold: 110, wood: 30 }, { gold: 160, wood: 45 }, { gold: 220, wood: 60 }], speedFactor: [1.06, 1.12, 1.18, 1.24] },
      hold: { costs: [{ gold: 80, wood: 50 }, { gold: 120, wood: 80 }, { gold: 170, wood: 110 }, { gold: 230, wood: 150 }], capacity: [110, 140, 180, 230] },
    },
    mass: { base: 420, perExtraCannon: 8, hull: [15, 32, 50, 70, 92], sails: [6, 12, 18, 24], hold: [10, 18, 28, 38], speedLossPerUnit: 0.0004 },
    extensions: [
      {
        name: 'Corvette allongée',
        description: 'Le chantier scie la coque au milieu et y insère quatre mètres de membrures : deux sabords de plus par bord en batterie, des membrures doublées, plus de toile et de cargaison.',
        cost: { gold: 2400, wood: 1200 },
        length: 4,
        healthFactor: 1.2,
        speedFactor: 1.04,
        turnFactor: 0.9,
        mass: 90,
        extraLevels: { cannons: 2, hull: 1, sails: 1, hold: 1 },
      },
    ],
  },
  frigate: {
    name: 'Frégate',
    feminine: true,
    description: 'Trois-mâts carré de guerre, château arrière à galeries : batterie couverte de canons lourds (angle de tir étroit) et canons légers sur les gaillards. Très solide, longue portée, lente à virer.',
    armament: 'broadside',
    lootFactor: 6,
    price: { gold: 7200, wood: 2400 },
    respawnTime: 95,
    hold: 100,
    stats: FRIGATE_STATS,
    enemyStats: weaker(FRIGATE_STATS, 400, 16),
    upgrades: {
      accuracy: {
        costs: [{ gold: 80, wood: 0 }, { gold: 130, wood: 0 }, { gold: 190, wood: 0 }, { gold: 260, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 130, wood: 40 }, { gold: 200, wood: 60 }], rangeFactor: [1.15, 1.3] },
      // Chaque achat ajoute un canon de batterie par bord ; les achats 2 et 4, aussi un canon de gaillard. Frégate
      // allongée : le 5e ajoute deux canons de batterie par bord, le 6e un canon de gaillard d'avant ; grande frégate :
      // le 7e deux canons de batterie, le 8e un canon de gaillard d'arrière.
      cannons: {
        costs: [{ gold: 180, wood: 100 }, { gold: 230, wood: 130 }, { gold: 280, wood: 160 }, { gold: 340, wood: 200 }, { gold: 420, wood: 240 }, { gold: 500, wood: 280 }, { gold: 600, wood: 330 }, { gold: 700, wood: 380 }],
        cannonsPerSide: [7, 9, 10, 12, 14, 15, 17, 18],
      },
      hull: {
        costs: [{ gold: 60, wood: 60 }, { gold: 110, wood: 110 }, { gold: 160, wood: 160 }, { gold: 220, wood: 220 }, { gold: 300, wood: 300 }],
        healthBonus: [80, 170, 270, 380, 500],
      },
      sails: { costs: [{ gold: 90, wood: 25 }, { gold: 140, wood: 40 }, { gold: 200, wood: 55 }, { gold: 270, wood: 75 }, { gold: 350, wood: 100 }], speedFactor: [1.06, 1.12, 1.18, 1.24, 1.3] },
      hold: { costs: [{ gold: 100, wood: 60 }, { gold: 150, wood: 100 }, { gold: 210, wood: 140 }, { gold: 280, wood: 180 }, { gold: 360, wood: 230 }], capacity: [130, 170, 220, 280, 350] },
    },
    mass: { base: 560, perExtraCannon: 8, hull: [20, 42, 66, 92, 120], sails: [8, 16, 24, 32, 40], hold: [12, 22, 34, 46, 58], speedLossPerUnit: 0.0003 },
    extensions: [
      {
        name: 'Frégate allongée',
        description: 'Le chantier scie la coque en deux et y insère cinq mètres de membrures : deux sabords de plus par bord en batterie, un canon de plus sur le gaillard d’avant, et de la place pour plus de toile et de cargaison.',
        cost: { gold: 3600, wood: 1800 },
        length: 5,
        healthFactor: 1.2,
        speedFactor: 1.04,
        turnFactor: 0.9,
        mass: 90,
        extraLevels: { cannons: 2, sails: 1, hold: 1 },
      },
      {
        name: 'Grande frégate',
        description: 'Le chantier rallonge encore la coque, cette fois à l’arrière, au milieu et à l’avant : deux sabords de plus par bord en batterie, un canon de plus sur le gaillard d’arrière, des membrures doublées, plus de toile et de cargaison.',
        cost: { gold: 5400, wood: 2700 },
        length: 5,
        healthFactor: 1.2,
        speedFactor: 1.04,
        turnFactor: 0.9,
        mass: 90,
        extraLevels: { cannons: 2, hull: 1, sails: 1, hold: 1 },
      },
    ],
  },
};
