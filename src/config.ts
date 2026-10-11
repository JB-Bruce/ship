// Toutes les valeurs de réglage du jeu. La logique lit ici : pas de nombres magiques ailleurs.
import type { ShipType } from './shipTypes';
import type { WeatherKind } from './world/weather';

export type Faction = 'player' | 'ally' | 'enemy';

/**
 * Voilure : une jauge de 0 (affalée) à 1 (pleine voile), qui fixe la fraction de vitesse max visée.
 * Le joueur la monte en maintenant Z et la baisse en maintenant S.
 */
export const SAIL = {
  /** Variation de la jauge par seconde de touche maintenue (0,5 = 2 s de 0 à 100 %). */
  changeRate: 0.5,
  /** Réglages utilisés par les IA. */
  half: 0.55,
  full: 1,
};

/** Canons d'un bateau (tous identiques). Les améliorations futures modifieront ces valeurs. */
export interface CannonStats {
  /** Portée maximale (m). */
  range: number;
  /** Temps de rechargement (s). */
  reloadTime: number;
  /** Demi-angle de la zone de tir, de part et d'autre de la perpendiculaire au flanc (rad). */
  arcHalfAngle: number;
  /** Écart d'angle maximal du tir (rad). */
  spread: number;
  /** Erreur de distance maximale (fraction) : le boulet tombe un peu court ou un peu long. */
  rangeError: number;
  damage: number;
  /** Vitesse horizontale du boulet (m/s). */
  ballSpeed: number;
}

/** Caractéristiques d'un bateau. Les améliorations futures modifieront ces valeurs. */
export interface ShipStats {
  /** Longueur de coque (m). Le modèle 3D est mis à l'échelle d'après elle. */
  length: number;
  /** Largeur de coque (m). */
  width: number;
  /** Vitesse à pleine voile (m/s). */
  maxSpeed: number;
  /** m/s² */
  acceleration: number;
  /** m/s² */
  deceleration: number;
  /** Vitesse de rotation barre à fond, à bonne vitesse (rad/s). */
  turnRate: number;
  /** Vitesse à laquelle la barre suit l'ordre (unités/s, barre ∈ [-1, 1]). */
  rudderSpeed: number;
  /** Gîte en virage (rad par rad/s de rotation et par m/s de vitesse). */
  turnHeel: number;
  maxHealth: number;
  cannonsPerSide: number;
  /** Canons principaux (ou de la batterie couverte, sur un navire à deux calibres). */
  cannon: CannonStats;
  /** Second calibre, pour les canons du pont supérieur d'un navire à deux calibres (corvette). */
  deckCannon?: CannonStats;
  /** Réactivité de la flottaison : un petit bateau léger suit l'eau plus vite qu'un gros. */
  buoyancy: {
    /** Raideur du ressort vertical (plus haut = colle plus à l'eau). */
    stiffness: number;
    /** Amortissement vertical (plus bas = rebondit plus). */
    damping: number;
    /** Vitesse à laquelle tangage et roulis suivent les vagues. */
    tiltResponse: number;
  };
}

// Les caractéristiques de chaque type de bateau (chaloupe, sloop…) sont dans src/shipTypes.ts.

/** Flottaison commune à tous les bateaux (les ressorts propres à chaque type sont dans shipTypes.ts). */
export const BUOYANCY = {
  /** Où la coque mesure la hauteur de l'eau, en fraction de longueur / largeur (plus le centre). */
  sampleLength: 0.45,
  sampleWidth: 0.8,
  /** Poids de la mesure sous le centre, face aux quatre autres (proue, poupe, flancs). */
  centerWeight: 2,
  /**
   * Écart (m) entre la coque et l'eau, au centre comme aux extrémités, à partir duquel le ressort se durcit fortement
   * (raideur × (1 + hardening) à cet écart) ; la butée est à hardLimit fois cet écart. Jamais sous l'eau ni en l'air.
   */
  maxOffset: 0.25,
  hardening: 8,
  hardLimit: 1.6,
  /** Amortissement du tangage et du roulis (1 = juste assez pour ne pas osciller). */
  tiltDamping: 0.8,
  /**
   * Inertie des gros navires : au-delà de heavyMass, tangage et roulis sont ralentis d'un facteur
   * (masse / heavyMass) ^ inertiaExponent (≈ 4,9 pour une frégate, 2,5 pour un brigantin, 1,6 pour un sloop ; rien ne
   * change pour la chaloupe). Ils ne suivent qu'une part de la vitesse de rotation de la vague (1 / facteur ^
   * followExponent), sont plus amortis (vers heavyTiltDamping) et leurs extrémités peuvent s'écarter davantage de l'eau
   * (maxOffset × facteur ^ offsetExponent) : une vague courte ne les fait plus basculer d'un bord à l'autre, la proue
   * reste levée ou plonge dans la vague. En grosse tempête, une frégate roule à ~4°/s (12° au plus) au lieu de 10°/s.
   */
  heavyMass: 150,
  inertiaExponent: 1.2,
  followExponent: 3,
  offsetExponent: 1.5,
  heavyTiltDamping: 1.1,
  /**
   * Au passage d'une crête pointue, la pente de l'eau bascule d'un coup : un navire lourd ne doit pas basculer avec elle.
   * Pour lui, le durcissement est divisé par son facteur d'inertie, la butée reculée d'autant, et sa vitesse de
   * tangage et de roulis plafonnée en douceur à maxTiltRate / facteur (rad/s : ~21°/s pour une frégate, ~65°/s pour un
   * sloop ; pas de plafond pour la chaloupe).
   */
  maxTiltRate: 1.8,
  /**
   * Au-delà de cette masse (la corvette), la masse compte moins pour l'inertie de tangage et de roulis : masse
   * effective = inertiaKneeMass × (masse / inertiaKneeMass) ^ inertiaKneeExponent. La frégate reste plus posée que la
   * corvette sans être lente à suivre la mer.
   */
  inertiaKneeMass: 420,
  inertiaKneeExponent: 0.3,
  /**
   * Pilonnement des gros navires : la coque ne suit qu'une part de la hauteur de l'eau, (heavyMass / masse) ^
   * heaveExponent (≈ 85 % pour une frégate, 88 % pour une corvette, 95 % pour un sloop) : elle fend un peu les crêtes et
   * reste plus haute dans les creux, et monte et descend d'autant moins vite (sans retard sur la vague).
   */
  heaveExponent: 0.12,
};

export const COMBAT = {
  gravity: 9.8,
  /** Durée du naufrage avant disparition (s). */
  sinkDuration: 7,
  /** Sous cette fraction de vie, un ennemi prend la fuite. */
  fleeHealth: 0.2,
  /** Un fuyard qui s'est réparé jusqu'à cette fraction de sa vie revient au combat. */
  rallyHealth: 0.8,
  /** Secousse de caméra quand le joueur est touché (0..1). */
  hitShake: 0.55,
  /** Délai aléatoire max (s) avant chaque tir d'un canon chargé et pointé : la bordée part en cascade, pas d'un bloc. */
  acquireDelay: 0.3,
};

/** Recul d'un coup de canon : le bateau roule (~2° pour une chaloupe, ~0,75° pour un brigantin), d'autant moins qu'il est lourd. */
export const RECOIL = {
  /** Vitesse de roulis donnée par un tir (rad/s) à un bateau de masse `referenceMass` (une chaloupe). */
  rollKick: 0.26,
  referenceMass: 100,
  /** Plus lourd = beaucoup moins secoué : le coup est divisé par (masse / referenceMass) puissance massExponent. */
  massExponent: 1.45,
  /**
   * Balancement après un tir : durée d'une oscillation (s) pour la masse de référence, allongée pour les bateaux
   * lourds (× (masse / referenceMass) puissance periodMassExponent), et amortissement (1 = revient sans osciller).
   */
  period: 1.5,
  periodMassExponent: 0.5,
  damping: 0.35,
  /** Pour un canon de proue, part du coup qui fait cabrer l'avant. */
  pitchShare: 0.3,
};

/** Dégâts visibles et leurs effets : voiles trouées, vitesse réduite, foyers de fumée puis de feu. */
export const DAMAGE = {
  /** Vitesse max perdue au plus fort des dégâts (fraction), atteinte à `fullDamageAt` de vie perdue. */
  maxSpeedLoss: 0.3,
  fullDamageAt: 0.9,
  /** Part de la toile trouée au plus fort des dégâts. */
  maxSailHoles: 0.45,
  /** Un foyer de plus tous les `fireStep` de vie perdue, à partir de `firstFire` de vie perdue ; il prend feu `ignite` plus loin. */
  firstFire: 0.15,
  fireStep: 0.15,
  ignite: 0.3,
  /** Émission par foyer (bouffées de fumée et flammèches par seconde). */
  smokeRate: 1.6,
  flameRate: 6,
};

/** Éperonnage : dégâts quand deux bateaux se percutent. */
/**
 * Éperonnage : un navire encaisse (vitesse de rapprochement − minSpeed) × damagePerSpeed × masse de l'autre / referenceMass
 * (masse avec blindage et canons). Une frégate lancée à pleine vitesse coule un sloop d'un seul choc ; une chaloupe ne
 * fait qu'érafler. Celui qui frappe de la proue n'en encaisse que bowFactor.
 */
export const RAM = {
  /** Vitesse de rapprochement en dessous de laquelle le choc est inoffensif (m/s). */
  minSpeed: 2,
  /** Dégâts par m/s au-delà de minSpeed, infligés par un navire de referenceMass (un sloop). */
  damagePerSpeed: 10,
  referenceMass: 220,
  /** Celui qui frappe avec sa proue encaisse moins. */
  bowFactor: 0.35,
  /** Délai minimal entre deux chocs pour un même bateau (s). */
  cooldown: 1,
  /**
   * Vitesse conservée après un choc entre deux navires de même masse (fraction) ; le plus lourd en garde davantage, le
   * plus léger moins (et c'est lui qui est repoussé).
   */
  speedKept: 0.5,
};

export const LOOT = {
  cratesPerWreck: [2, 4] as const,
  goldPerCrate: [5, 12] as const,
  /** Paquets de planches flottantes laissés par une épave, et bois par paquet. */
  woodBundlesPerWreck: [2, 3] as const,
  woodPerBundle: [3, 5] as const,
  /** Rhum et épices : chance par épave (multipliée par le butin du navire à la puissance `rareFactorExponent`). */
  rumChance: 0.12,
  rumPerBarrel: [2, 4] as const,
  spicesChance: 0.06,
  spicesPerCrate: [1, 3] as const,
  rareFactorExponent: 0.75,
  /** Un bateau ramasse le butin à moins de cette distance de sa coque (contour de sa longueur et de sa largeur, m). */
  pickupMargin: 3,
  /** Les caisses coulent au bout de ce temps (s). */
  lifetime: 90,
  /** Part de l'or perdue quand le joueur coule. */
  deathGoldLoss: 0.25,
};

export interface Cost {
  gold: number;
  wood: number;
}

/** Réparation hors combat (tous les bateaux, ennemis compris). */
export const REPAIR = {
  /** Secondes sans tirer ni être touché avant de commencer à réparer. */
  delay: 8,
  /** Vie rendue par seconde, en fraction de la vie max. */
  rate: 0.02,
};

/**
 * Équipage animé sur les ponts (deckCrew/) : barreur, vigie et matelots qui flânent, servent les canons à découvert en
 * combat, halent les cordages quand la voilure change, réparent après le combat, tombent à l'eau sous les coups.
 */
export const DECK_CREW = {
  /** Au-delà de cette distance de la caméra (m), l'équipage n'est ni animé ni dessiné. */
  drawDistance: 120,
  /** Marins au plus dans le monde (taille des lots de dessin). */
  maxSailors: 400,
  /** Matelots à bord (en plus du barreur et de la vigie), et en plus à chaque allongement du navire. */
  hands: { sloop: 3, brigantine: 5, corvette: 7, frigate: 10 },
  handsPerExtension: { brigantine: 2, corvette: 3, frigate: 3 },
  walkSpeed: 1.1,
  runSpeed: 3,
  /** Pause d'un matelot entre deux promenades (s). */
  idle: [3, 9] as const,
  /** Un navire est en combat s'il a tiré ou été touché depuis moins de ce temps (s), ou si un ennemi est à moins de combatRange (m). */
  combatCalm: 10,
  combatRange: 220,
  /** Manœuvre : matelots aux cordages, et le temps qu'ils y restent après un changement de voilure (s). */
  ropeHands: 2,
  ropeTime: 3.5,
  /** Matelots qui réparent après le combat, tant que le navire est abîmé. */
  repairHands: 2,
  /** Part des matelots encore sur le pont quand le navire est presque coulé (les autres sont tombés à l'eau). */
  minCrew: 0.35,
  /** Délai entre deux matelots qui remontent sur le pont quand le navire se répare (s). */
  returnDelay: 4,
  /** Recul d'un canonnier quand sa pièce tire (m), et distance derrière la culasse où il se tient (m). */
  recoil: 0.35,
  gunnerOffset: 0.85,
  /** Chemises : pirates (blanc, rouge, brun), marine royale (blanc, bleu) ; chance de porter le tricorne plutôt que le bandana. */
  shirts: { player: [0xe8e2d0, 0x9b2d20, 0x6b5a3a], ally: [0xe8e2d0, 0x9b2d20, 0x6b5a3a], enemy: [0xe8e2d0, 0x2c4466] },
  tricorn: { player: 0.3, ally: 0.3, enemy: 0.85 },
};

/**
 * Ce que modifient les officiers, le rang et les types de canons : des fractions qui s'additionnent (+0,1 = +10 %),
 * puis s'appliquent en facteurs (1 + somme). health / speed / turn / reload / spread / range / damage modifient les
 * caractéristiques ; les autres sont lus là où ils servent (réparation, butin, cale, éperonnage, dégâts reçus, effet
 * du vent, portée du radar).
 */
export const MODIFIER_KEYS = ['health', 'speed', 'turn', 'reload', 'spread', 'range', 'damage', 'repair', 'loot', 'hold', 'ram', 'damageTaken', 'wind', 'radar'] as const;
export type ModifierKey = (typeof MODIFIER_KEYS)[number];
export type StatEffect = Partial<Record<ModifierKey, number>>;

export type OfficerRole = 'gunner' | 'boatswain' | 'carpenter' | 'navigator' | 'quartermaster' | 'masterAtArms';
export type OfficerTrait = 'lynx' | 'oldSalt' | 'ironArm' | 'resourceful' | 'lucky' | 'hothead' | 'cautious' | 'sharpshooter';

/** Officiers de bord : recrutés à la taverne, affectés à un navire (places selon son type), ils progressent en combattant. */
export const OFFICERS = {
  /** Places d'officiers par type de navire. */
  slots: { rowboat: 0, longboat: 1, sloop: 1, brigantine: 2, corvette: 2, frigate: 3 } as Record<ShipType, number>,
  /** Fonctions : nom, symbole, et effet par étoile de talent. */
  roles: {
    gunner: { name: 'Canonnier', icon: '💥', perStar: { reload: -0.04, spread: -0.05 } },
    boatswain: { name: 'Maître d’équipage', icon: '⛵', perStar: { speed: 0.03, turn: 0.05 } },
    carpenter: { name: 'Charpentier', icon: '🔨', perStar: { health: 0.05, repair: 0.25 } },
    navigator: { name: 'Navigateur', icon: '🧭', perStar: { wind: 0.1, radar: 0.06 } },
    quartermaster: { name: 'Quartier-maître', icon: '💰', perStar: { loot: 0.06, hold: 0.06 } },
    masterAtArms: { name: 'Maître d’armes', icon: '⚔', perStar: { ram: 0.1, damageTaken: -0.03 } },
  } as Record<OfficerRole, { name: string; icon: string; perStar: StatEffect }>,
  /** Traits (parfois, en plus de la fonction). */
  traits: {
    lynx: { name: 'Œil de lynx', effect: { spread: -0.08 } },
    oldSalt: { name: 'Vieux loup de mer', effect: { speed: 0.04 } },
    ironArm: { name: 'Bras de fer', effect: { damage: 0.08 } },
    resourceful: { name: 'Débrouillard', effect: { repair: 0.3 } },
    lucky: { name: 'Chanceux', effect: { loot: 0.1 } },
    hothead: { name: 'Tête brûlée', effect: { ram: 0.2 } },
    cautious: { name: 'Prudent', effect: { damageTaken: -0.06 } },
    sharpshooter: { name: 'Tireur d’élite', effect: { range: 0.06 } },
  } as Record<OfficerTrait, { name: string; effect: StatEffect }>,
  traitChance: 0.35,
  /** Talent d'une recrue : [étoiles, probabilité cumulée]. Talent maximal après progression. */
  talent: [[1, 0.55], [2, 0.88], [3, 1]] as const,
  maxTalent: 5,
  /** Victoires de son navire depuis son embarquement qui lui donnent +1 puis +2 étoiles. */
  xpForStar: [12, 30],
  /** Prix d'engagement (or) selon le talent (1 à 3 étoiles), × traitPrice avec un trait. */
  price: [120, 300, 600],
  traitPrice: 1.4,
  /** Candidats par taverne, renouvelés à chaque journée (CONTRACTS.dayLength). */
  candidates: 3,
  firstNames: ['Jacques', 'Anne', 'Thomas', 'Marie', 'Pierre', 'Samuel', 'Jeanne', 'Henri', 'Louis', 'Grace', 'William', 'Diego', 'Nicolas', 'Benjamin', 'Isabeau', 'Mathurin', 'Olivier', 'Rose'],
  lastNames: ['Le Borgne', 'Morgan', 'Duval', 'Barbe-Grise', 'Lafitte', 'Main-de-Fer', 'Le Breton', 'La Rousse', 'Cœur-de-Chêne', 'Bonnet', 'Lagrange', 'Fer-Blanc', 'Le Normand', 'Sans-Peur', 'Dutertre', 'Mainvielle'],
  /** Officiers uniques, gagnés en réussissant une mission spéciale (son identifiant). */
  unique: [
    { special: 'crownFleet', name: 'Mary Read', role: 'masterAtArms', talent: 3, trait: 'hothead' },
    { special: 'sabreSiege', name: 'Israel Hands', role: 'gunner', talent: 3, trait: 'lynx' },
    { special: 'fortuneAtRisk', name: 'Esteban le Borgne', role: 'navigator', talent: 3, trait: 'oldSalt' },
  ] as readonly { special: string; name: string; role: OfficerRole; talent: number; trait: OfficerTrait }[],
};

export type GunType = 'standard' | 'long' | 'carronade';

/**
 * Types de canons d'une batterie (la frégate choisit pour sa batterie et pour ses canons de gaillard) : facteurs de
 * portée, de dégâts et de rechargement, et allure du fût (longueur, grosseur). Les boulets vont plus ou moins vite
 * selon la portée (racine du facteur, comme l'amélioration de portée).
 */
export const GUNS = {
  types: {
    standard: { name: 'Canons', description: 'Équilibrés : ni bonus ni malus.', range: 1, damage: 1, reload: 1, look: { length: 1, girth: 1 } },
    long: { name: 'Canons longs', description: 'Portée +30 %, rechargement +15 %.', range: 1.3, damage: 1, reload: 1.15, look: { length: 1.4, girth: 0.88 } },
    carronade: { name: 'Caronades', description: 'Rechargement −30 %, portée −40 %.', range: 0.6, damage: 1, reload: 0.7, look: { length: 0.6, girth: 1.3 } },
  } as Record<GunType, { name: string; description: string; range: number; damage: number; reload: number; look: { length: number; girth: number } }>,
  /** Prix du premier passage d'une batterie à un type, selon le navire ; revenir à un type déjà acheté est gratuit. */
  cost: {
    rowboat: { gold: 40, wood: 20 },
    longboat: { gold: 60, wood: 30 },
    sloop: { gold: 120, wood: 60 },
    brigantine: { gold: 200, wood: 100 },
    corvette: { gold: 300, wood: 150 },
    frigate: { gold: 400, wood: 200 },
  } as Record<ShipType, Cost>,
  /** Les canons de gaillard (second calibre) coûtent cette part du prix. */
  deckCostFactor: 0.5,
};

/**
 * Rang d'un navire selon ses victoires (coups fatals) : un drapeau noir à étoiles dorées flotte à sa poupe dès le rang
 * de vétéran. Chaque étoile : vie +4 %, précision +4 %, rechargement −4 %.
 */
export const RANKS = {
  levels: [
    { name: 'Recrue', kills: 0 },
    { name: 'Vétéran', kills: 15 },
    { name: 'Élite', kills: 50 },
    { name: 'Légende', kills: 100 },
  ],
  perStar: { health: 0.04, spread: -0.04, reload: -0.04 } as StatEffect,
};

/** Flotte du joueur (menu T). */
export const FLEET = {
  /** Places au départ, et maximum atteignable. */
  startSlots: 3,
  maxSlots: 6,
  /** Prix de chaque place supplémentaire (4e, 5e, 6e). */
  slotPrices: [500, 1200, 2500],
  /** Part du prix (bateau + améliorations) rendue à la revente. */
  sellRatio: 0.5,
  /** Délai avant que le bateau piloté qui coule passe la barre à un autre (s). */
  switchDelay: 2.5,
  /** Écart entre deux bateaux en formation (m). */
  spacing: 18,
  /** Escorte : écart entre la coque du navire protégé et celle de chacun de ses gardes (m). */
  guardGap: 12,
};

/** Formations proposées dans le menu de flotte. */
export const FORMATION_NAMES = {
  line: 'Ligne',
  column: 'Colonne',
  vee: 'En V',
  free: 'Libre',
};

/** Comportement des bateaux de la flotte que le joueur ne pilote pas. */
export const ALLY = {
  /** Ils attaquent les ennemis à moins de cette distance d'eux (m)… */
  engageRadius: 160,
  /** …tant qu'ils restent à moins de cette distance du bateau piloté (m). */
  leash: 260,
  /** Marge latérale à garder en croisant un navire ami, en plus de la demi-longueur moyenne (m). */
  clearance: 3,
  /** Ils évitent un ami s'ils vont le percuter dans moins de ce délai (s). */
  lookahead: 3,
  /** Voile réduite à ce niveau quand ils sont au contact d'un ami en l'évitant (assez pour pouvoir virer). */
  dodgeSail: 0.3,
  /** Voile minimale pour rejoindre sa place : un bateau arrêté ne peut pas tourner. */
  minSail: 0.35,
  /** Hors combat, un suiveur va ramasser le butin qui flotte à moins de cette distance de lui (m). */
  lootRange: 80,
  /** Poste fixe (pêche) : arrivé à moins de cette distance, il affale (m) ; voile minimale pour s'y rendre. */
  stationTolerance: 5,
  stationSail: 0.2,
};

/** Pêche : bancs de poissons en mer, pêchés par les chaloupes et les sloops presque à l'arrêt. */
export const FISHING = {
  /** Nombre de bancs en mer en même temps. */
  schools: [2, 3] as const,
  /** Poissons dans un banc. */
  fish: [30, 60] as const,
  /** Distance à la côte de l'île où un banc peut apparaître (m). */
  coastDistance: [100, 600] as const,
  /** Écart minimal entre deux bancs (m). */
  spacing: 150,
  /** Un banc plonge (disparaît) au bout de ce temps s'il n'est pas épuisé (s). */
  lifetime: [360, 600] as const,
  /** Délai avant qu'un nouveau banc apparaisse quand il en manque (s). */
  respawnDelay: [20, 45] as const,
  /** Durée du fondu d'apparition et de disparition d'un banc (s). */
  fadeTime: 3,
  /** Rayon du banc (m) : remous, poissons qui sautent, zone de pêche. */
  radius: 13,
  /** La commande « Pêcher » apparaît à moins de cette distance du centre d'un banc (m). */
  orderRange: 30,
  /** Le bateau piloté qui s'éloigne au-delà de cette distance du banc arrête la pêche (m). */
  leaveRange: 60,
  /** Il faut être presque à l'arrêt pour pêcher (m/s). */
  maxSpeed: 1.5,
  /** Un poisson pêché par navire toutes les … (s). */
  catchInterval: 1.5,
  /** Un ennemi à moins de cette distance (réduite par le temps, comme le repérage) arrête la pêche (m). */
  enemyRange: 260,
  /** Postes des alliés qui pêchent : sur un cercle autour du centre du banc (m). */
  stationRadius: 9,
  /** Poissons qui sautent et mouettes qui tournent au-dessus de chaque banc. */
  jumpers: 6,
  gulls: 4,
  gullHeight: [9, 15] as const,
};

/** Vent : direction et force varient lentement, la force dans une plage fixée par le temps qu'il fait (WeatherProfile). */
export const WIND = {
  /** Force de référence (nœuds) : un vent de cette force vaut 1 (effet sur la vitesse, pavillons, pluie inclinée). */
  referenceKnots: 20,
  /** Plage de force par beau temps (nœuds). */
  clearKnots: [3, 20] as const,
  /** Effet sur la vitesse par unité de force : vent arrière = +25 %, vent de face = −25 % à 20 nœuds… */
  effectPerStrength: 0.25,
  /** … plafonné, pour que le grand vent et la tempête restent jouables. */
  maxEffect: 0.4,
};

/** Couleurs d'un bateau selon son camp. */
export interface Livery {
  hull: number;
  hullInside: number;
  trim: number;
  sail: number;
  /** Couleur des pièces rapiécées de la voile, ou null pour une voile neuve. */
  sailPatch: number | null;
  flag: 'skull' | 'crown' | 'redSkull' | 'ghostSkull';
  /** Couronne dorée de la Marine peinte sur la plus grande voile. */
  sailEmblem?: boolean;
  /** Couleur des fanaux (orangée par défaut). */
  lantern?: number;
  /** Voiles en lambeaux même intactes : dégâts visibles minimaux (0..1). */
  tattered?: number;
}

/** Livrée des navires ennemis d'élite : coque noire, liseré rouge, voiles blanches frappées de la couronne de la Marine. */
export const ELITE_LIVERY: Livery = { hull: 0x1d1d22, hullInside: 0x4a3426, trim: 0xb3261c, sail: 0xf4f1e8, sailPatch: null, flag: 'crown', sailEmblem: true };

/** Livrée des sloops marchands escortés : coque brune, liseré doré, voiles rapiécées, pavillon des Frères du Sabre. */
export const MERCHANT_LIVERY: Livery = { hull: 0x5e3f26, hullInside: 0x6b4a30, trim: 0xc9a227, sail: 0xe6d8b4, sailPatch: 0xc2a874, flag: 'skull' };

/** Livrée de La Veuve Noire (boss pirate) : coque et voiles noires, liseré rouge sang, tête de mort rouge. */
export const WIDOW_LIVERY: Livery = { hull: 0x141417, hullInside: 0x3a2a20, trim: 0x6e1410, sail: 0x1c1c21, sailPatch: null, flag: 'redSkull' };

/** Livrée du Spectre (boss du brouillard) : coque gris-noir délavée, voiles grises en lambeaux, fanaux verdâtres. */
export const SPECTRE_LIVERY: Livery = {
  hull: 0x2c3032,
  hullInside: 0x3b3833,
  trim: 0x56635c,
  sail: 0x8f948d,
  sailPatch: null,
  flag: 'ghostSkull',
  lantern: 0x8dffb0,
  tattered: 0.6,
};

export const LIVERIES: Record<Faction, Livery> = {
  player: { hull: 0x4a3020, hullInside: 0x6b4a30, trim: 0x2a1c12, sail: 0xe3d3ae, sailPatch: 0xbfa77a, flag: 'skull' },
  ally: { hull: 0x2f4f36, hullInside: 0x6b4a30, trim: 0x1f2a1c, sail: 0xe8e0c8, sailPatch: 0xc9bc96, flag: 'skull' },
  enemy: { hull: 0x2c4466, hullInside: 0x6b4a30, trim: 0xd9b44a, sail: 0xf4f1e8, sailPatch: null, flag: 'crown' },
};

export const ENEMIES = {
  /** Nombre max d'ennemis en même temps : [victoires à partir desquelles, maximum]. */
  maxAlive: [
    [0, 3],
    [5, 4],
    [12, 5],
    [20, 6],
    [30, 8],
  ] as const,
  /** Délai avant le premier ennemi (s). */
  firstSpawnDelay: 4,
  /** Délai entre deux apparitions, tant qu'on est sous le maximum (s) : il raccourcit jusqu'à fastSpawnInterval à fastSpawnKills victoires. */
  spawnInterval: [6, 12] as const,
  fastSpawnInterval: [4, 8] as const,
  fastSpawnKills: 30,
  /**
   * Flottilles : à partir de fromKills victoires, une apparition sur quatre est un groupe de size navires ;
   * à partir de bigFromKills, jusqu'à bigSize, mené par un navire plus gros. Écart entre deux places (m).
   */
  flotilla: { fromKills: 5, chance: 0.25, size: [2, 3] as const, bigFromKills: 15, bigSize: [2, 4] as const, spacing: 18, slotTolerance: 8 },
  /**
   * Navires d'élite (voiles noires) : de plus en plus fréquents à partir de fromKills victoires
   * (+chancePerKill par victoire, jusqu'à maxChance ; doublé pour un chef de flottille). Multiplicateurs de stats et de butin.
   */
  elite: { fromKills: 10, chancePerKill: 0.0125, maxChance: 0.5, leaderBonus: 2, health: 1.4, damage: 1.3, reload: 0.85, spread: 0.7, loot: 2 },
  /** Distance d'apparition autour du joueur (m) : dans la brume, mais déjà sur le radar. */
  spawnDistance: 380,
  /** Au-delà, l'ennemi est retiré (m). */
  despawnDistance: 900,
  /** Distance à laquelle un ennemi repère le joueur (m). */
  detectionRange: 300,
  /** Distance à laquelle il perd le joueur de vue (m). */
  loseRange: 480,
  /** Distance de combat visée, flanc à flanc (m). */
  engageRange: 60,
  /**
   * Types d'ennemis selon le nombre d'ennemis déjà coulés : on commence contre des barques,
   * les chaloupes arrivent à partir de 5 victoires, les sloops à partir de 12, les brigantins à partir de 20,
   * les corvettes à partir de 35.
   * Poids relatifs (un type absent d'une étape n'apparaît pas).
   */
  composition: [
    { minKills: 0, weights: { rowboat: 1, longboat: 0, sloop: 0 } },
    { minKills: 5, weights: { rowboat: 0.5, longboat: 0.5, sloop: 0 } },
    { minKills: 12, weights: { rowboat: 0.25, longboat: 0.5, sloop: 0.25 } },
    { minKills: 20, weights: { rowboat: 0.15, longboat: 0.4, sloop: 0.3, brigantine: 0.15 } },
    { minKills: 35, weights: { rowboat: 0.1, longboat: 0.3, sloop: 0.3, brigantine: 0.2, corvette: 0.1 } },
    { minKills: 50, weights: { rowboat: 0.05, longboat: 0.2, sloop: 0.3, brigantine: 0.2, corvette: 0.15, frigate: 0.1 } },
  ],
  /** Passes d'attaque (barques) : distance où l'on dégage (m), angle (rad) et durée (s) du dégagement. */
  veerDistance: 28,
  veerAngle: 1.9,
  veerTime: 4,
  /**
   * Nombre d'ennemis coulés à partir duquel les nouveaux ennemis sont souvent très améliorés.
   * Avant, la probabilité de chaque niveau d'amélioration monte progressivement.
   */
  killsForFullThreat: 20,
  /** Butin supplémentaire par niveau d'amélioration de l'ennemi (fraction). */
  lootPerUpgradeLevel: 0.12,
};

export type BossId = 'widow' | 'spectre';

/**
 * Un boss : un navire du joueur (pas la version ennemie affaiblie) avec toutes ses améliorations au maximum, plus des
 * bonus. Il surgit une fois par épisode de son temps (grosse tempête, brouillard), à la limite de la visibilité, et ne
 * fuit jamais ; quand ce temps se lève, il s'éloigne et disparaît (et revient intact la fois suivante).
 */
export interface BossDef {
  name: string;
  /** Accord des textes (« coulée » ou « coulé »). */
  feminine: boolean;
  /** Ce qu'en racontent les tavernes (prime, registre). */
  rumor: string;
  /** Légende de son pavillon dans le registre. */
  trophy: string;
  type: ShipType;
  livery: Livery;
  /** Le temps qui le fait surgir, et la force de ce temps à partir de laquelle le compte à rebours commence (0..1). */
  weather: WeatherKind;
  minLevel: number;
  /** Début du message quand ce temps se lève. */
  calm: string;
  /** Délai d'apparition une fois le temps installé (s). */
  delay: readonly [number, number];
  /** Distance d'apparition : juste au-delà de la brume (m). */
  spawnDistance: number;
  /** Bonus de vie, de dégâts, de rechargement, d'imprécision et de vitesse. */
  health: number;
  damage: number;
  reload: number;
  spread: number;
  speed: number;
  /** Multiplicateur de butin, en plus de celui de son type. */
  loot: number;
  /** En partance : il disparaît au-delà de cette distance du bateau piloté (m). */
  vanishDistance: number;
  /** Sa barre de vie s'affiche en haut de l'écran en deçà de cette distance (m), s'il n'est pas caché. */
  barRange: number;
  /** Acharné : il fonce et se bat jusqu'au bout. Harcèlement : voir HARASS. */
  tactic: 'relentless' | 'harass';
}

export const BOSSES: Record<BossId, BossDef> = {
  /** La Veuve Noire : une corvette aux voiles noires, par grosse tempête. */
  widow: {
    name: 'La Veuve Noire',
    feminine: true,
    rumor: 'la corvette noire qui rôde par grosse tempête',
    trophy: 'Arraché à la corvette noire au cœur de la tempête',
    type: 'corvette',
    livery: WIDOW_LIVERY,
    weather: 'tempest',
    minLevel: 0.85,
    calm: 'La tempête se calme',
    delay: [30, 60],
    spawnDistance: 210,
    health: 1.5,
    damage: 1.2,
    reload: 1,
    spread: 1,
    speed: 1,
    loot: 6,
    vanishDistance: 260,
    barRange: 280,
    tactic: 'relentless',
  },
  /** Le Spectre : un brigantin fantôme, rapide, qui harcèle la flotte dans le brouillard. */
  spectre: {
    name: 'Le Spectre',
    feminine: false,
    rumor: 'le brigantin fantôme qui hante le brouillard',
    trophy: 'Arraché au brigantin fantôme, au fond du brouillard',
    type: 'brigantine',
    livery: SPECTRE_LIVERY,
    weather: 'fog',
    minLevel: 0.9,
    calm: 'Le brouillard se lève',
    delay: [30, 60],
    spawnDistance: 160,
    health: 1.5,
    damage: 1,
    reload: 1,
    spread: 1,
    speed: 1.15,
    loot: 6,
    vanishDistance: 200,
    barRange: 140,
    tactic: 'harass',
  },
};
export const BOSS_IDS = Object.keys(BOSSES) as BossId[];

/**
 * Harcèlement (Le Spectre) : il surgit de la brume, lâche ses bordées un moment, puis replonge dans le brouillard hors
 * de vue (et du radar), tourne autour de sa proie et revient sous un autre angle.
 */
export const HARASS = {
  /** Durée d'une attaque, comptée à moins de strikeRange × ENEMIES.engageRange de sa proie, avant de replonger dans la brume (s). */
  strikeTime: [12, 18] as const,
  strikeRange: 1.6,
  /** Dégâts reçus pendant une attaque qui le font replonger aussitôt (fraction de sa vie max). */
  hitLimit: 0.12,
  /** Distance à sa proie où il se cache, bien au-delà de la brume (m). */
  hideDistance: 150,
  /** Au-delà de cette distance de sa proie, en retraite, il disparaît du radar (m). */
  radarHidden: 90,
  /** Angle dont il tourne autour de sa proie, caché, avant de revenir (rad). */
  circleAngle: [1.2, 2.2] as const,
};

/**
 * Contrats de la taverne : missions à accepter, primes touchées à la taverne une fois remplies. Chaque taverne a ses
 * offres du jour (renouvelées chaque journée, adaptées à ta flotte) et ses missions spéciales (SPECIAL_CONTRACTS).
 */
export const CONTRACTS = {
  /** Offres du jour affichées dans chaque taverne, et contrats acceptés en même temps au plus (toutes tavernes). */
  offers: 3,
  maxActive: 4,
  /** Une journée (s de jeu, hors pause) : à chaque nouvelle journée, les offres du jour non acceptées sont remplacées. */
  dayLength: 600,
  /** Missions spéciales affichées en même temps dans une taverne ; leur prime vaut celle d'une offre du jour × specialReward. */
  specialsShown: 2,
  specialReward: 2,
  /**
   * Difficulté en étoiles (1 à 5) : les offres du jour sont tirées autour du niveau de ta flotte (`fleetLevel`) : ce
   * niveau ou une étoile de moins, et une fois sur cinq une de plus. Les primes « fixes » sont multipliées selon les
   * étoiles (`starReward`).
   */
  stars: 5,
  starReward: [1, 1.6, 2.3, 3.1, 4],
  /** Niveau de ta flotte : somme des tailles de tes navires (chaloupe 1 … frégate 6) divisée par ce nombre. */
  fleetLevelDivisor: 3.5,
  /** Écart d'étoiles autour du niveau : [écart, probabilité cumulée]. */
  starSpread: [[-1, 0.4], [0, 0.8], [1, 1]] as const,

  /** Couler N navires, quels qu'ils soient : N = 2 + étoiles (+0 à 2). */
  sink: { gold: 60, wood: 12 },
  /** Couler des navires d'un type : plus d'étoiles = un type plus gros. */
  sinkType: { count: [2, 4] as const, gold: 80, wood: 20 },
  /** Couler des élites : 1, 1, 2, 2, 3 selon les étoiles. */
  sinkElite: { count: [1, 1, 2, 2, 3], gold: 120, wood: 30 },
  /** Livrer du poisson à la taverne : 10 par étoile (+0 à 10), bien mieux payé qu'au marché. */
  deliverFish: { perStar: 10, goldPerFish: 5 },
  /** Primes sur les boss (missions spéciales). */
  sinkBoss: { widow: { gold: 600, wood: 150 }, spectre: { gold: 450, wood: 110 } } as Record<BossId, Cost>,

  /**
   * Convois, selon les marchés : une île propose d'amener ce qu'elle vend là où ça se revend plus cher (la Tortue : rhum
   * pour Port-Sabre ; Port-Sabre : épices pour la Tortue). Par marchandise : unités par étoile, prime par unité livrée.
   */
  convoy: {
    rum: { perStar: 5, goldPerUnit: 22, title: 'Convoi de rhum' },
    spices: { perStar: 4, goldPerUnit: 24, title: 'Convoi d’épices' },
  } as Partial<Record<TradeGood, { perStar: number; goldPerUnit: number; title: string }>>,
  /** Chasse à un capitaine de la Marine (élite) et son escorte, dans une zone de la carte. Par étoile (1 à 5) : */
  hunt: {
    gold: 200,
    wood: 50,
    captain: ['longboat', 'sloop', 'sloop', 'brigantine', 'corvette'] as const,
    escorts: [[0, 1], [1, 1], [2, 2], [2, 2], [3, 3]] as const,
    escortMin: ['rowboat', 'longboat', 'longboat', 'sloop', 'sloop'] as const,
    /** Zone de chasse : distance de son centre à l'île qui offre la prime (m) et rayon (m). */
    distance: [500, 800] as const,
    radius: 160,
    /** Capitaines des offres du jour (ceux des missions spéciales ont leur propre nom). */
    names: ['Capitaine Hawkins', 'Capitaine Drake', 'Commodore Lyle', 'Capitaine Benbow', 'Lieutenant Groves', 'Capitaine Ward'],
  },
  /** Défense d'un port : une escadre de la Marine attaque son fort après un délai (s). Par étoile : */
  defend: {
    gold: 250,
    wood: 70,
    delay: 40,
    squadron: [3, 4, 4, 5, 6],
    leader: ['sloop', 'sloop', 'brigantine', 'brigantine', 'corvette'] as const,
    followerMin: ['longboat', 'longboat', 'sloop', 'sloop', 'sloop'] as const,
    /** Distance d'apparition (m) depuis le fort. */
    distance: 480,
    /** Les assiégeants bombardent à cette distance du fort (m) ; une proie plus proche les détourne. */
    standoff: 95,
    engageRadius: 160,
  },
  /** Escorte d'un sloop marchand d'un port à un autre. Par étoile : embuscades en route, réparties sur le trajet. */
  escort: {
    gold: 180,
    wood: 40,
    ambushes: [0, 1, 1, 2, 2],
    ambushSize: [0, 2, 3, 2, 3],
    ambushLeader: ['sloop', 'sloop', 'sloop', 'sloop', 'brigantine'] as const,
    ambushMin: ['longboat', 'longboat', 'longboat', 'sloop', 'sloop'] as const,
    /** Distance devant le marchand où surgit une embuscade (m). */
    ambushDistance: 320,
  },
};

/**
 * Une mission spéciale : unique (une fois réussie, elle ne revient jamais), dans la liste fixe d'une île. Ce qu'elle
 * demande remplace les tables par étoile des offres du jour.
 */
export interface SpecialContractDef {
  readonly id: string;
  readonly kind: 'hunt' | 'deliver' | 'defend' | 'escort' | 'sinkBoss';
  readonly stars: number;
  readonly title: string;
  readonly description: string;
  /** Chasse, défense : l'escadre, son chef (d'élite) d'abord. */
  readonly squadron?: readonly ShipType[];
  /** Chasse : nom du capitaine. */
  readonly captain?: string;
  /** Escorte : embuscades en route, et île visée. */
  readonly ambushes?: number;
  readonly to?: IslandId;
  /** Livraison à cette taverne : marchandise et quantité. */
  readonly good?: 'fish' | 'rum' | 'spices';
  readonly amount?: number;
  readonly boss?: BossId;
}

/** Missions spéciales de chaque île, dans l'ordre : CONTRACTS.specialsShown à la fois, la suivante après une réussite. */
export const SPECIAL_CONTRACTS: Record<IslandId, readonly SpecialContractDef[]> = {
  tortuga: [
    {
      id: 'morrow',
      kind: 'hunt',
      stars: 2,
      title: 'Le lieutenant Morrow',
      captain: 'Lieutenant Morrow',
      squadron: ['sloop', 'longboat'],
      description: 'Le lieutenant Morrow (sloop d’élite) et son escorte traquent les pêcheurs de la Tortue. Leur zone sera marquée sur ta carte (M). Coule son navire.',
    },
    {
      id: 'banquet',
      kind: 'deliver',
      stars: 3,
      title: 'La grande pêche',
      good: 'fish',
      amount: 80,
      description: 'Les Frères de la Côte préparent un banquet : livre 80 poissons à la taverne (ils doivent être dans tes cales).',
    },
    {
      id: 'vane',
      kind: 'hunt',
      stars: 4,
      title: 'Commodore Vane',
      captain: 'Commodore Vane',
      squadron: ['brigantine', 'sloop', 'sloop'],
      description: 'Le commodore Vane (brigantin d’élite) et deux sloops patrouillent au large. Leur zone sera marquée sur ta carte (M). Coule son navire.',
    },
    {
      id: 'crownFleet',
      kind: 'defend',
      stars: 4,
      title: 'La flotte de la Couronne',
      squadron: ['brigantine', 'brigantine', 'sloop', 'sloop', 'sloop', 'longboat'],
      description: 'Six navires de la Marine marchent sur la Tortue. Ils attaqueront le fort 40 s après ton accord : coule-les tous avant qu’il ne tombe. Prime versée sur-le-champ.',
    },
    { id: 'widowBounty', kind: 'sinkBoss', stars: 5, boss: 'widow', title: 'Prime sur La Veuve Noire', description: 'Coule La Veuve Noire, la corvette noire qui rôde par grosse tempête.' },
  ],
  sabre: [
    {
      id: 'brothersRum',
      kind: 'deliver',
      stars: 2,
      title: 'Le rhum des Frères',
      good: 'rum',
      amount: 30,
      description: 'Les Frères du Sabre ont soif : rapporte 30 tonneaux de rhum de la Tortue à la taverne de Port-Sabre.',
    },
    {
      id: 'rackham',
      kind: 'hunt',
      stars: 3,
      title: 'Capitaine Rackham',
      captain: 'Capitaine Rackham',
      squadron: ['brigantine', 'sloop'],
      description: 'Le capitaine Rackham (brigantin d’élite), chasseur de pirates, rôde avec un sloop. Leur zone sera marquée sur ta carte (M). Coule son navire.',
    },
    {
      id: 'fortuneAtRisk',
      kind: 'escort',
      stars: 4,
      title: 'La Fortune en péril',
      ambushes: 3,
      to: 'tortuga',
      description: 'La Fortune emporte le trésor des Frères vers la Tortue, et la Marine lui tend trois embuscades. Protège-la jusqu’au port. Prime versée à l’arrivée.',
    },
    {
      id: 'sabreSiege',
      kind: 'defend',
      stars: 4,
      title: 'Le siège de Port-Sabre',
      squadron: ['corvette', 'brigantine', 'sloop', 'sloop', 'sloop', 'longboat'],
      description: 'Une escadre de six navires, une corvette en tête, assiégera la citadelle 40 s après ton accord. Coule-la avant que les remparts ne tombent. Prime versée sur-le-champ.',
    },
    { id: 'spectreBounty', kind: 'sinkBoss', stars: 5, boss: 'spectre', title: 'Prime sur Le Spectre', description: 'Coule Le Spectre, le brigantin fantôme qui hante le brouillard.' },
  ],
};

/**
 * Pirates alliés indépendants (points bleus) : ils naviguent d'un port à l'autre, y font escale, attaquent la Marine
 * près de leur route et ramassent le butin de leurs victimes. Leurs victoires ne comptent pas pour toi.
 */
export const PIRATES = {
  /** Nombre en mer en même temps. */
  count: [1, 3] as const,
  /** Délai avant qu'un nouveau pirate prenne la mer quand il en manque (s). */
  respawnDelay: [45, 90] as const,
  /** Durée d'une escale (s). */
  stay: [20, 40] as const,
  /**
   * Mouillage : un point au hasard devant le port, sur un côté de l'axe de la crique (écart d'angle, rad), à cette
   * distance au large de la côte (m), à au moins `spacing` m des autres navires et `shoreClearance` m du rivage.
   */
  mooring: { angle: [0.2, 0.45] as const, offing: [40, 110] as const, spacing: 32, shoreClearance: 22 },
  /**
   * Activités en route, tirées toutes les `interval` s de trajet (hors des abords des ports) : pêche sur un banc proche
   * (arrêt de `time` s), patrouille au large (il croise `time` s dans ce rayon), chasse d'un navire de la Marine repéré
   * à moins de `range` m (abandonnée au bout de `time` s).
   */
  activity: {
    interval: [25, 45] as const,
    fish: { chance: 0.3, range: 300, time: [15, 30] as const },
    patrol: { chance: 0.25, radius: 120, time: [20, 40] as const, turn: [6, 10] as const },
    hunt: { chance: 0.35, range: 450, time: 60 },
  },
  /** Ils attaquent un ennemi à moins de cette distance (m)… */
  engageRange: 200,
  /** …fuient vers le port le plus proche sous cette fraction de leur vie, et reprennent la mer à `rallyHealth`. */
  fleeHealth: 0.25,
  rallyHealth: 0.8,
  /** Hors combat, ils ramassent le butin à moins de cette distance (m). */
  lootRange: 120,
  /** Jauge de voile en route. */
  sail: 0.75,
  /** Ils apparaissent à un mouillage à au moins cette distance du joueur (m). */
  spawnClearance: 450,
  /** Menace de leurs améliorations tirées au hasard (0..1). */
  upgrades: 0.3,
};

/** Sloop marchand des missions d'escorte : il navigue à mi-voile pour que la flotte suive. */
export const MERCHANT = {
  name: 'La Fortune',
  sail: 0.5,
  /** Il est arrivé à moins de cette distance du mouillage visé, devant le port (m). */
  arrival: 35,
  /** Il quitte la crique par ce point, à cette distance au large du port (m). */
  offing: 220,
};

/** Trajets de port en port (pirates alliés, marchand escorté) : jamais deux fois le même chemin. */
export const ROUTES = {
  /** Sortie et entrée d'une crique : écart d'angle au hasard autour de son axe (rad), et de distance au large (m). */
  mouthAngle: 0.12,
  mouthOffing: [-40, 40] as const,
  /** Sur un trajet plus long que `detourFrom` (m) : 1 ou 2 détours, jusqu'à `detourWidth` m de côté, loin des côtes. */
  detourFrom: 400,
  detours: [1, 2] as const,
  detourWidth: 150,
  shoreClearance: 80,
  /** Le cap ondule en route : amplitude (rad) et période au hasard (s). */
  wander: 0.12,
  wanderPeriod: [10, 20] as const,
};

export const RADAR = {
  /** Portée affichée (m). */
  range: 400,
  /** Diamètre à l'écran (px). */
  size: 180,
  /** Le radar est redessiné au plus ce nombre de fois par seconde (dessin 2D coûteux s'il est fait à chaque image). */
  refreshRate: 30,
};

/** Une vague de Gerstner. La somme des `steepness` doit rester < 1 (sinon les crêtes se replient). */
export interface WaveParams {
  dirX: number;
  dirZ: number;
  /** Raideur 0..1 : amplitude = steepness × wavelength / 2π. */
  steepness: number;
  /** Longueur d'onde (m). */
  wavelength: number;
}

export const OCEAN = {
  /** Demi-taille de la grille d'eau (m), recentrée sur le joueur. */
  halfSize: 900,
  segments: 256,
  /** Taille d'une cellule sous le joueur (m). Les cellules s'agrandissent vers le bord. */
  innerCell: 2.5,
  // Houle longue et douce.
  waves: [
    { dirX: 1, dirZ: 0.25, steepness: 0.06, wavelength: 180 },
    { dirX: 0.5, dirZ: 1, steepness: 0.05, wavelength: 115 },
    { dirX: -0.5, dirZ: 1, steepness: 0.045, wavelength: 70 },
    { dirX: 1, dirZ: -0.6, steepness: 0.04, wavelength: 42 },
  ] as WaveParams[],
  /**
   * Clapot de grosse tempête : vagues courtes et raides, nulles par temps normal (raideur = celle-ci × WeatherProfile.chop).
   * Avec la houle, la somme des raideurs doit rester < 1.
   */
  chopWaves: [
    { dirX: 0.8, dirZ: 0.6, steepness: 0.09, wavelength: 30 },
    { dirX: -0.3, dirZ: 1, steepness: 0.08, wavelength: 22 },
    { dirX: 1, dirZ: -0.2, steepness: 0.06, wavelength: 16 },
  ] as WaveParams[],
  deepColor: 0x0a3d5c,
  shallowColor: 0x1b7a9a,
  /** Lumière turquoise qui traverse les crêtes à contre-jour. */
  scatterColor: 0x3fe0c8,
  foamColor: 0xf4fbff,
  /** Eau peu profonde autour de l'île. */
  lagoonColor: 0x35c9c0,
  /** Force des petites rides de surface. */
  rippleStrength: 0.11,
};

/**
 * Traces dans l'eau, dessinées par le shader de l'océan :
 * - une texture vue de dessus, centrée sur le joueur, où chaque bateau « peint » son sillage (il suit ses virages
 *   et s'efface peu à peu), ainsi que les boulets tombés à l'eau, les naufrages et le butin qui flotte ;
 * - un liseré d'écume collé à la coque des bateaux proches, calculé directement à partir de leur position.
 */
export const WAKE = {
  /** Côté de la zone couverte par la texture (m) et sa résolution (pixels). */
  areaSize: 320,
  resolution: 1024,
  /** Durée de vie d'une trace (s). */
  duration: 8,
  /** Étalement des traces avec le temps (elles s'élargissent en s'estompant). */
  spread: 0.35,
  /** Vitesse (m/s) à partir de laquelle un bateau laisse un sillage, et vitesse où il est complet. */
  minSpeed: 0.8,
  fullSpeed: 7,
  /**
   * Nombre max de bateaux dont le shader de l'eau dessine le liseré d'écume (les plus proches de la caméra, devant
   * elle, à moins de GRAPHICS.hullFoamRange) : chaque pixel d'eau proche parcourt cette liste, elle coûte cher.
   */
  maxShips: 12,
  /** Liseré d'écume de la coque : retrait par rapport au plat-bord (fraction de la largeur), et force à l'arrêt. */
  hullHug: 0.93,
  idleFoam: 0.8,
  /**
   * Tirant d'eau d'une coque, en fraction de sa demi-largeur : là où la coque est soulevée (proue levée par une vague,
   * flanc qui roule) de cette hauteur au-dessus de l'eau, elle n'y touche plus et le liseré d'écume s'efface.
   */
  hullDraft: 0.55,
  /** Rayon des anneaux d'écume (m) : boulet tombé à l'eau, butin qui flotte. */
  splashRadius: 2.2,
  lootRadius: 1.3,
};

export const SKY = {
  zenithColor: 0x3d85c6,
  horizonColor: 0xcde6ee,
  sunColor: 0xfff1d6,
  /** Lumière ambiante venue du ciel et de la mer : neutre, sinon les faces à l'ombre virent au bleu. */
  ambientSky: 0xd6e4ec,
  ambientGround: 0x3a4a50,
  /** Direction vers le soleil (normalisée au chargement). */
  sunDirection: [0.75, 0.5, 0.45] as const,
  /** Intensité de la lumière ambiante et du soleil par beau temps. */
  ambientIntensity: 1.5,
  sunIntensity: 2.6,
};

/** Ce que change un temps, à son plus fort. Le beau temps, lui, est décrit par SKY et WORLD (multiplicateurs à 1). */
export interface WeatherProfile {
  fogNear: number;
  fogFar: number;
  /** Couleur de la brume, qui est aussi celle de l'horizon. */
  fogColor: number;
  zenithColor: number;
  /** Part du soleil qui perce encore (reflets, halo, lumière dans les crêtes). */
  sunlight: number;
  ambientIntensity: number;
  sunIntensity: number;
  /** Hauteur des vagues (raideur de chaque vague multipliée). */
  waveFactor: number;
  /** Plage de force du vent (nœuds) : il varie lentement entre les deux. */
  windMin: number;
  windMax: number;
  /** Portée de tir des canons (bateaux et fort). */
  rangeFactor: number;
  /** Distance à laquelle un ennemi repère une proie : on se voit moins bien. */
  detectionFactor: number;
  /** Part des gouttes de pluie affichées (0..1). */
  rain: number;
  /** Fréquence des éclairs (0 = aucun, 1 = plein orage). */
  lightning: number;
  /** Filets de vent dans l'air (0..1). */
  windStreaks: number;
  /** Clapot : part des vagues courtes et pointues (OCEAN.chopWaves) qui cassent l'arrondi de la houle (0..1). */
  chop: number;
  /** Multiplie la vitesse de virage : < 1 = barre plus dure, bateaux ballottés. */
  turnFactor: number;
  /** Paquets de mer qui déferlent sur les ponts et abîment les bateaux (0..1). */
  seaDamage: number;
  /** Multiplie la chance que la foudre frappe un mât. */
  strikeFactor: number;
  /** Écume de tempête sur toute la mer : crêtes blanches et traînées étirées par le vent (0..1). */
  seaFoam: number;
}

/** Météo : choisie avec les boutons au-dessus du radar, elle change petit à petit. */
export const WEATHER = {
  /** Durée d'un changement de temps, quel qu'il soit (s). */
  transitionTime: 20,
  /**
   * Houle du beau temps : de temps en temps (interval, s), une nouvelle houle est tirée au hasard entre quasi plate
   * (min, en fraction de la houle normale) et la houle normale, et la mer y passe en changeTime secondes au plus.
   */
  swell: { min: 0.06, interval: [60, 180] as const, changeTime: 40 },
  fog: {
    fogNear: 10,
    fogFar: 70,
    fogColor: 0xc2c9cc,
    zenithColor: 0xb0b9be,
    sunlight: 0.2,
    ambientIntensity: 1.3,
    sunIntensity: 0.8,
    waveFactor: 0.1,
    windMin: 0,
    windMax: 2,
    rangeFactor: 0.6,
    detectionFactor: 0.4,
    rain: 0,
    lightning: 0,
    windStreaks: 0,
    chop: 0,
    turnFactor: 1,
    seaDamage: 0,
    strikeFactor: 1,
    seaFoam: 0,
  } satisfies WeatherProfile,
  windy: {
    fogNear: 220,
    fogFar: 650,
    fogColor: 0xd4e9f0,
    zenithColor: 0x2f78c0,
    sunlight: 1,
    ambientIntensity: 1.5,
    sunIntensity: 2.7,
    waveFactor: 2,
    windMin: 30,
    windMax: 40,
    rangeFactor: 1,
    detectionFactor: 1,
    rain: 0,
    lightning: 0,
    windStreaks: 1,
    chop: 0,
    turnFactor: 1,
    seaDamage: 0,
    strikeFactor: 1,
    seaFoam: 0,
  } satisfies WeatherProfile,
  rain: {
    fogNear: 50,
    fogFar: 220,
    fogColor: 0x8b979e,
    zenithColor: 0x56626b,
    sunlight: 0.12,
    ambientIntensity: 1.05,
    sunIntensity: 0.7,
    waveFactor: 1.6,
    windMin: 12,
    windMax: 25,
    rangeFactor: 0.8,
    detectionFactor: 0.75,
    rain: 0.55,
    lightning: 0,
    windStreaks: 0,
    chop: 0,
    turnFactor: 1,
    seaDamage: 0,
    strikeFactor: 1,
    seaFoam: 0,
  } satisfies WeatherProfile,
  storm: {
    fogNear: 30,
    fogFar: 140,
    fogColor: 0x5a646b,
    zenithColor: 0x252c32,
    sunlight: 0.03,
    ambientIntensity: 0.75,
    sunIntensity: 0.3,
    waveFactor: 2.3,
    windMin: 28,
    windMax: 38,
    rangeFactor: 0.7,
    detectionFactor: 0.6,
    rain: 1,
    lightning: 1,
    windStreaks: 0,
    chop: 0,
    turnFactor: 1,
    seaDamage: 0,
    strikeFactor: 1,
    seaFoam: 0,
  } satisfies WeatherProfile,
  /** Grosse tempête : houle énorme et pointue, mer blanche d'écume, vent féroce, éclairs fréquents. */
  tempest: {
    fogNear: 40,
    fogFar: 180,
    fogColor: 0x6e7f83,
    zenithColor: 0x3b4a4f,
    sunlight: 0.05,
    ambientIntensity: 0.85,
    sunIntensity: 0.35,
    waveFactor: 3,
    windMin: 44,
    windMax: 56,
    rangeFactor: 0.6,
    detectionFactor: 0.5,
    rain: 1,
    lightning: 2,
    windStreaks: 0.35,
    chop: 1,
    turnFactor: 0.8,
    seaDamage: 1,
    strikeFactor: 2,
    seaFoam: 1,
  } satisfies WeatherProfile,
  /** Gouttes : nombre max, boîte autour de la caméra (m), chute (m/s), longueur des traits (m), inclinaison par le vent. */
  drops: 5500,
  dropBox: [70, 40, 70] as const,
  fallSpeed: 24,
  dropLength: 1.1,
  dropSlant: 0.5,
  dropColor: 0xd2dce2,
  dropOpacity: 0.5,
  /** Filets de vent : nombre, boîte autour de la caméra (m), longueur (m), vitesse (m/s), durée de vie (s), opacité. */
  streaks: 160,
  streakBox: [90, 22, 90] as const,
  streakLength: 7,
  streakSpeed: 20,
  streakLife: 2.2,
  streakOpacity: 0.7,
  /**
   * Bourrasques hors grand vent : par vent fort (entre knots[0] et knots[1] nœuds, effet croissant), des filets de vent
   * passent de temps en temps, au plus `streaks` de ceux du grand vent. Pas sous la pluie. Rythme des rafales (s).
   */
  gusts: { knots: [13, 19] as const, streaks: 0.3, period: 23 },
  /**
   * Paquets de mer (grosse tempête) : pour chaque bateau, un coup de mer tous les interval secondes environ, s'il a
   * l'étrave dans une crête (au-dessus de crest × la plus haute vague possible). Dégâts : damage × vie max, plus forts
   * pour les petits bateaux (× referenceLength / longueur, au plus maxScale).
   */
  heavySeas: { interval: [5, 12] as const, crest: 0.18, damage: 0.04, referenceLength: 7.5, maxScale: 1.5 },
};

/** Éclairs d'orage. */
export const LIGHTNING = {
  /** Délai entre deux éclairs en plein orage (s) ; plus rares quand l'orage arrive ou s'en va. */
  interval: [3, 8] as const,
  /** Distance de chute autour du joueur (m) : surtout au loin, parfois tout près. */
  distance: [50, 480] as const,
  /** Hauteur des nuages d'où part l'éclair (m). */
  cloudHeight: 140,
  /** Durée pendant laquelle l'éclair et sa lueur sont visibles (s). */
  duration: 0.45,
  /** Largeur du trait (m), élargi au loin pour rester visible. */
  width: 1.2,
  color: 0xeef3ff,
  /** Lueur du ciel et de la scène au moment de l'éclair (0..1), plus forte quand il tombe près. */
  flash: 0.9,
  /** Lumière ambiante ajoutée au plus fort de la lueur. */
  ambientBoost: 2.5,
  /** Secousse de caméra max (0..1) quand il tombe tout près ; aucune au-delà de shakeRadius (m). */
  shake: 0.45,
  shakeRadius: 180,
  /** Chance qu'un éclair frappe le mât d'un bateau proche (à moins de strikeRadius du joueur), et dégâts (fraction de la vie max). */
  strikeChance: 0.06,
  strikeRadius: 300,
  strikeDamage: 0.15,
  /** Hauteur du haut du mât, en fraction de la longueur du bateau. */
  mastHeight: 0.7,
};

export const CAMERA = {
  fov: 55,
  distance: 18,
  minDistance: 8,
  maxDistance: 50,
  /** Angle au-dessus de l'horizon (rad). */
  pitch: 0.3,
  minPitch: 0.05,
  maxPitch: 1.35,
  /** rad par pixel de souris. */
  sensitivity: 0.004,
  /** Hauteur visée au-dessus du bateau (m). */
  targetHeight: 2,
  /** Longueur de bateau pour laquelle distance et hauteur sont données (la chaloupe) ; au-delà, on recule. */
  referenceLength: 7.5,
  /** Secondes sans toucher la souris avant que la caméra revienne derrière le bateau. */
  recenterDelay: 2.5,
  recenterSpeed: 1.2,
  /** Décalage max de la secousse (m) et vitesse à laquelle elle s'éteint (/s). */
  shakeOffset: 0.9,
  shakeDecay: 1.6,
};

export const WORLD = {
  fogNear: 140,
  fogFar: 520,
};

/** Préréglages de qualité du menu Échap. « Auto » = Haut + résolution dynamique. */
export type QualityPreset = 'low' | 'medium' | 'high' | 'auto';

/** Réglages graphiques (menu Échap, onglet Graphismes). */
export interface GraphicsSettings {
  /** Pixels dessinés par pixel d'écran (plafonné à la densité de l'écran) : le réglage qui pèse le plus. */
  resolution: number;
  /** Baisse la résolution quand une image traîne, la remonte quand il y a de la marge. */
  dynamicResolution: boolean;
  /** Anticrénelage (MSAA) : le moteur de rendu est recréé quand il change. */
  antialias: boolean;
  /** Images par seconde au plus (0 = pas de limite). */
  fpsLimit: number;
  /** Cases de la grille d'eau par côté. */
  oceanGrid: number;
  /** Eau au loin : tous les détails, ou détails fins limités aux abords. */
  farWater: 'detailed' | 'simple';
  /** Côté de la carte des sillages (texels). */
  wakeResolution: number;
  /** Part de la pluie et des filets de vent dessinés, et des particules (embruns, fumée, éclats) émises (0..1). */
  weatherDensity: number;
  particleDensity: number;
}

export const GRAPHICS = {
  presets: {
    low: { resolution: 0.75, dynamicResolution: false, antialias: false, fpsLimit: 0, oceanGrid: 128, farWater: 'simple', wakeResolution: 512, weatherDensity: 0.3, particleDensity: 0.3 },
    medium: { resolution: 1, dynamicResolution: false, antialias: false, fpsLimit: 0, oceanGrid: 192, farWater: 'simple', wakeResolution: 1024, weatherDensity: 0.6, particleDensity: 0.6 },
    high: { resolution: 1.5, dynamicResolution: false, antialias: true, fpsLimit: 0, oceanGrid: 256, farWater: 'detailed', wakeResolution: 1024, weatherDensity: 1, particleDensity: 1 },
    auto: { resolution: 1.5, dynamicResolution: true, antialias: true, fpsLimit: 0, oceanGrid: 256, farWater: 'detailed', wakeResolution: 1024, weatherDensity: 1, particleDensity: 1 },
  } as Record<QualityPreset, GraphicsSettings>,
  /** Préréglage du premier lancement. */
  defaultPreset: 'auto' as QualityPreset,
  /** Choix proposés dans le menu. */
  options: {
    resolution: [0.5, 0.75, 1, 1.25, 1.5],
    fpsLimit: [0, 60, 30],
    oceanGrid: [128, 192, 256],
    wakeResolution: [512, 1024],
    density: [0.3, 0.6, 1],
  },
  /** Eau au loin : distance (m) au-delà de laquelle le shader de l'eau saute rides, sillages et dentelle d'écume. */
  detailDistance: { detailed: 240, simple: 110 },
  /** … et distance de la caméra (m) au-delà de laquelle un navire n'a plus de liseré d'écume (il ferait moins d'un pixel). */
  hullFoamRange: { detailed: 140, simple: 80 },
  /**
   * Résolution dynamique : l'échelle de rendu (minScale..1, par pas de step) est revue toutes les `interval` s selon le
   * temps GPU d'une image, rapporté au budget de l'image (1 / limite d'images, ou 1 / targetFps sans limite) : au-delà
   * de `high` elle baisse, en deçà de `low` (pendant `calmChecks` revues de suite) elle remonte.
   */
  dynamic: { minScale: 0.5, step: 0.05, interval: 0.5, high: 0.8, low: 0.5, calmChecks: 2, targetFps: 60 },
  /** Clé de sauvegarde des réglages dans le navigateur. */
  storageKey: 'bateau.settings',
};

/**
 * Forme d'une île. Sa côte est un rayon qui varie selon l'angle (cap, 0 = nord / +Z) : rayon moyen + quelques
 * ondulations, moins une crique creusée en direction de `bay.angle`, où se niche le port. La même formule sert au
 * relief, aux collisions, à l'évitement, au radar et au shader de l'eau.
 */
export interface IslandShapeDef {
  center: readonly [number, number];
  radius: number;
  /** Ondulations de la côte : [nombre de bosses sur le tour, amplitude (m), phase (rad)], toujours ISLAND_LOBES. */
  lobes: readonly (readonly [number, number, number])[];
  /** Crique : direction de son ouverture (cap), largeur angulaire et profondeur (m). */
  bay: { angle: number; width: number; depth: number };
  /** Relief : collines douces derrière de larges plages, ou falaises au-dessus d'une plage étroite. */
  relief: 'hills' | 'cliffs';
  /** Hauteur des sommets (m) et des falaises (relief 'cliffs'). */
  peak: number;
  cliff: number;
  /** Les vagues sont atténuées sur cette distance au large de la côte (m) : nulles au rivage. */
  calmDistance: number;
  /** Largeur du lagon turquoise (m) et du ressac blanc (m) le long du rivage. */
  lagoonWidth: number;
  surfWidth: number;
  /** Herbe (claire, sombre) : les îles rocheuses sont plus sèches. */
  grass: number;
  darkGrass: number;
}

/** Nombre d'ondulations de chaque côte (taille des tableaux du shader de l'eau). */
export const ISLAND_LOBES = 4;

export type IslandId = 'tortuga' | 'sabre';

export const ISLANDS: Record<IslandId, IslandShapeDef> = {
  /** Île de la Tortue : ton repaire, verte et vallonnée. */
  tortuga: {
    center: [0, 0],
    radius: 170,
    lobes: [
      [2, 16, 0.6],
      [3, 12, 2.3],
      [5, 7, 4.1],
      [7, 4, 1.1],
    ],
    bay: { angle: 0, width: 0.5, depth: 120 },
    relief: 'hills',
    peak: 38,
    cliff: 0,
    calmDistance: 160,
    lagoonWidth: 70,
    surfWidth: 5,
    grass: 0x6fb04f,
    darkGrass: 0x4f8f3c,
  },
  /** Port-Sabre : 1,2 km à l'est (−X), plus petite, haute et rocheuse ; sa crique regarde vers la Tortue. */
  sabre: {
    center: [-1200, 120],
    radius: 135,
    lobes: [
      [2, 10, 1.9],
      [3, 14, 0.4],
      [5, 8, 2.7],
      [8, 5, 5.2],
    ],
    bay: { angle: Math.PI / 2 + 0.25, width: 0.42, depth: 85 },
    relief: 'cliffs',
    peak: 58,
    cliff: 16,
    calmDistance: 140,
    lagoonWidth: 30,
    surfWidth: 6,
    grass: 0x8f9a4f,
    darkGrass: 0x6b7a3c,
  },
};

/** Navigation près des terres. */
export const LAND = {
  /** Distance minimale au rivage que les IA gardent (m) : les ennemis l'évitent « à tout prix ». */
  enemyMargin: 40,
  allyMargin: 14,
  /** Pas d'apparition d'ennemi à moins de cette distance de la côte ou du port (m). */
  spawnClearance: 110,
  portClearance: 350,
  /** Vitesse maximale gardée par un bateau qui bute contre la côte (m/s) : assez pour virer et repartir. */
  bumpSpeed: 2,
};

export const PORT = {
  /** Distance du quai, vers le large, où la flotte apparaît (m). */
  spawnOffset: 40,
  /** Réparation rapide à quai : rayon autour du port (m) et vie rendue par seconde (fraction de la vie max). */
  repairRadius: 150,
  repairRate: 0.1,
  /** Pas de réparation rapide tant qu'un ennemi est à moins de cette distance du port (m). */
  combatRadius: 250,
};

/** Allégeance d'une île : qui tient son port. */
export type Allegiance = 'pirate' | 'navy' | 'merchant';
export const ALLEGIANCE_NAMES: Record<Allegiance, string> = { pirate: 'Pirates', navy: 'Marine royale', merchant: 'Comptoir marchand' };

/** Prix d'une marchandise dans un port (en or l'unité) : `buy` = ce que tu paies, `sell` = ce qu'on t'en donne. null = pas d'échange. */
export interface Price {
  buy: number | null;
  sell: number | null;
}

/** Ce qu'on échange au marché : le bois (réserve commune) et les marchandises des cales. */
export type TradeGood = 'wood' | 'fish' | 'rum' | 'spices';

/** Améliorations d'île possibles (chaque île n'en propose que certaines, voir IslandInfoDef.upgrades). */
export type IslandUpgradeId = 'fort' | 'citadel' | 'dock' | 'workshop' | 'counter' | 'lighthouse' | 'smuggling';

/** Ce que le joueur sait d'une île : son port, qui la tient, son marché, ce qu'on peut y construire. */
export interface IslandInfoDef {
  name: string;
  portName: string;
  /** Nom court dans les phrases (« jusqu'à la Tortue », « attaque Port-Sabre »). */
  shortName: string;
  /** Son fort : nom affiché, nom commun et genre (« le fort », « la citadelle »). */
  fort: { name: string; noun: string; feminine: boolean };
  allegiance: Allegiance;
  /** Qui tient l'île tant qu'elle n'est pas à toi. */
  holders: string;
  owned: boolean;
  /** Prix de rachat (null = pas à vendre). */
  price: Cost | null;
  description: string;
  resources: readonly string[];
  market: Record<TradeGood, Price>;
  /** Améliorations possibles une fois l'île à toi, dans l'ordre du menu. */
  upgrades: readonly IslandUpgradeId[];
}

export const ISLAND_INFO: Record<IslandId, IslandInfoDef> = {
  tortuga: {
    name: 'Île de la Tortue',
    portName: 'Port de la Tortue',
    shortName: 'la Tortue',
    fort: { name: 'Fort de la Tortue', noun: 'fort', feminine: false },
    allegiance: 'pirate',
    holders: 'Les Frères de la Côte',
    owned: true,
    price: null,
    description: 'Repaire des Frères de la Côte et port d’attache de ta flotte. Ses distilleries produisent un rhum réputé, ses collines du bon bois de charpente.',
    resources: ['Bois de charpente', 'Rhum'],
    market: {
      wood: { buy: 2, sell: 1 },
      fish: { buy: null, sell: 3 },
      rum: { buy: 8, sell: 6 },
      spices: { buy: null, sell: 14 },
    },
    upgrades: ['fort', 'dock', 'workshop', 'counter', 'lighthouse'],
  },
  sabre: {
    name: 'Île du Sabre',
    portName: 'Port-Sabre',
    shortName: 'Port-Sabre',
    fort: { name: 'Citadelle de Port-Sabre', noun: 'citadelle', feminine: true },
    allegiance: 'pirate',
    holders: 'Les Frères du Sabre',
    owned: false,
    price: { gold: 1500, wood: 300 },
    description: 'Rocher escarpé à l’est de la Tortue, tenu par les Frères du Sabre. Leur citadelle domine la crique ; les contrebandiers y écoulent des épices et paient cher le bon rhum. Le bois y est rare.',
    resources: ['Épices de contrebande'],
    market: {
      wood: { buy: 3, sell: 2 },
      fish: { buy: null, sell: 3 },
      rum: { buy: null, sell: 13 },
      spices: { buy: 9, sell: 7 },
    },
    upgrades: ['citadel', 'smuggling'],
  },
};

/** Améliorations d'une île qui t'appartient. Un tableau = une valeur par niveau (le niveau 1 est la première case). */
export const ISLAND_UPGRADES = {
  fort: {
    costs: [{ gold: 150, wood: 80 }, { gold: 300, wood: 150 }, { gold: 500, wood: 250 }],
    guns: [3, 4, 5],
    range: [240, 260, 290],
    damage: [12, 14, 17],
  },
  dock: {
    costs: [{ gold: 120, wood: 100 }, { gold: 250, wood: 180 }, { gold: 400, wood: 300 }],
    /** Vie rendue par seconde à quai (fraction de la vie max). */
    repairRate: [0.15, 0.2, 0.3],
    /** Multiplicateur du délai de réapparition des navires coulés. */
    respawnFactor: [0.85, 0.7, 0.55],
    /** Remise sur l'achat de navires. */
    shipDiscount: [0.05, 0.1, 0.15],
  },
  workshop: {
    costs: [{ gold: 100, wood: 60 }, { gold: 220, wood: 120 }, { gold: 400, wood: 220 }],
    /** Scierie : bois produit par minute, même quand tu es au large. */
    woodPerMinute: [6, 12, 20],
    /** La réserve de l'île garde au plus ce nombre de minutes de production. */
    storageMinutes: 15,
  },
  /** Comptoir de la Tortue : les marchands alliés viennent plus souvent et laissent plus d'or (effets dans ISLAND_TRADE). */
  counter: {
    costs: [{ gold: 150, wood: 80 }, { gold: 300, wood: 150 }, { gold: 500, wood: 250 }],
  },
  /** Citadelle de Port-Sabre (une fois l'île rachetée) : bien plus de canons que le fort de la Tortue. */
  citadel: {
    costs: [{ gold: 250, wood: 120 }, { gold: 450, wood: 220 }, { gold: 700, wood: 350 }],
    guns: [6, 7, 8],
    range: [260, 290, 320],
    damage: [14, 17, 20],
  },
  /** Comptoir de contrebande de Port-Sabre : on t'y achète plus cher, on t'y vend moins cher. */
  smuggling: {
    costs: [{ gold: 150, wood: 60 }, { gold: 300, wood: 120 }, { gold: 500, wood: 200 }],
    sellBonus: [0.1, 0.2, 0.3],
    buyDiscount: [0.05, 0.1, 0.15],
  },
  lighthouse: {
    costs: [{ gold: 150, wood: 60 }, { gold: 300, wood: 120 }],
    /** Portée du radar près de l'île (m)… */
    radarRange: [520, 640],
    /** …à moins de cette distance de la côte (m). Les ennemis de cette zone apparaissent aussi sur la carte. */
    coverage: [700, 900],
  },
};

/** Routes commerciales confiées à tes navires (onglet Routes du port). */
export const TRADE_ROUTES = {
  /** Chargement au départ de la route (s). */
  loadTime: 6,
  /** Escale à chaque port : vente, puis chargement (s). */
  stay: [10, 16] as const,
  /** Voilure en route (fraction). */
  sail: 0.8,
};

/**
 * Marchands alliés qui commercent avec tes îles (sloops jaunes sur le radar) : chaque escale laisse de l'or dans la
 * réserve de l'île. Un tableau = sans comptoir, puis par niveau du comptoir (ou du comptoir de contrebande de Port-Sabre).
 */
export const ISLAND_TRADE = {
  /** Temps entre deux marchands pour une île (s). */
  interval: [150, 120, 95, 75],
  /** Or laissé dans la réserve à chaque escale. */
  goldPerVisit: [25, 35, 45, 60],
  /** Or que la réserve garde au plus (le surplus est perdu). */
  reserveCap: [400, 700, 1000, 1500],
  /** Marchands en même temps pour une île. */
  maxPerIsland: 2,
  /** Ils viennent du large, à cette distance de l'île (m), et y repartent. */
  distance: [800, 1100] as const,
  /** Ils n'apparaissent pas à moins de cette distance de ton navire (m). */
  clearance: 450,
  /** Ils disparaissent au large une fois à cette distance de ton navire (m). */
  despawn: 600,
  /** Durée de l'escale au mouillage (s). */
  stay: [20, 40] as const,
  sail: 0.55,
  types: ['sloop', 'sloop', 'brigantine'] as const,
};

/** Phare de la Tortue : lumière par temps sombre, taille selon le niveau de l'amélioration « Phare » (0 à 2). */
export const LIGHTHOUSE = {
  color: 0xfff1c0,
  /** Bandes blanches et rouges de la tour (3 m chacune). */
  bands: [4, 5, 6],
  /** Longueur des faisceaux (m), demi-largeur au bout (fraction de la longueur), inclinaison (rad, négatif = vers la mer). */
  beamLength: [70, 95, 120],
  beamWidth: 0.08,
  beamTilt: -0.035,
  beamIntensity: 0.35,
  /** Taille du halo de la lanterne (m). */
  haloSize: [8, 10, 12],
  /** Vitesse de rotation des faisceaux (rad/s). */
  turnSpeed: 0.5,
  /** La lanterne s'allume quand la lumière du soleil (météo) passe sous `darkFrom`, pleinement `darkRange` plus bas. */
  darkFrom: 0.8,
  darkRange: 0.5,
};

/** Citadelle de Port-Sabre avant amélioration (les autres réglages de tir sont ceux de FORT). Vie : voir les missions de défense. */
export const CITADEL = {
  guns: 4,
  range: 240,
  damage: 11,
  health: 900,
  /** Elle est orientée vers ce point, au large de l'entrée de sa crique (m). */
  facingOffing: 120,
};

/** Fort du port (canons d'appoint qui tirent sur les ennemis). */
export const FORT = {
  guns: 2,
  range: 220,
  reloadTime: 4,
  damage: 10,
  spread: (2 * Math.PI) / 180,
  ballSpeed: 62,
  /** Vitesse de rotation des canons (rad/s). */
  turnSpeed: 1.2,
  /** Vie de l'enceinte (elle ne compte que pendant un siège). */
  health: 600,
  /** Secteur de tir de chaque canon autour de son axe, vers le large (rad). */
  arcHalfAngle: (80 * Math.PI) / 180,
};
