// Les types de bateaux : caractéristiques, prix, améliorations et masse.
// Un tableau d'amélioration = une valeur par niveau (le niveau 1 est la première case).

import { UPGRADE_INFO, type ShipTypeDef } from './shipTypeDef';
import { BRIG_STATS, BRIGANTINE_STATS, CARAVEL_STATS, CARRACK_STATS, CORVETTE_STATS, FLUYT_STATS, FRIGATE_STATS, GALLEASS_STATS, GALLEON_STATS, LONGBOAT_STATS, ROWBOAT_STATS, SCHOONER_STATS, SLOOP_STATS, XEBEC_STATS } from './shipStats';

export type ShipType = 'rowboat' | 'longboat' | 'sloop' | 'caravel' | 'schooner' | 'brigantine' | 'xebec' | 'fluyt' | 'brig' | 'corvette' | 'carrack' | 'galleass' | 'frigate' | 'galleon';
/** Du plus petit au plus gros (par rang de taille ; à rang égal, dans l'ordre d'affichage). */
export const SHIP_SIZE_ORDER: readonly ShipType[] = ['rowboat', 'longboat', 'sloop', 'caravel', 'schooner', 'brigantine', 'xebec', 'fluyt', 'brig', 'corvette', 'carrack', 'galleass', 'frigate', 'galleon'];
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
export const PLAYER_SHIP_TYPES: ShipType[] = ['longboat', 'sloop', 'caravel', 'schooner', 'brigantine', 'xebec', 'fluyt', 'brig', 'corvette', 'carrack', 'galleass', 'frigate', 'galleon'];

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
      hull: { costs: [{ gold: 0, wood: 0 }], healthFactor: [1.1] },
      sails: { costs: [{ gold: 0, wood: 0 }], speedFactor: [1.12] },
      hold: { costs: [], capacity: [] },
      nets: { costs: [], catchFactor: [] },
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
    enemyStats: LONGBOAT_STATS,
    upgrades: {
      accuracy: { costs: [{ gold: 20, wood: 0 }, { gold: 40, wood: 0 }, { gold: 60, wood: 0 }], spreadFactor: [0.7, 0.5, 0.3] },
      range: { costs: [], rangeFactor: [] },
      cannons: { costs: [{ gold: 40, wood: 30 }], cannonsPerSide: [2] },
      hull: { costs: [{ gold: 15, wood: 20 }, { gold: 30, wood: 35 }], healthFactor: [1.1, 1.2] },
      sails: { costs: [{ gold: 25, wood: 5 }, { gold: 40, wood: 10 }], speedFactor: [1.08, 1.16] },
      hold: { costs: [{ gold: 25, wood: 15 }, { gold: 45, wood: 25 }], capacity: [30, 40] },
      nets: { costs: [{ gold: 30, wood: 15 }, { gold: 60, wood: 25 }], catchFactor: [0.75, 0.55] },
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
    enemyStats: SLOOP_STATS,
    upgrades: {
      accuracy: { costs: [{ gold: 40, wood: 0 }, { gold: 70, wood: 0 }, { gold: 110, wood: 0 }], spreadFactor: [0.7, 0.5, 0.3] },
      range: { costs: [], rangeFactor: [] },
      cannons: { costs: [{ gold: 60, wood: 40 }, { gold: 100, wood: 60 }], cannonsPerSide: [3, 4] },
      hull: { costs: [{ gold: 30, wood: 30 }, { gold: 50, wood: 50 }, { gold: 80, wood: 80 }], healthFactor: [1.1, 1.2, 1.3] },
      sails: { costs: [{ gold: 40, wood: 10 }, { gold: 60, wood: 15 }, { gold: 90, wood: 25 }], speedFactor: [1.06, 1.12, 1.18] },
      hold: { costs: [{ gold: 40, wood: 25 }, { gold: 70, wood: 40 }, { gold: 100, wood: 60 }], capacity: [55, 70, 90] },
      nets: { costs: [{ gold: 45, wood: 20 }, { gold: 80, wood: 35 }, { gold: 120, wood: 50 }], catchFactor: [0.75, 0.55, 0.4] },
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
    enemyStats: CARAVEL_STATS,
    gunLabels: { main: 'Canons de flanc', deck: 'Canon de chasse' },
    upgrades: {
      accuracy: {
        costs: [{ gold: 45, wood: 0 }, { gold: 75, wood: 0 }, { gold: 115, wood: 0 }, { gold: 160, wood: 0 }],
        spreadFactor: [0.75, 0.56, 0.4, 0.27],
      },
      range: { costs: [{ gold: 70, wood: 20 }], rangeFactor: [1.1] },
      // D'abord le gros canon de chasse sous le gaillard d'avant, puis un canon de plus par flanc à chaque niveau.
      cannons: { costs: [{ gold: 140, wood: 70 }, { gold: 110, wood: 70 }, { gold: 160, wood: 95 }], cannonsPerSide: [2, 3, 4], chaseFrom: 1 },
      hull: {
        costs: [{ gold: 35, wood: 35 }, { gold: 60, wood: 60 }, { gold: 90, wood: 90 }, { gold: 125, wood: 125 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      sails: { costs: [{ gold: 50, wood: 12 }, { gold: 75, wood: 20 }, { gold: 110, wood: 30 }], speedFactor: [1.06, 1.12, 1.18] },
      hold: { costs: [{ gold: 50, wood: 30 }, { gold: 85, wood: 50 }, { gold: 120, wood: 75 }], capacity: [65, 85, 110] },
      nets: { costs: [], catchFactor: [] },
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
    enemyStats: SCHOONER_STATS,
    upgrades: {
      accuracy: { costs: [{ gold: 45, wood: 0 }, { gold: 75, wood: 0 }, { gold: 110, wood: 0 }], spreadFactor: [0.75, 0.55, 0.38] },
      range: { costs: [], rangeFactor: [] },
      // Goélette à hunier : un canon de plus par flanc, un niveau de voilure et un de cale en plus.
      cannons: { costs: [{ gold: 70, wood: 45 }, { gold: 110, wood: 65 }, { gold: 150, wood: 90 }], cannonsPerSide: [3, 4, 5] },
      hull: { costs: [{ gold: 35, wood: 35 }, { gold: 60, wood: 60 }, { gold: 95, wood: 95 }], healthFactor: [1.1, 1.2, 1.3] },
      sails: {
        costs: [{ gold: 45, wood: 12 }, { gold: 70, wood: 18 }, { gold: 100, wood: 28 }, { gold: 140, wood: 40 }],
        speedFactor: [1.05, 1.1, 1.15, 1.21],
      },
      hold: { costs: [{ gold: 50, wood: 30 }, { gold: 85, wood: 50 }, { gold: 120, wood: 75 }, { gold: 160, wood: 100 }], capacity: [75, 95, 120, 145] },
      nets: { costs: [{ gold: 50, wood: 25 }, { gold: 90, wood: 40 }, { gold: 130, wood: 55 }], catchFactor: [0.75, 0.55, 0.4] },
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
    enemyStats: BRIGANTINE_STATS,
    upgrades: {
      accuracy: {
        costs: [{ gold: 50, wood: 0 }, { gold: 80, wood: 0 }, { gold: 120, wood: 0 }, { gold: 170, wood: 0 }, { gold: 230, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32, 0.2],
      },
      range: { costs: [{ gold: 80, wood: 20 }, { gold: 130, wood: 35 }], rangeFactor: [1.1, 1.2] },
      // Les canons « bleus » du pont principal, achetés un par un ; brigantin allongé : un de plus au milieu, puis un
      // sous le gaillard d'avant.
      cannons: { costs: [{ gold: 100, wood: 60 }, { gold: 150, wood: 90 }, { gold: 200, wood: 110 }, { gold: 250, wood: 140 }], cannonsPerSide: [4, 5, 6, 7] },
      hull: {
        costs: [{ gold: 40, wood: 40 }, { gold: 70, wood: 70 }, { gold: 100, wood: 100 }, { gold: 140, wood: 140 }, { gold: 190, wood: 190 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4, 1.5],
      },
      // Brigantin allongé : deux niveaux de toile mieux taillée qui en font un coureur des mers.
      sails: {
        costs: [{ gold: 60, wood: 15 }, { gold: 90, wood: 25 }, { gold: 130, wood: 35 }, { gold: 180, wood: 50 }, { gold: 240, wood: 65 }],
        speedFactor: [1.06, 1.12, 1.18, 1.26, 1.35],
      },
      hold: { costs: [{ gold: 60, wood: 40 }, { gold: 100, wood: 60 }, { gold: 140, wood: 90 }, { gold: 190, wood: 120 }], capacity: [80, 105, 130, 165] },
      nets: { costs: [], catchFactor: [] },
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
  xebec: {
    name: 'Chébec',
    description: 'Long, bas et étroit, mâts inclinés vers l’avant : voiles latines à l’avant et à l’arrière, voiles carrées au grand mât, éperon et dunette basse. Rapide et vif, canons de chasse à la proue ; par vent de face, ses rameurs sortent les avirons. Peu de canons de flanc, coque légère.',
    armament: 'broadside',
    rank: 4,
    threat: 4,
    lootFactor: 3.3,
    price: { gold: 1700, wood: 420 },
    respawnTime: 68,
    hold: 55,
    oars: 0.18,
    stats: XEBEC_STATS,
    enemyStats: XEBEC_STATS,
    gunLabels: { main: 'Canons de flanc', deck: 'Canons de chasse' },
    upgrades: {
      accuracy: {
        costs: [{ gold: 50, wood: 0 }, { gold: 80, wood: 0 }, { gold: 120, wood: 0 }, { gold: 170, wood: 0 }],
        spreadFactor: [0.78, 0.6, 0.44, 0.3],
      },
      range: { costs: [{ gold: 80, wood: 20 }], rangeFactor: [1.1] },
      // Un canon de chasse de plus, puis un canon par flanc, puis le troisième canon de chasse ; grand chébec : un
      // canon de plus par flanc à chacun des deux niveaux suivants.
      cannons: {
        costs: [{ gold: 110, wood: 60 }, { gold: 150, wood: 85 }, { gold: 190, wood: 105 }, { gold: 240, wood: 135 }, { gold: 300, wood: 170 }],
        cannonsPerSide: [2, 3, 3, 4, 5],
        chaseGuns: [2, 2, 3, 3, 3],
      },
      hull: {
        costs: [{ gold: 40, wood: 40 }, { gold: 65, wood: 65 }, { gold: 95, wood: 95 }, { gold: 135, wood: 135 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      // Chébec allongé : un niveau de toile en plus.
      sails: {
        costs: [{ gold: 55, wood: 14 }, { gold: 85, wood: 22 }, { gold: 120, wood: 32 }, { gold: 170, wood: 45 }],
        speedFactor: [1.06, 1.12, 1.18, 1.25],
      },
      hold: { costs: [{ gold: 55, wood: 35 }, { gold: 90, wood: 55 }, { gold: 130, wood: 80 }], capacity: [70, 90, 115] },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 290, perExtraCannon: 8, chaseGun: 10, hull: [12, 26, 42, 60], sails: [4, 8, 12, 16], hold: [7, 12, 19], speedLossPerUnit: 0.0005 },
    extensions: [
      {
        name: 'Grand chébec',
        description: 'Le chantier rallonge la coque de trois mètres au milieu : deux sabords de plus par bord (deux niveaux de canons en plus), deux avirons de plus, des voiles plus grandes pour un niveau de voilure en plus.',
        cost: { gold: 1300, wood: 600 },
        length: 3,
        healthFactor: 1.15,
        speedFactor: 1.04,
        turnFactor: 0.92,
        mass: 55,
        extraLevels: { cannons: 2, sails: 1 },
      },
    ],
  },
  fluyt: {
    name: 'Flûte',
    feminine: true,
    description: 'Navire de charge hollandais : coque ventrue aux flancs très rentrés, haute sur l’eau, poupe étroite. Lente et lourde à virer, mais solide ; une cale immense, et ses ventes rapportent plus sur les routes commerciales. Une batterie couverte dans la coque et deux canons légers par bord sur le gaillard d’arrière.',
    armament: 'broadside',
    rank: 5,
    threat: 4.5,
    lootFactor: 4.5,
    price: { gold: 2700, wood: 800 },
    respawnTime: 78,
    hold: 160,
    tradeBonus: 0.15,
    stats: FLUYT_STATS,
    enemyStats: FLUYT_STATS,
    upgrades: {
      accuracy: {
        costs: [{ gold: 60, wood: 0 }, { gold: 100, wood: 0 }, { gold: 150, wood: 0 }, { gold: 210, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 100, wood: 30 }, { gold: 160, wood: 50 }], rangeFactor: [1.1, 1.2] },
      // Un canon de batterie de plus par bord à chaque niveau (4 → 6, les deux canons des gaillards restent) ; flûte
      // allongée : un sabord de batterie et un canon de gaillard d'avant de plus par bord.
      cannons: { costs: [{ gold: 150, wood: 90 }, { gold: 210, wood: 120 }, { gold: 300, wood: 170 }], cannonsPerSide: [7, 8, 10] },
      hull: {
        costs: [{ gold: 50, wood: 50 }, { gold: 90, wood: 90 }, { gold: 130, wood: 130 }, { gold: 180, wood: 180 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      // Flûte allongée : un niveau de voilure et un de cale en plus.
      sails: { costs: [{ gold: 70, wood: 20 }, { gold: 110, wood: 30 }, { gold: 160, wood: 45 }, { gold: 220, wood: 60 }], speedFactor: [1.06, 1.12, 1.18, 1.24] },
      hold: { costs: [{ gold: 80, wood: 50 }, { gold: 120, wood: 80 }, { gold: 170, wood: 110 }, { gold: 230, wood: 150 }], capacity: [200, 250, 300, 360] },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 470, perExtraCannon: 8, hull: [14, 30, 48, 68], sails: [5, 10, 15, 20], hold: [12, 24, 36, 50], speedLossPerUnit: 0.0004 },
    extensions: [
      {
        name: 'Flûte allongée',
        description: 'Le chantier rallonge la coque de quatre mètres au milieu : un sabord de batterie de plus par bord, un canon de plus sur le gaillard d’avant (un niveau de canons en plus), des voiles plus grandes (un niveau de voilure en plus) et une cale encore plus grande.',
        cost: { gold: 1800, wood: 850 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.04,
        turnFactor: 0.92,
        mass: 80,
        extraLevels: { cannons: 1, sails: 1, hold: 1 },
      },
    ],
  },
  brig: {
    name: 'Brick',
    description: 'Chasseur de la Marine : pont ras, deux mâts carrés très hauts, grande brigantine et trois focs. Tous ses canons, légers et vite rechargés, sont sur le pont. Plus rapide et plus maniable que la corvette, moins solide.',
    armament: 'broadside',
    rank: 5,
    threat: 5,
    lootFactor: 4.2,
    price: { gold: 3200, wood: 900 },
    respawnTime: 76,
    hold: 70,
    stats: BRIG_STATS,
    enemyStats: BRIG_STATS,
    upgrades: {
      accuracy: {
        costs: [{ gold: 60, wood: 0 }, { gold: 100, wood: 0 }, { gold: 150, wood: 0 }, { gold: 210, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 100, wood: 30 }, { gold: 160, wood: 50 }], rangeFactor: [1.1, 1.2] },
      // Un canon de plus par flanc à chaque niveau (6 → 9) ; brick allongé : deux niveaux de plus (10, 11).
      cannons: {
        costs: [{ gold: 140, wood: 80 }, { gold: 190, wood: 110 }, { gold: 240, wood: 140 }, { gold: 300, wood: 170 }, { gold: 360, wood: 200 }],
        cannonsPerSide: [7, 8, 9, 10, 11],
      },
      hull: {
        costs: [{ gold: 50, wood: 50 }, { gold: 90, wood: 90 }, { gold: 130, wood: 130 }, { gold: 180, wood: 180 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      sails: { costs: [{ gold: 70, wood: 20 }, { gold: 110, wood: 30 }, { gold: 160, wood: 45 }, { gold: 220, wood: 60 }], speedFactor: [1.06, 1.12, 1.18, 1.24] },
      hold: { costs: [{ gold: 70, wood: 45 }, { gold: 110, wood: 70 }, { gold: 160, wood: 100 }], capacity: [90, 115, 145] },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 380, perExtraCannon: 6, hull: [12, 26, 42, 60], sails: [5, 10, 15, 20], hold: [8, 14, 22], speedLossPerUnit: 0.00045 },
    extensions: [
      {
        name: 'Brick allongé',
        description: 'Le chantier rallonge le pont de trois mètres au milieu : deux sabords de plus par bord (deux niveaux de canons en plus), des membrures plus longues.',
        cost: { gold: 2200, wood: 1000 },
        length: 3,
        healthFactor: 1.15,
        speedFactor: 1.04,
        turnFactor: 0.92,
        mass: 70,
        extraLevels: { cannons: 2 },
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
    enemyStats: CORVETTE_STATS,
    upgrades: {
      accuracy: {
        costs: [{ gold: 60, wood: 0 }, { gold: 100, wood: 0 }, { gold: 150, wood: 0 }, { gold: 210, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 100, wood: 30 }, { gold: 160, wood: 50 }], rangeFactor: [1.1, 1.2] },
      // Les canons légers du pont supérieur, deux par deux sur chaque flanc ; corvette allongée : un canon de plus
      // par bord en batterie à chacun des deux niveaux suivants.
      cannons: { costs: [{ gold: 150, wood: 90 }, { gold: 220, wood: 130 }, { gold: 300, wood: 170 }, { gold: 380, wood: 210 }], cannonsPerSide: [6, 8, 9, 10] },
      hull: {
        costs: [{ gold: 50, wood: 50 }, { gold: 90, wood: 90 }, { gold: 130, wood: 130 }, { gold: 180, wood: 180 }, { gold: 240, wood: 240 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4, 1.5],
      },
      sails: { costs: [{ gold: 70, wood: 20 }, { gold: 110, wood: 30 }, { gold: 160, wood: 45 }, { gold: 220, wood: 60 }], speedFactor: [1.06, 1.12, 1.18, 1.24] },
      hold: { costs: [{ gold: 80, wood: 50 }, { gold: 120, wood: 80 }, { gold: 170, wood: 110 }, { gold: 230, wood: 150 }], capacity: [110, 140, 180, 230] },
      nets: { costs: [], catchFactor: [] },
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
  carrack: {
    name: 'Caraque',
    feminine: true,
    description: 'Grand navire à quatre mâts, château avant en surplomb et château arrière à trois étages : la plus solide, avec une cale énorme. Batterie basse de gros canons, pièces légères des châteaux qui tirent large, et trois gros canons de chasse à l’avant ; courte portée, lente, lourde à virer, et elle perd beaucoup au près.',
    armament: 'broadside',
    rank: 6,
    threat: 5.5,
    lootFactor: 6.5,
    price: { gold: 5800, wood: 2800 },
    respawnTime: 100,
    hold: 140,
    upwindLoss: 1.3,
    stats: CARRACK_STATS,
    enemyStats: CARRACK_STATS,
    gunLabels: { main: 'Batterie basse', deck: 'Pièces des châteaux' },
    upgrades: {
      accuracy: {
        costs: [{ gold: 80, wood: 0 }, { gold: 130, wood: 0 }, { gold: 190, wood: 0 }, { gold: 260, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 130, wood: 40 }, { gold: 200, wood: 60 }], rangeFactor: [1.1, 1.2] },
      // 1 : un canon de batterie de plus par bord, 2 : une pièce sur le château avant, 3 : un canon de batterie ;
      // grande caraque : un canon de batterie et une pièce sur le château avant ; caraque royale : un canon de batterie et
      // une pièce sur le demi-pont (voir carrackArmament).
      cannons: {
        costs: [{ gold: 170, wood: 100 }, { gold: 230, wood: 130 }, { gold: 290, wood: 170 }, { gold: 400, wood: 230 }, { gold: 520, wood: 300 }],
        cannonsPerSide: [8, 9, 10, 12, 14],
      },
      hull: {
        costs: [{ gold: 60, wood: 60 }, { gold: 110, wood: 110 }, { gold: 160, wood: 160 }, { gold: 220, wood: 220 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      sails: { costs: [{ gold: 90, wood: 25 }, { gold: 140, wood: 40 }, { gold: 200, wood: 55 }], speedFactor: [1.06, 1.12, 1.18] },
      // Grande caraque, puis caraque royale : un niveau de cale en plus chacune.
      hold: {
        costs: [{ gold: 100, wood: 60 }, { gold: 150, wood: 100 }, { gold: 210, wood: 140 }, { gold: 280, wood: 180 }, { gold: 360, wood: 230 }, { gold: 450, wood: 290 }],
        capacity: [180, 240, 310, 400, 480, 560],
      },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 600, perExtraCannon: 9, hull: [20, 42, 66, 92], sails: [8, 16, 24], hold: [14, 28, 42, 58, 74, 90], speedLossPerUnit: 0.0003 },
    extensions: [
      {
        name: 'Grande caraque',
        description: 'Le chantier rallonge la coque de quatre mètres au milieu : un sabord de plus par bord dans la batterie basse et une pièce de plus sur le château avant (un niveau de canons en plus), et une cale encore plus grande.',
        cost: { gold: 4000, wood: 2000 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 100,
        extraLevels: { cannons: 1, hold: 1 },
      },
      {
        name: 'Caraque royale',
        description: 'Le chantier rallonge encore la coque de quatre mètres au milieu : un sabord de plus par bord dans la batterie basse et une pièce de plus sur le demi-pont (un niveau de canons en plus), des membrures doublées, et la plus grande cale de toutes.',
        cost: { gold: 5500, wood: 2800 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 110,
        extraLevels: { cannons: 1, hold: 1 },
      },
    ],
  },
  galleass: {
    name: 'Galéasse',
    feminine: true,
    description: 'Grande galère de guerre, longue et basse : trois mâts à voiles latines, éperon, château avant et château de poupe sous un tendelet. Par vent de face, ses rameurs sortent les avirons. Une batterie dans le bordé au-dessus des avirons et des pièces sur le pont ; à la proue, deux triples canons qui tirent trois boulets à la fois, et deux pièces légères sur le château avant.',
    armament: 'broadside',
    rank: 6,
    threat: 6,
    lootFactor: 6,
    price: { gold: 7500, wood: 2600 },
    respawnTime: 98,
    hold: 90,
    oars: 0.3,
    stats: GALLEASS_STATS,
    enemyStats: GALLEASS_STATS,
    gunLabels: { main: 'Batterie et triples canons', deck: 'Pièces du pont et du château avant' },
    upgrades: {
      accuracy: {
        costs: [{ gold: 80, wood: 0 }, { gold: 130, wood: 0 }, { gold: 190, wood: 0 }, { gold: 260, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 130, wood: 40 }, { gold: 200, wood: 60 }], rangeFactor: [1.1, 1.2] },
      // 1 : un canon de batterie de plus par bord, 2 : une pièce sur le pont, 3 : un canon de batterie, 4 : une pièce ;
      // grande galéasse, puis galéasse capitane : un canon de batterie et une pièce chacune (voir galleassArmament).
      cannons: {
        costs: [{ gold: 180, wood: 100 }, { gold: 230, wood: 130 }, { gold: 280, wood: 160 }, { gold: 340, wood: 200 }, { gold: 420, wood: 240 }, { gold: 520, wood: 300 }],
        cannonsPerSide: [9, 10, 11, 12, 14, 16],
      },
      hull: {
        costs: [{ gold: 60, wood: 60 }, { gold: 110, wood: 110 }, { gold: 160, wood: 160 }, { gold: 220, wood: 220 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      sails: { costs: [{ gold: 90, wood: 25 }, { gold: 140, wood: 40 }, { gold: 200, wood: 55 }], speedFactor: [1.06, 1.12, 1.18] },
      hold: { costs: [{ gold: 90, wood: 50 }, { gold: 140, wood: 90 }, { gold: 200, wood: 130 }, { gold: 270, wood: 170 }], capacity: [110, 135, 160, 180] },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 580, perExtraCannon: 8, hull: [20, 42, 66, 92], sails: [8, 16, 24], hold: [10, 20, 30, 40], speedLossPerUnit: 0.0003 },
    extensions: [
      {
        name: 'Grande galéasse',
        description: 'Le chantier rallonge la coque de quatre mètres au milieu : un sabord de plus par bord en batterie et une pièce de plus sur le pont (un niveau de canons en plus), et deux avirons de plus par bord.',
        cost: { gold: 3600, wood: 1800 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 90,
        extraLevels: { cannons: 1 },
      },
      {
        name: 'Galéasse capitane',
        description: 'Le chantier rallonge encore la coque de quatre mètres au milieu : un sabord de plus par bord en batterie, une pièce de plus sur le pont (un niveau de canons en plus), deux avirons de plus par bord et des membrures doublées.',
        cost: { gold: 5400, wood: 2700 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 100,
        extraLevels: { cannons: 1 },
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
    enemyStats: FRIGATE_STATS,
    upgrades: {
      accuracy: {
        costs: [{ gold: 80, wood: 0 }, { gold: 130, wood: 0 }, { gold: 190, wood: 0 }, { gold: 260, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32],
      },
      range: { costs: [{ gold: 130, wood: 40 }, { gold: 200, wood: 60 }], rangeFactor: [1.1, 1.2] },
      // Chaque achat ajoute un canon de batterie par bord ; les achats 2 et 4, aussi un canon de gaillard. Frégate
      // allongée : le 5e ajoute deux canons de batterie par bord, le 6e un canon de gaillard d'avant ; grande frégate :
      // le 7e deux canons de batterie, le 8e un canon de gaillard d'arrière.
      cannons: {
        costs: [{ gold: 180, wood: 100 }, { gold: 230, wood: 130 }, { gold: 280, wood: 160 }, { gold: 340, wood: 200 }, { gold: 420, wood: 240 }, { gold: 500, wood: 280 }, { gold: 600, wood: 330 }, { gold: 700, wood: 380 }],
        cannonsPerSide: [7, 9, 10, 12, 14, 15, 17, 18],
      },
      hull: {
        costs: [{ gold: 60, wood: 60 }, { gold: 110, wood: 110 }, { gold: 160, wood: 160 }, { gold: 220, wood: 220 }, { gold: 300, wood: 300 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4, 1.5],
      },
      sails: { costs: [{ gold: 90, wood: 25 }, { gold: 140, wood: 40 }, { gold: 200, wood: 55 }, { gold: 270, wood: 75 }, { gold: 350, wood: 100 }], speedFactor: [1.06, 1.12, 1.18, 1.24, 1.3] },
      hold: { costs: [{ gold: 100, wood: 60 }, { gold: 150, wood: 100 }, { gold: 210, wood: 140 }, { gold: 280, wood: 180 }, { gold: 360, wood: 230 }], capacity: [130, 170, 220, 280, 350] },
      nets: { costs: [], catchFactor: [] },
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
  galleon: {
    name: 'Galion',
    description: 'Le navire au trésor : très haut, château arrière à trois étages et galeries dorées, poulaine et lion de proue, quatre mâts. Deux batteries couvertes de gros canons et des pièces légères sur les châteaux : la plus forte bordée et la plus grande cale. Lent, lourd à virer, et il perd beaucoup au près.',
    armament: 'broadside',
    rank: 7,
    threat: 7,
    lootFactor: 9,
    price: { gold: 10000, wood: 5500 },
    respawnTime: 110,
    hold: 220,
    upwindLoss: 1.3,
    tradeBonus: 0.1,
    navyOnly: true,
    stats: GALLEON_STATS,
    enemyStats: GALLEON_STATS,
    gunLabels: { main: 'Batteries', deck: 'Pièces des châteaux et du pont' },
    upgrades: {
      // Galion amiral : un niveau de précision et un de portée en plus.
      accuracy: {
        costs: [{ gold: 100, wood: 0 }, { gold: 160, wood: 0 }, { gold: 230, wood: 0 }, { gold: 310, wood: 0 }, { gold: 400, wood: 0 }],
        spreadFactor: [0.8, 0.62, 0.46, 0.32, 0.22],
      },
      range: { costs: [{ gold: 160, wood: 50 }, { gold: 240, wood: 75 }, { gold: 320, wood: 95 }], rangeFactor: [1.1, 1.2, 1.3] },
      // 1 : un canon de plus en batterie basse, 2 : en batterie haute, 3 : une pièce sur le château avant, 4 : basse,
      // 5 : haute ; grand galion, puis galion amiral : deux niveaux chacun, une pièce sur le pont et un canon de
      // batterie (basse, puis haute) à chaque niveau (voir galleonArmament).
      cannons: {
        costs: [
          { gold: 220, wood: 120 }, { gold: 280, wood: 160 }, { gold: 340, wood: 190 }, { gold: 410, wood: 230 }, { gold: 490, wood: 270 },
          { gold: 560, wood: 310 }, { gold: 640, wood: 360 }, { gold: 740, wood: 420 }, { gold: 840, wood: 480 },
        ],
        cannonsPerSide: [13, 14, 15, 16, 17, 19, 21, 23, 25],
      },
      hull: {
        costs: [{ gold: 80, wood: 80 }, { gold: 140, wood: 140 }, { gold: 200, wood: 200 }, { gold: 280, wood: 280 }],
        healthFactor: [1.1, 1.2, 1.3, 1.4],
      },
      // Grand galion, puis galion amiral : un niveau de voilure en plus chacun.
      sails: {
        costs: [{ gold: 110, wood: 30 }, { gold: 170, wood: 50 }, { gold: 240, wood: 70 }, { gold: 320, wood: 90 }, { gold: 410, wood: 115 }],
        speedFactor: [1.06, 1.12, 1.18, 1.24, 1.3],
      },
      hold: {
        costs: [{ gold: 120, wood: 70 }, { gold: 180, wood: 110 }, { gold: 250, wood: 160 }, { gold: 330, wood: 210 }, { gold: 420, wood: 270 }],
        capacity: [300, 390, 490, 600, 700],
      },
      nets: { costs: [], catchFactor: [] },
    },
    mass: { base: 720, perExtraCannon: 9, hull: [24, 50, 78, 108], sails: [10, 20, 30, 40, 50], hold: [16, 32, 50, 70, 90], speedLossPerUnit: 0.00025 },
    extensions: [
      {
        name: 'Grand galion',
        description: 'Le chantier rallonge la coque de quatre mètres au milieu : un sabord de plus par bord dans chaque batterie et deux pièces de plus sur le pont (deux niveaux de canons en plus), et des mâts plus hauts pour un niveau de voilure en plus.',
        cost: { gold: 5000, wood: 2500 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 120,
        extraLevels: { cannons: 2, sails: 1 },
      },
      {
        name: 'Galion amiral',
        description: 'Le chantier rallonge encore la coque de quatre mètres au milieu : un sabord de plus par bord dans chaque batterie et deux pièces de plus sur le pont (deux niveaux de canons en plus), un niveau de voilure, les meilleurs canonniers de la Marine (un niveau de précision et un de portée en plus) et des membrures doublées.',
        cost: { gold: 7000, wood: 3500 },
        length: 4,
        healthFactor: 1.15,
        speedFactor: 1.03,
        turnFactor: 0.92,
        mass: 130,
        extraLevels: { cannons: 2, sails: 1, accuracy: 1, range: 1 },
      },
    ],
  },
};
