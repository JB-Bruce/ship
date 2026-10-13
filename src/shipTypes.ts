// Les types de bateaux : caractéristiques, prix, améliorations et masse.
// Un tableau d'amélioration = une valeur par niveau (le niveau 1 est la première case).

import { UPGRADE_INFO, type ShipTypeDef } from './shipTypeDef';
import { BRIGANTINE_STATS, CARAVEL_STATS, CORVETTE_STATS, FRIGATE_STATS, LONGBOAT_STATS, ROWBOAT_STATS, SCHOONER_STATS, SLOOP_STATS, weaker } from './shipStats';

export type ShipType = 'rowboat' | 'longboat' | 'sloop' | 'caravel' | 'schooner' | 'brigantine' | 'corvette' | 'frigate';
/** Du plus petit au plus gros (par rang de taille ; à rang égal, dans l'ordre d'affichage). */
export const SHIP_SIZE_ORDER: readonly ShipType[] = ['rowboat', 'longboat', 'sloop', 'caravel', 'schooner', 'brigantine', 'corvette', 'frigate'];
/** Nom du type d'un navire selon ses allongements (« Frégate allongée », « Grande frégate »). */
export function typeName(type: ShipType, extension = 0): string {
  return extension > 0 ? (SHIP_TYPES[type].extensions?.[extension - 1]?.name ?? SHIP_TYPES[type].name) : SHIP_TYPES[type].name;
}

/** Rang de taille d'un type (0 = barque) ; plusieurs types peuvent partager un rang. */
export const sizeRank = (type: ShipType) => SHIP_TYPES[type].rank;

/** Rang de taille le plus élevé. */
export const maxRank = () => sizeRank(SHIP_SIZE_ORDER[SHIP_SIZE_ORDER.length - 1]);

/** Un type au hasard parmi ceux d'un rang (parmi `allowed` s'il en reste, sinon parmi tous ceux du rang). */
export function typeOfRank(rank: number, allowed: (type: ShipType) => boolean = () => true): ShipType {
  const all = SHIP_SIZE_ORDER.filter((t) => sizeRank(t) === rank);
  const ok = all.filter(allowed);
  const pool = ok.length ? ok : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

export { UPGRADE_INFO };
export type { ExtensionDef, MassTable, ShipTypeDef, UpgradeTable } from './shipTypeDef';

/** Types que le joueur peut acheter (la barque est réservée aux ennemis). */
export const PLAYER_SHIP_TYPES: ShipType[] = ['longboat', 'sloop', 'caravel', 'schooner', 'brigantine', 'corvette', 'frigate'];

export const SHIP_TYPES: Record<ShipType, ShipTypeDef> = {
  rowboat: {
    name: 'Barque',
    feminine: true,
    description: 'Barque à rames de la marine, un pierrier à l’avant.',
    armament: 'bow',
    rank: 0,
    threat: 1,
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
    rank: 1,
    threat: 2,
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
    rank: 2,
    threat: 3,
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
  caravel: {
    name: 'Caravelle',
    feminine: true,
    description: 'Courte et haute : château arrière, gaillard d’avant, grand mât à voiles carrées et artimon latin. Lente mais très maniable, robuste, avec un gros canon de chasse à la proue.',
    armament: 'broadside',
    rank: 3,
    threat: 3.5,
    lootFactor: 2.7,
    price: { gold: 1000, wood: 250 },
    respawnTime: 62,
    hold: 50,
    stats: CARAVEL_STATS,
    enemyStats: weaker(CARAVEL_STATS, 145, 12),
    gunLabels: { main: 'Canons de flanc', deck: 'Canon de chasse' },
    upgrades: {
      accuracy: {
        costs: [{ gold: 45, wood: 0 }, { gold: 75, wood: 0 }, { gold: 115, wood: 0 }, { gold: 160, wood: 0 }],
        spreadFactor: [0.75, 0.56, 0.4, 0.27],
      },
      range: { costs: [{ gold: 70, wood: 20 }], rangeFactor: [1.15] },
      // D'abord le gros canon de chasse sous le gaillard d'avant, puis un canon de plus par flanc à chaque niveau.
      cannons: { costs: [{ gold: 140, wood: 70 }, { gold: 110, wood: 70 }, { gold: 160, wood: 95 }], cannonsPerSide: [2, 3, 4], chaseFrom: 1 },
      hull: {
        costs: [{ gold: 35, wood: 35 }, { gold: 60, wood: 60 }, { gold: 90, wood: 90 }, { gold: 125, wood: 125 }],
        healthBonus: [45, 95, 150, 210],
      },
      sails: { costs: [{ gold: 50, wood: 12 }, { gold: 75, wood: 20 }, { gold: 110, wood: 30 }], speedFactor: [1.06, 1.12, 1.18] },
      hold: { costs: [{ gold: 50, wood: 30 }, { gold: 85, wood: 50 }, { gold: 120, wood: 75 }], capacity: [65, 85, 110] },
    },
    mass: { base: 270, perExtraCannon: 8, chaseGun: 14, hull: [14, 30, 48, 68], sails: [4, 9, 14], hold: [7, 12, 19], speedLossPerUnit: 0.00055 },
  },
  schooner: {
    name: 'Goélette',
    feminine: true,
    description: 'Longue et fine, deux mâts à voiles auriques : la plus rapide, et elle remonte bien au vent. Grande cale, discrète, ses ventes rapportent plus sur les routes commerciales ; fragile et peu armée.',
    armament: 'broadside',
    threat: 3.5,
    rank: 3,
    lootFactor: 2.5,
    price: { gold: 1000, wood: 220 },
    respawnTime: 60,
    hold: 60,
    canFish: true,
    upwindLoss: 0.5,
    detectability: 0.75,
    tradeBonus: 0.1,
    stats: SCHOONER_STATS,
    enemyStats: weaker(SCHOONER_STATS, 110, 9),
    upgrades: {
      accuracy: { costs: [{ gold: 45, wood: 0 }, { gold: 75, wood: 0 }, { gold: 110, wood: 0 }], spreadFactor: [0.75, 0.55, 0.38] },
      range: { costs: [], rangeFactor: [] },
      // Goélette à hunier : un canon de plus par flanc, un niveau de voilure et un de cale en plus.
      cannons: { costs: [{ gold: 70, wood: 45 }, { gold: 110, wood: 65 }, { gold: 150, wood: 90 }], cannonsPerSide: [3, 4, 5] },
      hull: { costs: [{ gold: 35, wood: 35 }, { gold: 60, wood: 60 }, { gold: 95, wood: 95 }], healthBonus: [35, 70, 110] },
      sails: {
        costs: [{ gold: 45, wood: 12 }, { gold: 70, wood: 18 }, { gold: 100, wood: 28 }, { gold: 140, wood: 40 }],
        speedFactor: [1.05, 1.1, 1.15, 1.21],
      },
      hold: { costs: [{ gold: 50, wood: 30 }, { gold: 85, wood: 50 }, { gold: 120, wood: 75 }, { gold: 160, wood: 100 }], capacity: [75, 95, 120, 145] },
    },
    mass: { base: 240, perExtraCannon: 7, hull: [12, 26, 42], sails: [3, 6, 9, 12], hold: [8, 14, 22, 30], speedLossPerUnit: 0.0006 },
    extensions: [
      {
        name: 'Goélette à hunier',
        description: 'Le chantier rallonge la coque de deux mètres et lui grée un hunier, une voile carrée en tête du mât de misaine : plus de vitesse, un canon de plus par flanc, une voilure et une cale plus grandes.',
        cost: { gold: 900, wood: 350 },
        length: 2,
        healthFactor: 1.1,
        speedFactor: 1.06,
        turnFactor: 0.95,
        mass: 40,
        extraLevels: { cannons: 1, sails: 1, hold: 1 },
      },
    ],
  },
  brigantine: {
    name: 'Brigantin',
    description: 'Tireur d’élite : château arrière abritant deux canons, gaillard d’avant, deux mâts à voiles carrées. Très précis, longue portée, lent à virer.',
    armament: 'broadside',
    rank: 4,
    threat: 4,
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
    rank: 5,
    threat: 5,
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
    rank: 6,
    threat: 6,
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
