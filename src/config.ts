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
  /** Mortier : ce calibre tire des obus en cloche qui explosent (voir ShellStats), au lieu de boulets. */
  shell?: ShellStats;
}

/**
 * Obus de mortier : tiré en cloche (temps de vol selon la distance, gravité plus forte qu'un boulet pour une courbe
 * haute et raide), il explose où il tombe ; son souffle touche les navires ennemis proches, même s'il les rate.
 */
export interface ShellStats {
  /** Gravité de l'obus, en multiple de COMBAT.gravity. */
  gravityFactor: number;
  /** Temps de vol (s) = flightBase + flightPerMeter × distance. */
  flightBase: number;
  flightPerMeter: number;
  /** Souffle : les navires ennemis dont le bordé est à moins de `blastRadius` m de l'explosion prennent `blastShare` des dégâts. */
  blastRadius: number;
  blastShare: number;
  /** Taille de l'obus (× celle d'un boulet). */
  size: number;
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
  /**
   * Second calibre : canons du pont supérieur d'un navire à deux calibres (corvette, frégate), ou canon de chasse de
   * la caravelle (voir `chaseGuns`).
   */
  deckCannon?: CannonStats;
  /**
   * Canons de chasse : tirent droit devant, au second calibre (caravelle, débloqué par l'amélioration des canons ;
   * chébec), au calibre de la batterie (caraque), ou les deux (galéasse : triples canons puis pièces, GALLEASS_BOW).
   */
  chaseGuns?: number;
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

/**
 * Ancienneté visible d'un navire de ta flotte, par rang (recrue, vétéran ★, élite ★★, légende ★★★) : usure des voiles
 * (0 à 1 : toile jaunie, taches, pièces rapiécées) et de la coque (bois assombri et terni, part en moins).
 */
export const RANK_LOOKS = {
  sailWear: [0, 0.4, 0.7, 1],
  hullDarken: [0, 0.12, 0.2, 0.28],
  hullFade: [0, 0.15, 0.25, 0.35],
  /** Planches remplacées (part des planches d'une autre teinte), craquelures (part des planches fendues), sel et mousse à la flottaison (0 à 1). */
  planks: [0, 0.06, 0.12, 0.2],
  cracks: [0, 0.08, 0.16, 0.28],
  grime: [0, 0.35, 0.65, 1],
  /** Taille d'une planche (m) : hauteur d'un rang, longueur. */
  plank: { height: 0.32, length: 2.6 },
  /** Usure du pavillon pirate du grand mât (0 à 1 : bout effiloché, trous). */
  flagWear: [0, 0.35, 0.65, 1],
};

/**
 * Glisse sur la houle (tous les navires, par tous les temps) : la vitesse suit la pente de l'eau sous la coque, lue sur
 * le tangage. En descente (proue basse), le navire glisse et peut dépasser sa vitesse max ; en montée, il perd un peu.
 * L'effet est proportionnel à la pente, entier à `fullAngle` et plafonné au-delà.
 */
export const SURF = {
  /** Pente (rad) où l'effet est entier : ~12°, les plus raides de la grande tempête. */
  fullAngle: 0.21,
  /** Vitesse gagnée en descente et perdue en montée à cette pente (part de la vitesse). */
  downhill: 0.4,
  uphill: 0.1,
  /** Vitesse à laquelle l'élan suit la pente (1/s) : la glisse se gagne et se perd en une seconde environ. */
  response: 1.2,
  /** Embruns d'étrave en pleine glisse : densité × (1 + spray), gouttes lancées plus haut (m/s en plus). */
  spray: 2.5,
  sprayLift: 2,
  /** Champ de vision de la caméra en pleine glisse (part en plus), et vitesse à laquelle il la suit (1/s). */
  fovGain: 0.08,
  fovResponse: 1.5,
};

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
  /** Secousse de caméra quand le joueur est touché (0..1), et en plus quand c'est par un obus de mortier (coup ou souffle). */
  hitShake: 0.55,
  shellShake: 0.6,
  /** Délai aléatoire max (s) avant chaque tir d'un canon chargé et pointé : la bordée part en cascade, pas d'un bloc. */
  acquireDelay: 0.3,
  /**
   * Boulets et obus en vol en même temps, au plus (au-delà, un tir ne part pas) : de quoi laisser les grandes bordées
   * (frégate, caraque, triples canons de la galéasse) de plusieurs flottes se croiser.
   */
  maxBalls: 128,
};

/**
 * Point visé par chaque canon (navires et forts), tiré au hasard à chaque coup (`combat/aimSpread.ts`) : les tirs se
 * répartissent sur tout le navire adverse au lieu de tomber au même endroit.
 */
export const AIM = {
  /** Sur la coque : part de la demi-longueur (de la poupe à la proue), hauteur au-dessus de la flottaison (m). */
  hullSpan: 0.8,
  hullLow: 0.2,
  hullHigh: 1.7,
  /**
   * Part des tirs dans le gréement, sur les navires dont le grand mât dépasse `riggingMinHeight` (m) : part de la
   * demi-longueur, hauteur (part de celle du pavillon du grand mât). Un tel boulet ne touche que s'il passe dans la coque.
   */
  riggingShare: 0.2,
  riggingMinHeight: 4,
  riggingSpan: 0.6,
  riggingLow: 0.3,
  riggingHigh: 0.75,
  /** Hauteur visée sur ce qui n'est pas un navire (ouvrage assiégé), au-dessus de son point de visée (m). */
  structureHeight: 0.6,
  /** Un boulet qui passe dans le gréement (voiles, mâts) fait cette part de ses dégâts (voir Ship.containsRigging). */
  riggingDamage: 0.5,
  /**
   * Gréement : de part et d'autre de l'axe, part de la largeur de la coque (les vergues débordent bien au-delà du
   * bordé), et part de la longueur (beaupré et bôme compris).
   */
  riggingWidth: 1.15,
  riggingLength: 0.6,
  /** Un point visé sur un navire reste au moins à cette hauteur au-dessus de l'eau à cet endroit (m) : jamais sous la vague. */
  waterClearance: 0.5,
  /** Imprécision (angle et distance) à la portée maximale, en multiple de celle à bout portant ; entre les deux, linéaire. */
  farSpread: 1.5,
};

/** Mortier du brick : obus en cloche (voir ShellStats) ; effets : traînée de fumée posée tous les `trailInterval` s, taille de l'explosion. */
export const MORTAR_SHELL: ShellStats = { gravityFactor: 2, flightBase: 1.8, flightPerMeter: 0.0135, blastRadius: 12, blastShare: 0.5, size: 2.2 };
export const MORTAR_FX = {
  trailInterval: 0.025,
  /** Taille de l'explosion d'un obus (Effects.explosion ; la sainte-barbe : CRIT.magazineScale). */
  blastScale: 1.2,
};

/**
 * Proue de la galéasse : ses canons de chasse (`ShipStats.chaseGuns`) sont d'abord `triples` triples canons au calibre
 * de la batterie, dans la face du château avant (une salve d'un boulet par fût, rechargement plus lent, angle de tir
 * propre), puis des pièces légères au second calibre sur le dessus du château avant, qui tirent large vers l'avant.
 */
export const GALLEASS_BOW = {
  triples: 2,
  /** Triple canon : rechargement (× celui de la batterie) et demi-angle de tir (rad). */
  tripleReload: 1.2,
  tripleArc: (25 * Math.PI) / 180,
  /** Pièces légères du château avant : demi-angle de tir (rad). */
  pieceArc: (60 * Math.PI) / 180,
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
  /**
   * Regroupement : une caisse qui tombe à moins de `radius` m d'une caisse du même genre s'y ajoute (sa durée de vie
   * repart de zéro). Sa taille grandit avec son contenu : (contenu / `base` du genre)^(1/3), jusqu'à `maxScale`.
   */
  merge: { radius: 10, maxScale: 2, base: { gold: 8, wood: 4, rum: 3, spices: 2 } },
  /** Part de l'or perdue quand le joueur coule. */
  deathGoldLoss: 0.25,
};

/**
 * Plans de navires (progression/blueprints.ts, world/planScrolls.ts) : pour construire un type, il faut réunir les bouts
 * de son plan (le chantier naval de l'île reste exigé en plus). Un navire coulé par ta flotte dont le type t'est encore
 * inconnu lâche parfois un bout de plan : un rouleau de parchemin qui flotte parmi le butin, à ramasser en passant dessus.
 * Tant que son plan n'est pas complet, le nom du type reste caché partout (« Navire inconnu »).
 */
export const BLUEPRINTS = {
  /**
   * Bouts de plan à réunir pour chaque type. Un type absent de cette table est connu d'office : la chaloupe (le navire
   * de départ) et la barque (jamais à vendre). Les types de ta flotte au départ ou au chargement sont connus aussi.
   */
  fragments: { sloop: 2, caravel: 2, schooner: 2, brigantine: 3, xebec: 3, fluyt: 4, brig: 4, corvette: 4, carrack: 5, galleass: 5, frigate: 5, galleon: 6 } as Partial<Record<ShipType, number>>,
  /**
   * Chance qu'un navire coulé par ta flotte lâche un bout de son plan (un boss n'en lâche jamais), sauf si les bouts
   * gagnés et ceux qui flottent déjà suffisent à compléter le plan.
   */
  dropChance: 0.5,
  eliteDropChance: 1,
  /**
   * Le rouleau flotte ce temps (s) avant de couler (les caisses : LOOT.lifetime), en s'enfonçant pendant les `sinkTime`
   * dernières secondes ; pas plus de `maxScrolls` à la fois.
   */
  lifetime: 150,
  sinkTime: 3,
  maxScrolls: 12,
  /** Distance au hasard autour de l'épave où il remonte (m). */
  scatter: 4,
  /**
   * Rouleau de parchemin : longueur et rayon (m) avant `scale`, couleurs du papier, des bords roulés, du ruban et du
   * sceau, et une légère lueur propre pour qu'on le repère sur l'eau (de nuit aussi).
   */
  model: { length: 1.1, radius: 0.16, scale: 1.6, paper: 0xf3e6c4, rim: 0xd9c08a, ribbon: 0xb3261c, seal: 0xd9a514, glow: 0x2e2410 },
  /** Flottaison : enfoncement sous la surface (m), roulis (rad) et sa vitesse, rotation sur l'eau (rad/s, au hasard ±). */
  float: { depth: 0.08, roll: 0.14, rollSpeed: 1.3, spin: 0.5 },
  /** Couleurs sur la carte (parchemin) et sur le radar (fond sombre). */
  mapColor: '#9b2f7f',
  radarColor: '#ff86d6',
  /** Durée du grand message quand un plan est complet (s). */
  unlockMessageTime: 5,
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
  hands: { sloop: 3, caravel: 4, schooner: 4, brigantine: 5, xebec: 5, fluyt: 6, brig: 6, corvette: 7, carrack: 9, galleass: 10, frigate: 10, galleon: 12 },
  handsPerExtension: { schooner: 1, brigantine: 2, xebec: 1, fluyt: 2, brig: 2, corvette: 3, carrack: 3, galleass: 3, frigate: 3, galleon: 3 },
  walkSpeed: 1.1,
  runSpeed: 3,
  /**
   * Marche (deckCrew/sailorWalk.ts) : allure propre de chacun (× la vitesse), rotation (rad/s), distances d'arrivée et
   * de passage d'un nœud, rayon où il ralentit avant d'arriver (m) ; autres marins : écart de hauteur au-delà duquel ils
   * sont sur un autre pont, espace personnel (m), force de l'écart, × pour un marin arrêté, pas de côté face à quelqu'un
   * qui vient en sens inverse ; accélération (/s) ; distance à sa cible où il peut quitter le pont praticable (poste
   * contre le pavois, derrière un canon) ; vitesse sous laquelle il piétine, après combien de temps il cherche un autre
   * chemin (s), et combien de fois avant d'abandonner ; lissage de la hauteur des marches, et de combien il vise au-dessus (ou au-dessous) de ses pieds
   * quand le prochain nœud est plus haut (m) ; vitesse sous laquelle il ne tourne plus ; foulée ; escalade (m/s,
   * rythme des bras) ; place laissée autour d'un canon (m) ; distance où il cherche un abri en combat (m).
   */
  walk: {
    pace: [0.85, 1.15] as const,
    turnRate: 5,
    arrive: 0.06,
    waypoint: 0.3,
    slowRadius: 0.8,
    otherDeck: 0.6,
    personal: 0.6,
    separation: 1.6,
    standingFactor: 1.5,
    keepRight: 0.6,
    accel: 6,
    finalReach: 1.3,
    stuckSpeed: 0.25,
    stuckTime: 0.8,
    maxRetries: 3,
    stepSmooth: 14,
    climbHint: 0.36,
    turnMinSpeed: 0.15,
    stride: 5.5,
    climbSpeed: 0.8,
    climbStride: 7,
    gunClearance: 0.55,
    coverRange: 9,
    /** Espace laissé au joueur à pied (× l'espace personnel). */
    playerRoom: 1.3,
  },
  /**
   * Temps calme (deckCrew/crewActivities.ts) : poids de chaque occupation (flâner, s'accouder, discuter, laver le pont,
   * lover un cordage, s'asseoir, grimper aux haubans), durées (s) : pause après quelques pas, accoudé, assis,
   * discussion, pause après une discussion ou une descente, lavage (et pas entre deux places), cordage, là-haut ;
   * hauteur atteinte dans le hauban (part de sa longueur) ; portées (m) : flânerie, pavois, partenaires de discussion,
   * rayon du cercle, déplacement du laveur ; essais de tirage ; laveurs et marins dans les haubans au plus ; place
   * qu'un marin occupe (m) ; chance de rester sur le pont de sa promenade d'attache.
   */
  activities: {
    weights: { stroll: 30, rail: 18, chat: 16, swab: 9, coil: 8, sit: 11, shroud: 8 },
    idle: [3, 8] as const,
    look: [8, 18] as const,
    sit: [15, 35] as const,
    chat: [8, 20] as const,
    afterChat: [1, 3] as const,
    swab: [15, 30] as const,
    swabShift: [3, 5] as const,
    coil: [8, 16] as const,
    aloft: [8, 18] as const,
    aloftHeight: [0.25, 0.5] as const,
    /** Montée jusque dans la hune : chance (quand le hauban y mène), temps passé là-haut (s), matelots par hune en plus de la vigie. */
    topChance: 0.6,
    topTime: [15, 40] as const,
    topVisitors: 1,
    strollRange: 6,
    railRange: 8,
    chatRange: 6,
    chatRadius: 0.7,
    swabStep: 1,
    tries: 10,
    maxSwabbers: 2,
    maxAloft: 2,
    spotClearance: 0.6,
    homeBias: 0.6,
  },
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
 * Navigation de l'équipage sur le pont (deckCrew/deckNav.ts), tirée de la géométrie du modèle : taille d'une case (m),
 * pente au plus d'une surface où marcher (rad), écart sous lequel deux surfaces d'une case se confondent, marge des
 * surfaces et des obstacles autour d'un triangle (m), normale sous laquelle un triangle est une paroi ; place libre
 * au-dessus d'une surface (de `clearLow` à `headroom`) ; marche franchissable au plus (m) ; partie de pont minimale
 * (nœuds) ; recherche d'un nœud proche (cases, écart de hauteur) ; surcoût d'un nœud au bord ; nœuds explorés au plus
 * par recherche de chemin ; part de la demi-largeur au-delà de laquelle un bord est un pavois où s'accouder.
 * Haubans (lus dans le gréement) : montée minimale, part de la demi-largeur du pied, rentrée minimale vers l'axe,
 * écart du nœud où l'on s'en approche, hauteur du pied au-dessus du pont, regroupement par mât (m).
 */
export const DECK_NAV = {
  cell: 0.25,
  /** Pièces traversées par le joueur (roue, barre franche) : leur boîte, élargie de `margin` et prolongée de `below` vers le pont, emporte ce qui tient dedans (colonne de la roue). */
  passThrough: { margin: 0.15, below: 1.3 },
  /** Pas de pont sous cette hauteur (m) : dessous de coque, quille. */
  minHeight: 0.5,
  /** Marge autour des hauteurs des postes du plan de pont (m) : en deçà et au-delà, pas de pont (carène, hunes). */
  deckMargin: 2.5,
  maxSlope: 0.45,
  merge: 0.12,
  surfacePad: 0.02,
  obstaclePad: 0.15,
  steepNormal: 0.2,
  clearLow: 0.14,
  headroom: 1.55,
  stepMax: 0.42,
  minPart: 24,
  snapCells: 6,
  snapHeight: 1.2,
  edgeCost: 2,
  maxExpand: 6000,
  railShare: 0.55,
  /** Échelle : écart des nœuds où l'on y monte (m) et coût de la montée (en cases). */
  ladderStand: 0.3,
  ladderCost: 12,
  shroudRise: 4,
  shroudReach: 0.7,
  shroudInward: 0.4,
  /** Tolérance (m) sur la tête d'un hauban qui passerait de l'autre côté de l'axe. */
  shroudAxis: 0.05,
  shroudStand: 0.45,
  shroudFootAbove: 0.9,
  shroudGroup: 1.5,
  /**
   * Hunes (deckCrew/mastTops.ts), cherchées autour de la tête des haubans de chaque mât : grille fine (`cell`, m),
   * têtes d'un même mât à moins de `sameMast` m, recherche à `reach` m de l'axe (plus `rake` en long, mâts inclinés),
   * plancher entre `minAbove` m au-dessus du plus haut poste du pont et `above` m au-dessus de la tête des haubans,
   * d'au moins `minArea` m². Montée : jusqu'à `futtockDrop` m sous le plancher par le hauban, puis vers son bord
   * (`rimInset` m en deçà) ; départ `footLift` m au-dessus du pied du hauban. Places où se tenir : à `spotInset` m du
   * bord, dans la direction `angle` (rad, depuis la proue vers bâbord), le regard vers `facing`.
   */
  top: {
    cell: 0.1,
    sameMast: 1.5,
    reach: 1.5,
    rake: 2,
    minAbove: 3,
    above: 1,
    minArea: 0.25,
    /** Hauteur libre au-dessus du plancher d'une hune (m) : on s'y baisse sous une vergue. */
    headroom: 1.1,
    futtockDrop: 0.9,
    rimInset: 0.12,
    footLift: 0.1,
    spotInset: 0.25,
    spots: [
      { angle: 2.2, facing: 1 },
      { angle: -2.2, facing: -1 },
      { angle: Math.PI, facing: Math.PI },
    ],
  },
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
  slots: { rowboat: 0, longboat: 1, sloop: 1, caravel: 1, schooner: 1, brigantine: 2, xebec: 2, fluyt: 2, brig: 2, corvette: 2, carrack: 3, galleass: 3, frigate: 3, galleon: 4 } as Record<ShipType, number>,
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
    caravel: { gold: 160, wood: 80 },
    schooner: { gold: 150, wood: 75 },
    brigantine: { gold: 200, wood: 100 },
    xebec: { gold: 190, wood: 95 },
    fluyt: { gold: 240, wood: 120 },
    brig: { gold: 260, wood: 130 },
    corvette: { gold: 300, wood: 150 },
    carrack: { gold: 380, wood: 190 },
    galleass: { gold: 400, wood: 200 },
    frigate: { gold: 400, wood: 200 },
    galleon: { gold: 480, wood: 240 },
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
  /**
   * Plus de navire ennemi à attaquer, et le bateau piloté à moins de cette distance d'un fort de la Marine qu'il
   * bombarde : ils viennent le canonner eux aussi, par le travers (m).
   */
  siegeRadius: 450,
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
  /** Crans de force affichés près du radar (1 à 5) : un cran de plus à partir de chacune de ces forces (nœuds). */
  levels: [6, 16, 28, 44] as const,
};

/**
 * Avirons du chébec et de la galéasse (ShipTypeDef.oars : la vitesse gagnée en nageant). Les rameurs les sortent d'eux-mêmes par vent de
 * face et les rentrent quand le vent tourne ou que le navire s'arrête.
 */
export const OARS = {
  /** Vent de face : les rames sortent au-delà de cette part du vent debout (cosinus de l'écart : 1 = pile de face)… */
  outAt: 0.35,
  /** … et rentrent en deçà de celle-ci. */
  inAt: 0.2,
  /** Pas de nage sous cette jauge de voile (navire arrêté). */
  minSail: 0.05,
  /** Temps pour sortir ou rentrer les rames (s). */
  deployTime: 1.6,
  /** Coups d'aviron par seconde, balayage de la pale (rad, de part et d'autre) et levée au retour (rad). */
  strokeRate: 0.45,
  sweep: 0.32,
  lift: 0.2,
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

/** Un palier de rencontres ordinaires (voir ENEMIES.encounters). */
export interface EncounterStage {
  readonly fromKills: number;
  readonly groups: number;
  readonly size: readonly [number, number];
  readonly interval: readonly [number, number];
}

/** Sauvegarde de la partie (menu Échap, onglet Partie). */
export const SAVE = {
  /** Pas de sauvegarde si un ennemi est à moins de cette distance d'un navire de ta flotte (m). */
  enemyRange: 300,
};

/**
 * Voiles gonflées par le vent : face au vent, leur creux d'origine ; vent arrière, jusqu'à leur maximum, atteint à partir
 * de la force `fullStrength` (1 = WIND.referenceKnots, 20 nœuds : 1,75 = 35 nœuds). Vent de travers : à moitié. Le maximum
 * dépend de la hauteur de la voile : `small.max` fois son creux jusqu'à `small.height` m de haut, `large.max` à partir de
 * `large.height` m (grand-voile basse de la frégate), et entre les deux en proportion.
 */
export const SAIL_BILLOW = {
  small: { height: 2.4, max: 2.5 },
  large: { height: 8.4, max: 5.5 },
  fullStrength: 1.75,
  /** Voile aurique de poupe (brigantine de la frégate, artimon de la corvette) : toute sa courbure est multipliée par ceci. */
  aftSailCurve: 0.5,
  /** Finesse des toiles : environ une facette par `facet` mètres (`triangleFacet` pour un foc), entre `minSegments` et `maxSegments` par côté. */
  facet: 1,
  triangleFacet: 2,
  minSegments: 4,
  maxSegments: 14,
  /** Voile carrée : hauteur sous la vergue sur laquelle le surplus de creux s'installe (m), pour rester attachée à la vergue. */
  yardBlend: 1.5,
};

/** Naufrage d'un boss (seulement les boss) : explosion, secousse et léger zoom de la caméra, explosions sur l'épave. */
export const BOSS_SINK = {
  /** Secousse de la caméra (0 à 1) si le boss est à moins de `shakeRange` m du bateau piloté. */
  shake: 0.7,
  shakeRange: 400,
  /** Zoom : champ de vision réduit de cette fraction, pendant `zoomTime` s (montée rapide, retour lent). */
  zoom: 0.15,
  zoomTime: 2.5,
  /** Explosions sur l'épave qui coule : combien, et l'écart entre deux (s). */
  aftershocks: 4,
  aftershockInterval: [0.5, 0.9] as const,
};

/** « Voile à l'horizon ! » : annonce quand un ennemi repère un navire de ta flotte. */
export const ENCOUNTER_ALERT = {
  /** Durée du bandeau (s), et de l'anneau qui pulse autour de l'ennemi sur le radar (s). */
  bannerTime: 4,
  radarPing: 5,
};

/**
 * Coups critiques (tous les camps) : chance par boulet qui touche, tirée dans l'ordre (un seul par coup). Gréement,
 * gouvernail et incendie durent jusqu'à la réparation en mer : une fois qu'elle commence (REPAIR.delay sans combat),
 * chacun demande `repairTime` s (l'incendie d'abord, puis les deux autres ensemble).
 */
export const CRIT = {
  chance: { magazine: 0.003, fire: 0.025, rudder: 0.015, rigging: 0.025 },
  /** Un boulet dans le gréement (voiles, mâts) ne peut abattre qu'une voile, avec cette chance × celle de `chance.rigging`. */
  riggingHitFactor: 2.5,
  repairTime: { fire: 3, rudder: 5, rigging: 8 },
  /**
   * Gréement touché : une voile tombe, vitesse max réduite de cette fraction par voile abattue (au plus
   * `riggingMaxLoss`) ; plusieurs coups peuvent en abattre plusieurs, tant qu'il en reste cette part (`minSailsLeft`).
   */
  riggingSpeedLoss: 0.2,
  riggingMaxLoss: 0.45,
  minSailsLeft: 0.5,
  /** Gouvernail touché : vitesse de virage réduite de cette fraction. */
  rudderTurnLoss: 0.5,
  /** Incendie : dégâts par seconde (fraction de la vie max), sans jamais descendre sous `fireFloor` de la vie max. */
  fireDamage: 0.006,
  fireFloor: 0.1,
  /** Sainte-barbe : la réserve de poudre explose, dégâts (fraction de la vie max), secousse si c'est près de toi. */
  magazineDamage: 0.25,
  magazineShake: 0.6,
  /** Flammes, fumée noire en panache et braises de l'incendie (par seconde) ; lueur orange la nuit (taille du halo, ×). */
  flameRate: 12,
  smokeRate: 4,
  emberRate: 5,
  fireGlow: 3.5,
  /**
   * Sainte-barbe : taille de l'explosion, colonne de fumée noire qui reste (durée s, bouffées par seconde), débris
   * projetés autour (nombre, distance m).
   */
  magazineScale: 1.8,
  magazineSmoke: { time: 8, rate: 7 },
  magazineDebris: 9,
  magazineDebrisRange: [5, 14] as const,
  /**
   * Voile abattue : elle tombe (gravité m/s², dérive m/s, rotation rad/s), flotte (s, à cette hauteur au-dessus de
   * l'eau), puis coule (s, m/s) ; au plus `max` à la fois.
   */
  sailFall: { gravity: 7, drift: 1.6, spin: 1.6, float: 8, floatHeight: 0.15, sink: 4, sinkSpeed: 0.5, max: 8 },
  /** Un navire hors de ta flotte touché par un coup critique lâche un peu de butin (part du butin d'une épave). */
  lootFactor: 0.3,
};

/** Registre du capitaine. */
export const LEDGER = {
  /** Au-delà de ce déplacement en une image (m), le bateau piloté a été déplacé (réapparition) : ce n'est pas de la navigation. */
  maxStep: 30,
};

export const ENEMIES = {
  /**
   * Rencontres ordinaires selon les victoires (le dernier palier atteint s'applique) : au début, plusieurs navires seuls
   * assez souvent ; plus tard, une seule grosse flottille, plus rarement. `groups` : rencontres en même temps (un navire
   * seul ou une flottille = un groupe ; escadres de mission et boss à part) ; `size` : navires par rencontre (au plus ta
   * flotte + `fleetMargin`) ; `interval` : délai avant la rencontre suivante (s), décompté seulement sous `groups`.
   */
  encounters: [
    { fromKills: 0, groups: 3, size: [1, 1], interval: [40, 80] },
    { fromKills: 10, groups: 2, size: [1, 2], interval: [60, 120] },
    { fromKills: 25, groups: 2, size: [2, 3], interval: [90, 150] },
    { fromKills: 40, groups: 1, size: [3, 5], interval: [120, 180] },
  ] as readonly EncounterStage[],
  fleetMargin: 1,
  /** Délai avant le premier ennemi (s). */
  firstSpawnDelay: 30,
  /**
   * Abords des îles, plus calmes : à moins de `radius` m d'une côte, les apparitions ordinaires ralentissent de plus en
   * plus en approchant (jusqu'à `slowdown` fois plus lentes au rivage), et au plus `maxAlive` ennemis ordinaires à la
   * fois (les escadres de mission et les boss ne comptent pas).
   */
  nearIsland: { radius: 500, slowdown: 4, maxAlive: 2 },
  /** Flottilles : à partir de bigFromKills victoires, menées par un navire un cran plus gros. Écart entre deux places (m). */
  flotilla: { bigFromKills: 15, spacing: 18, slotTolerance: 8 },
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
  /** Triche de test (touche N) : un ennemi apparaît à cette distance (m), déjà lancé à ta poursuite. */
  cheatChaseDistance: 300,
  /**
   * Types d'ennemis selon le nombre d'ennemis déjà coulés : on commence contre des barques,
   * les chaloupes arrivent à partir de 5 victoires, les sloops à partir de 12, les brigantins à partir de 20,
   * les corvettes à partir de 35, la caraque, la galéasse et la frégate à partir de 50, le galion à partir de 80.
   * Poids relatifs (un type absent d'une étape n'apparaît pas).
   */
  composition: [
    { minKills: 0, weights: { rowboat: 1, longboat: 0, sloop: 0 } },
    { minKills: 5, weights: { rowboat: 0.5, longboat: 0.5, sloop: 0 } },
    { minKills: 12, weights: { rowboat: 0.25, longboat: 0.5, sloop: 0.25 } },
    { minKills: 20, weights: { rowboat: 0.15, longboat: 0.3, sloop: 0.25, caravel: 0.1, schooner: 0.05, brigantine: 0.12, xebec: 0.06 } },
    { minKills: 35, weights: { rowboat: 0.1, longboat: 0.2, sloop: 0.25, caravel: 0.1, schooner: 0.05, brigantine: 0.15, xebec: 0.08, fluyt: 0.04, brig: 0.06, corvette: 0.1 } },
    { minKills: 50, weights: { rowboat: 0.05, longboat: 0.1, sloop: 0.25, caravel: 0.1, schooner: 0.05, brigantine: 0.15, xebec: 0.08, fluyt: 0.05, brig: 0.08, corvette: 0.15, carrack: 0.06, galleass: 0.06, frigate: 0.1 } },
    { minKills: 80, weights: { rowboat: 0.05, longboat: 0.1, sloop: 0.25, caravel: 0.1, schooner: 0.05, brigantine: 0.15, xebec: 0.08, fluyt: 0.05, brig: 0.08, corvette: 0.15, carrack: 0.06, galleass: 0.06, frigate: 0.1, galleon: 0.05 } },
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
  /**
   * Chance de chaque allongement (brigantin, corvette, frégate) d'un ennemi à pleine menace (× la menace, comme les
   * améliorations) ; un allongement ouvre aussi ses niveaux d'amélioration en plus. Les boss sont toujours allongés.
   */
  extensionChance: 0.5,
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
    // Noms de types à trous (progression/blueprints.ts : `revealTypes`) : cachés tant que leur plan est incomplet.
    rumor: '{le:corvette} aux voiles noires qui rôde par grosse tempête',
    trophy: 'Arraché {au:corvette} aux voiles noires, au cœur de la tempête',
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
    rumor: '{le:brigantine} aux voiles en lambeaux qui hante le brouillard',
    trophy: 'Arraché {au:brigantine} aux voiles en lambeaux, au fond du brouillard',
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
/**
 * Combat flanc à flanc (tous les camps), réglé sur la portée de tir de chaque navire : ses canons de flanc, améliorations
 * et météo comprises.
 */
export const BROADSIDE = {
  /** Distance tenue une fois de flanc, en part de la portée (m / m). */
  holdFraction: 0.75,
  /** Il fonce droit sur sa cible au-delà de cette part de sa portée, et commence à virer en deçà. */
  turnAt: 1.15,
  /** Un ennemi qui a engagé le combat reprend la chasse (droit dessus, toute voile) au-delà de cette part de sa portée. */
  chaseAgain: 1.8,
};

export const HARASS = {
  /** Durée d'une attaque, comptée à moins de strikeRange × sa portée de tir de sa proie, avant de replonger dans la brume (s). */
  strikeTime: [12, 18] as const,
  strikeRange: 1,
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
   * niveau ou une étoile de moins, et une fois sur cinq une de plus ; ce tirage choisit le palier des tables (escadre,
   * embuscades…). Pour un combat, les étoiles affichées viennent ensuite de la menace réelle : chaque navire compte sa
   * taille (barque 1, chaloupe 2, sloop 3, brigantin 4, corvette 5, frégate 6), un navire d'élite × `eliteThreat` (le
   * chef d'une escadre l'est toujours) ; `threatStars` = points qu'il faut pour 2, 3, 4 et 5 étoiles (3 chaloupes =
   * 6 points = 1 étoile ; 4 sloops = 12 = 3 étoiles ; 4 frégates = 24 = 5 étoiles). Les primes « fixes » sont
   * multipliées selon les étoiles (`starReward`).
   */
  stars: 5,
  starReward: [1, 1.6, 2.3, 3.1, 4],
  threatStars: [7, 12, 17, 23],
  eliteThreat: 1.5,
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

/**
 * Missions spéciales de chaque île, dans l'ordre : CONTRACTS.specialsShown à la fois, la suivante après une réussite.
 * Les noms de types y sont à trous (« {t:sloop} », voir `typeToken` de progression/blueprints.ts) : ils restent
 * « navire inconnu » tant que leur plan n'est pas complet.
 */
export const SPECIAL_CONTRACTS: Record<IslandId, readonly SpecialContractDef[]> = {
  tortuga: [
    {
      id: 'morrow',
      kind: 'hunt',
      stars: 2,
      title: 'Le lieutenant Morrow',
      captain: 'Lieutenant Morrow',
      squadron: ['sloop', 'longboat'],
      description: 'Le lieutenant Morrow ({t:sloop} d’élite) et son escorte traquent les pêcheurs de la Tortue. Leur zone sera marquée sur ta carte (M). Coule son navire.',
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
      description: 'Le commodore Vane ({t:brigantine} d’élite) et deux {ts:sloop} patrouillent au large. Leur zone sera marquée sur ta carte (M). Coule son navire.',
    },
    {
      id: 'crownFleet',
      kind: 'defend',
      stars: 4,
      title: 'La flotte de la Couronne',
      squadron: ['brigantine', 'brigantine', 'sloop', 'sloop', 'sloop', 'longboat'],
      description: 'Six navires de la Marine marchent sur la Tortue. Ils attaqueront le fort 40 s après ton accord : coule-les tous avant qu’il ne tombe. Prime versée sur-le-champ.',
    },
    { id: 'widowBounty', kind: 'sinkBoss', stars: 5, boss: 'widow', title: 'Prime sur La Veuve Noire', description: 'Coule La Veuve Noire, {le:corvette} aux voiles noires qui rôde par grosse tempête.' },
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
      description: 'Le capitaine Rackham ({t:brigantine} d’élite), chasseur de pirates, rôde avec {un:sloop}. Leur zone sera marquée sur ta carte (M). Coule son navire.',
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
      description: 'Une escadre de six navires, {un:corvette} en tête, assiégera la citadelle 40 s après ton accord. Coule-la avant que les remparts ne tombent. Prime versée sur-le-champ.',
    },
    { id: 'spectreBounty', kind: 'sinkBoss', stars: 5, boss: 'spectre', title: 'Prime sur Le Spectre', description: 'Coule Le Spectre, {le:brigantine} aux voiles en lambeaux qui hante le brouillard.' },
  ],
  royale: [],
  dauphin: [],
};

/**
 * Trahison (bouton « Trahir », touche R) : un clic sur un pirate allié ou un marchand des îles le fait passer à
 * l'ennemi, tel quel (copie exacte, seul le camp change). Il faut qu'il soit à portée de vue.
 */
export const BETRAYAL = {
  /** Distance maximale du navire piloté (m), et jamais au-delà de la brume. */
  range: 300,
  /** Marge autour de la silhouette d'un navire à l'écran pour le cliquer (px). */
  pickMargin: 14,
  /** Durée du message de trahison (s). */
  toastSeconds: 3.5,
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
  /** Points de la côte d'une terre ronde (× l'étirement pour une terre allongée). */
  coastSteps: 72,
};

/** Une vague de Gerstner. La somme des `steepness` doit rester < 1 (sinon les crêtes se replient). */
export interface WaveParams {
  dirX: number;
  dirZ: number;
  /** Raideur 0..1 : amplitude = steepness × wavelength / 2π. */
  steepness: number;
  /** Longueur d'onde (m). */
  wavelength: number;
  /**
   * Houle de fond (OCEAN.groundSwell) : bien plus longue que tout navire, la coque la suit entièrement (le pilonnement
   * réduit des gros navires, BUOYANCY.heaveExponent, ne s'applique qu'aux autres vagues).
   */
  long?: boolean;
}

/**
 * Grand mât d'une frégate ou d'un galion allongé (`balancedMainMast`, parts/hullStretch.ts) : part du chemin entre sa
 * place étirée avec la coque et le milieu entre misaine et artimon (0 = étiré, 1 = au milieu). Sinon, l'artimon recule
 * avec le château arrière et le grand mât paraît trop en avant.
 */
export const EXTENDED_MASTS = { mainBalance: 1 };

/**
 * Voiles d'étai (ship/parts/staysails.ts) : l'étai part de la hune du mât arrière (part de la hauteur pied → hune,
 * `stayHigh` ; au-delà de 1 : part de la hune à la tête) et descend vers le mât avant (`stayLow`) ; la toile pend dessous, à `foreGap` / `aftGap` m des mâts,
 * jusqu'à `footClearance` m au-dessus du plus haut des deux ponts ; creux, grille, taille carguée (part de la chute),
 * écart de voilure sous lequel la toile n'est pas redessinée.
 */
export const STAYSAILS = {
  stayHigh: 0.98,
  stayLow: 0.45,
  foreGap: 1,
  aftGap: 2.6,
  footClearance: 2.4,
  /** Deux voiles superposées (avant de la frégate et du galion) : hauteurs des deux étais, écart entre la voile du haut et l'étai du bas (m). */
  double: { lowAft: 1, lowFore: 0.72, highAft: 1.55, highFore: 1.1, gap: 0.7 },
  bulge: 0.55,
  /**
   * Niveau de voilure qui fait apparaître chaque voile d'étai, dans l'ordre : la (basse) de l'avant, la haute de
   * l'avant (frégate, galion), celle entre artimon et grand mât (galion).
   */
  unlock: [1, 2, 3],
  segments: 6,
  furled: 0.12,
  step: 0.01,
};

/**
 * Lampes des navires (ship/parts/lampParts.ts, ship/parts/shipLamps.ts), en plus des fanaux de poupe : lampadaires sur
 * le pont (poteau), appliques murales des cloisons, lanternes suspendues qui se balancent (sous un barrot, le rebord
 * d'un château, une vergue fixe, ou au bout d'une potence), dont la lanterne de hune. Chaque modèle déclare une liste
 * ordonnée de places, coupée à `extra[type] + perExtension[type] × allongements` (`lampsFor`) : plus le navire est
 * gros, plus il en porte. `headClear` : hauteur libre (m) à laisser sous une lanterne suspendue, au-dessus d'un pont où
 * l'on marche (les matelots et le joueur passent à travers elle, comme à travers toute lanterne suspendue).
 */
export const SHIP_LAMPS = {
  extra: { sloop: 1, schooner: 1, caravel: 3, brigantine: 3, xebec: 3, fluyt: 4, brig: 4, corvette: 4, carrack: 6, galleass: 6, frigate: 6, galleon: 8 } as Partial<Record<ShipType, number>>,
  perExtension: { schooner: 1, brigantine: 1, xebec: 1, fluyt: 1, brig: 1, corvette: 1, carrack: 2, galleass: 2, frigate: 2, galleon: 2 } as Partial<Record<ShipType, number>>,
  headClear: 1.75,
  /**
   * Applique : hauteur du centre du verre au-dessus du pont (m), et écart au moins sous le pont du dessus (château bas) ;
   * allongement le plus long d'un navire (pour retrouver le niveau d'un plan).
   */
  wallHeight: 1.75,
  wallTopGap: 0.35,
  maxLevel: 2,
  /**
   * Lanterne (taille 1, m), la même pour toutes les sortes : verre (côté, hauteur), épaisseur des montants et des
   * plaques, chapeau à deux gradins (côté du premier, part du second, hauteur de chacun), anneau du dessus.
   */
  lantern: { glass: 0.14, glassHeight: 0.2, frame: 0.025, cap: 0.21, capTop: 0.55, capHeight: 0.045, ring: 0.06 },
  /** Lampadaire : hauteur du poteau par défaut (m), rayon du poteau en haut (× `taper` au pied), côté et hauteur du socle (m). */
  post: { height: 1.25, radius: 0.035, taper: 1.2, foot: 0.16, footHeight: 0.06 },
  /**
   * Applique murale (taille 1, m) : écart du centre du verre au mur, platine (largeur, hauteur, épaisseur), épaisseur
   * de la tablette ; jambe de force : hauteur de son pied sous la tablette, part de la tablette où elle la rejoint.
   */
  wall: { offset: 0.2, plate: [0.12, 0.32, 0.025] as const, bracket: 0.03, brace: [0.13, 0.7] as const },
  /**
   * Lanterne suspendue : longueur de tige par défaut (m), épaisseur de la tige, côté du piton (taille 1) ; potence
   * (bras fixé à un mur ou à un mât : épaisseur, platine, jambe de force comme celle d'une applique).
   * Balancement : pendule amorti dans le monde, que seule l'accélération de son point d'attache met en branle (le navire
   * roule et tangue autour de lui) : g (m/s²), part de la fréquence d'un vrai pendule de cette longueur, amortissement
   * (part de l'amortissement critique), écart au plus avec la verticale du navire (rad, butée) ; part de l'accélération
   * du point d'attache ressentie, lissage de cette accélération (/s), au plus (m/s²), pesanteur apparente au moins (part
   * de g) ; pas de temps au plus (s) ; après un arrêt plus long (navire lointain ou dans la brume, s) ou un saut du
   * navire (m/s), la lanterne repart d'aplomb.
   */
  hanging: {
    drop: 0.3,
    rod: 0.018,
    eye: 0.05,
    arm: 0.035,
    armPlate: [0.1, 0.22, 0.025] as const,
    armBrace: [0.22, 0.7] as const,
    gravity: 9.81,
    pace: 0.8,
    damping: 0.08,
    maxAngle: 0.6,
    inertia: 1,
    accelSmoothing: 6,
    maxAccel: 5,
    minWeight: 0.5,
    maxStep: 0.05,
    resetAfter: 0.3,
    jump: 25,
  },
  /**
   * Lanterne de hune (`mastTopLamp`), pendue sous le bord arrière de la hune du grand mât : en deçà du bord (m), tige
   * (m), taille, halo (× celui d'un fanal : elle se voit de loin).
   */
  top: { inset: 0.2, drop: 0.08, scale: 1.4, halo: 1.6 },
};

export type EmblemId = 'skull' | 'sabres' | 'kraken' | 'serpent' | 'compass' | 'anchor' | 'raven' | 'mermaid';

/**
 * Emblèmes peints sur la grande voile d'un navire de ta flotte (onglet Chantier) : prix pour en peindre un nouveau
 * (revenir à un emblème déjà payé pour ce navire est gratuit), nom, couleurs principale et seconde du dessin.
 */
export const EMBLEMS = {
  price: 150,
  designs: {
    skull: { name: 'Tête de mort', main: 0x1d1714, second: 0xe9dfc7 },
    sabres: { name: 'Sabres croisés', main: 0x5a1a12, second: 0x2a2622 },
    kraken: { name: 'Kraken', main: 0x5b1e3a, second: 0xf2d27a },
    serpent: { name: 'Serpent de mer', main: 0x1f4a3a, second: 0xd8c27a },
    compass: { name: 'Rose des vents', main: 0x7a1c14, second: 0x1d1714 },
    anchor: { name: 'Ancre', main: 0x1d2a44, second: 0xb08a3a },
    raven: { name: 'Corbeau', main: 0x141210, second: 0xc23a22 },
    mermaid: { name: 'Sirène', main: 0x1e4a5a, second: 0xb8542a },
  } satisfies Record<EmblemId, { name: string; main: number; second: number }>,
};

/** Carte (M) : zoom au plus (× le cadrage d'ensemble), vitesse de la molette (par unité de défilement). */
export const MAP_VIEW = { maxZoom: 8, wheelSpeed: 0.0015 };

/**
 * Brume de découverte de la carte (M) : la carte ne montre que ce que le radar du bateau piloté a balayé
 * (`progression/mapDiscovery.ts`), le reste est un lavis de parchemin vierge (`ui/mapFog.ts`), sauf tes objectifs.
 * La grille couvre le cercle du bord du monde et sa tempête (WORLD_EDGE.radius + band) plus `margin` m, en cases de
 * `cell` m. Une nouvelle découverte se fait quand le bateau a bougé de `step` m, ou que la portée du radar a changé
 * d'autant. Au départ d'une partie, on connaît la Tortue et `startMargin` m autour de sa côte (de même pour chaque île
 * déjà visitée d'une ancienne sauvegarde).
 */
export const MAP_FOG = {
  cell: 25,
  margin: 200,
  step: 25,
  startMargin: 300,
  /**
   * Lavis (`ui/fogMask.ts`) : texel du masque (m) ; la limite est floutée (écart type, en cases), puis rendue
   * irrégulière par un bruit (`wobble` : amplitude, en part du champ flouté ; `noise` : [longueur d'onde (m), poids] de
   * chaque octave). `soft` : largeur du fondu de part et d'autre de la limite ; `rim` : largeur du bord assombri, côté
   * inconnu (le pigment s'y accumule), `rimStrength` sa force (0 à 1). Ces trois largeurs sont en part du champ
   * flouté (près de la limite, 0,1 ≈ 10 m). Garder `wobble` + `rim` et `wobble` + `soft` sous 0,5.
   */
  texel: 10,
  blur: 1.6,
  wobble: 0.27,
  noise: [[240, 0.55], [100, 0.3], [44, 0.15]] as const,
  soft: 0.09,
  rim: 0.22,
  rimStrength: 0.65,
  /**
   * Couleurs du parchemin vierge (RVB) : fond, taches (longueur d'onde `stainScale` m, force `stainStrength`, effacées
   * sur les `stainFade` derniers m de la grille, au-delà de laquelle le parchemin est uni) et bord.
   */
  paper: [239, 223, 184] as const,
  stain: [221, 195, 146] as const,
  stainScale: 1000,
  stainStrength: 0.45,
  stainFade: 400,
  rimColor: [128, 86, 42] as const,
};

export const OCEAN = {
  /** Demi-taille de la grille d'eau (m), recentrée sur le joueur. */
  halfSize: 900,
  /**
   * Les vagues s'apaisent près d'une île dès `calmDistance` × ce facteur du rivage (LandShapeDef.calmDistance),
   * progressivement (courbe en S jusqu'au rivage). Garder SDF.far (world/landmass.ts) au-delà du plus grand résultat.
   */
  calmReach: 2,
  /**
   * Fond marin autour des terres : pente douce sur `shelf` m après le rivage, puis plus raide jusqu'à `maxDepth` (m),
   * assez profond pour que les creux de la grande houle ne le découvrent jamais.
   */
  seabed: { shelf: 20, shelfSlope: 0.15, slope: 0.35, maxDepth: 70 },
  /**
   * Au-delà de cette distance du joueur (m), plus d'eau dessinée (coin de la grille : halfSize × √2) : un navire n'y
   * calcule ni sa flottaison ni l'animation de son gréement (`Ship.far`).
   */
  farShips: 1300,
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
  /**
   * Houle de fond de la grande tempête : deux vagues gigantesques (≈ 22 m et ≈ 6 m du creux à la crête, 300 et 215 m
   * entre deux crêtes, ≈ 14 s entre deux passages), nulles par tout autre temps (raideur = celle-ci
   * × WeatherProfile.groundSwell). Après la houle et le clapot dans la liste des vagues.
   */
  groundSwell: [
    { dirX: 1, dirZ: 0.3, steepness: 0.23, wavelength: 300, long: true },
    { dirX: 0.85, dirZ: -0.4, steepness: 0.09, wavelength: 215, long: true },
  ] as WaveParams[],
  /** Bleu du large (creux des vagues), et teinte du haut des vagues (part de cette teinte au sommet : `crestTint`). */
  deepColor: 0x072c42,
  shallowColor: 0x135a72,
  crestTint: 0.6,
  /** Lumière turquoise qui traverse les crêtes à contre-jour. */
  scatterColor: 0x3fe0c8,
  foamColor: 0xf4fbff,
  /** Eau peu profonde autour de l'île. */
  lagoonColor: 0x35c9c0,
  /** Force des petites rides de surface, et échelle (répétitions par mètre) de leurs deux couches. */
  rippleStrength: 0.08,
  rippleScales: [0.07, 0.18] as const,
};

/**
 * Traces dans l'eau, dessinées par le shader de l'océan :
 * - une texture vue de dessus, centrée sur le joueur, où chaque bateau « peint » son sillage (il suit ses virages
 *   et s'efface peu à peu), ainsi que les boulets tombés à l'eau, les naufrages et le butin qui flotte ;
 * - un liseré d'écume collé à la coque des bateaux proches, calculé directement à partir de leur position.
 */
/** Masque d'eau des navires pontés : hauteur au-dessus du pont principal (m), au lieu du plat-bord. */
export const WATER_MASK = { aboveDeck: 0.35 };

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
  idleFoam: 0.55,
  /** Largeur du liseré des coques : × (demi-largeur / foamWidthRef), entre 1 et foamWidthMax (grandes coques). */
  foamWidthRef: 1.75,
  foamWidthMax: 2.5,
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

/**
 * Jour et nuit : l'heure suit la journée des contrats (CONTRACTS.dayLength, 10 min) ; une journée commence à l'aube
 * (`dawnHour`, lever du soleil). Le soleil suit une course inclinée (`tilt`, jamais au zénith), relevée de `lift` :
 * plus de jour que de nuit (lever ~5 h, coucher ~19 h). La lune, à l'opposé, monte la nuit. La météo garde ses
 * couleurs de jour ; la nuit et le crépuscule s'y composent (world/skyLighting.ts). Couleurs : nuit claire et lisible.
 */
export const DAY_NIGHT = {
  /** Heure de l'aube (début d'une journée des contrats). */
  dawnHour: 5,
  /** Course du soleil, puis de la lune (plus basse) : inclinaison (rad) et relèvement (part du rayon). */
  tilt: 0.6,
  lift: 0.22,
  moonTilt: 1.1,
  moonLift: 0.1,
  /** Ciel et horizon (brume) de nuit, par ciel dégagé ; plus sombres sous les nuages (× nightCloudy). */
  nightZenith: 0x0a1633,
  nightHorizon: 0x22345a,
  nightCloudy: 0.55,
  /** Crépuscule et aube : horizon, zénith et soleil dorés. */
  duskHorizon: 0xf0a878,
  duskZenith: 0x50609a,
  duskSun: 0xffa865,
  /** Part de la teinte dorée au plus fort du crépuscule : zénith, horizon (brume). */
  duskZenithMix: 0.6,
  duskHorizonMix: 0.55,
  /** Lune : couleur (disque, halo, reflet, lumière) et intensité de sa lumière par ciel dégagé. */
  moonColor: 0xc4d2ff,
  moonIntensity: 1.1,
  /** Part de la lune qui perce un ciel couvert (lumière, disque). */
  moonThroughClouds: 0.3,
  /** Lumière ambiante la nuit : couleurs, et part de l'intensité de jour (jamais nulle : on voit les navires). */
  nightAmbientSky: 0x6078b8,
  nightAmbientGround: 0x141c28,
  nightAmbient: 0.5,
  /** Eau la nuit : luminosité du corps de l'eau et de l'écume (part de celle de jour). */
  nightWater: 0.3,
  nightFoam: 0.4,
  /** Pluie et filets de vent la nuit (part de leur couleur de jour). */
  nightEffects: 0.12,
  /** Les éclairs la nuit : lueur un peu atténuée (sinon le ciel noir vire au gris clair). */
  nightFlash: 0.6,
  /**
   * Les lumières (fanaux, fenêtres, halos) s'allument quand la lumière du soleil (heure et nuages) passe sous
   * `lightsOn[0]`, pleinement à `lightsOn[1]` : au crépuscule, et aussi dans le brouillard ou sous l'orage.
   */
  lightsOn: [0.75, 0.25] as const,
  /** Fanaux (intensité émissive de jour → allumés) et fenêtres éclairées (couleur, intensité). */
  lanternGlow: [0.9, 2.6] as const,
  windowColor: 0xffb04a,
  windowGlow: [0, 1.3] as const,
  /**
   * Halos des fanaux : taille (m, grandit avec la distance pour rester lisible de loin), décroissance de la lueur en
   * cloche (plus grand = plus resserrée), éclat la nuit et part de cet éclat de jour (brouillard, pluie), portée (m),
   * nombre max. Ils ne s'additionnent pas : là où plusieurs se recouvrent, seul le plus vif compte.
   */
  haloSize: 1.3,
  haloGrowth: 0.022,
  haloFalloff: 3.5,
  haloIntensity: 0.8,
  haloDaylight: 0.35,
  haloRange: 320,
  maxHalos: 160,
  /**
   * Lumière des fanaux (fx/lampLights.ts) : les plus proches de la caméra éclairent vraiment, par des lumières
   * ponctuelles de la scène (leur nombre est un réglage graphique) : portée (m), décroissance, éclat (candela) ; et
   * l'eau, jusqu'à `water` lampes : éclat, flaque de lumière (force, rayon m), chemin de reflets (éclat net, halo, rayon
   * m). Sélection autour de la caméra (m) ; part du bord de la sélection et de la portée où une lampe s'efface ;
   * scintillement (part de l'éclat). Incendie : couleur, éclat (× un fanal), scintillement, priorité (compte comme
   * autant de fois plus proche).
   */
  lamps: {
    distance: 16,
    decay: 1.5,
    intensity: 9,
    /** Teinte de la lumière : celle du fanal, mêlée de blanc dans cette part (moins orange sur les voiles proches). */
    whiten: 0.35,
    water: 8,
    waterIntensity: 1,
    waterPool: 0.12,
    poolRadius: 4,
    glint: 0.7,
    glintHalo: 0.01,
    glintRadius: 22,
    range: 140,
    fade: 0.25,
    flicker: 0.06,
    fireColor: 0xff7a28,
    fire: 4,
    fireFlicker: 0.3,
    firePriority: 3,
  },
  /** La nuit, la Marine patrouille moins : rencontres ordinaires plus rares (délai × ce facteur en pleine nuit). */
  encounterSlowdown: 2.5,
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
  /** Houle de fond gigantesque (OCEAN.groundSwell, 0..1) : celle de la grande tempête. */
  groundSwell: number;
  /** Multiplie les dégâts d'un paquet de mer (vagues plus hautes, plus puissantes). */
  seaPower: number;
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
    groundSwell: 0,
    seaPower: 1,
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
    groundSwell: 0,
    seaPower: 1,
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
    groundSwell: 0,
    seaPower: 1,
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
    groundSwell: 0,
    seaPower: 1,
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
    groundSwell: 0,
    seaPower: 1,
  } satisfies WeatherProfile,
  /**
   * Grande tempête : pluie et vent modérés, ciel gris et bas mais on voit loin, et surtout une houle de fond
   * gigantesque (OCEAN.groundSwell) : de longues collines d'eau qui soulèvent et engloutissent les navires. Paquets de
   * mer plus rares qu'en grosse tempête mais bien plus violents ; combat un peu gêné.
   */
  greatStorm: {
    fogNear: 90,
    fogFar: 450,
    fogColor: 0x8e999e,
    zenithColor: 0x5e6b72,
    sunlight: 0.3,
    ambientIntensity: 1.05,
    sunIntensity: 0.65,
    waveFactor: 1.2,
    windMin: 18,
    windMax: 27,
    rangeFactor: 0.85,
    detectionFactor: 0.85,
    rain: 0.4,
    lightning: 0,
    windStreaks: 0.12,
    chop: 0.15,
    turnFactor: 0.9,
    seaDamage: 0.5,
    strikeFactor: 1,
    seaFoam: 0.3,
    groundSwell: 1,
    seaPower: 4,
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
  /** Un appui relâché sans avoir bougé de plus de `clickSlop` px (cumulés) en moins de `clickTime` ms est un clic, pas un glisser. */
  clickSlop: 6,
  clickTime: 400,
};

/**
 * Roue de barre des navires pontés : angle (rad) pour la barre toute (elle tourne du côté où l'on vire : barre à
 * bâbord, le haut de la roue part vers bâbord).
 */
export const HELM_WHEEL = { turns: 1.3 };

/**
 * Première personne (camera/firstPersonView.ts) : hauteur de l'œil du barreur au-dessus de ses pieds et recul derrière
 * son poste (m), assez pour voir par-dessus la roue ; regard un peu baissé au départ (rad) ; sur une barque sans plan de
 * pont, œil à `boatEye` m, à `boatStern` de la longueur vers l'arrière ; rad par pixel de souris ; regard levé ou baissé
 * au plus (rad) ; mouvement de souris au-delà duquel un événement est un raté du navigateur (px) ; plan proche de la
 * caméra dans cette vue et dans la vue de loin (m).
 */
export const HELM_VIEW = { eyeHeight: 1.8, behindWheel: 0.35, startPitch: -0.15, boatEye: 1.1, boatStern: 0.3, sensitivity: 0.0025, maxPitch: 1.3, maxMouseStep: 400, near: 0.06, chaseNear: 0.5 };

/**
 * Le joueur à pied sur son pont (player/) : hauteur des yeux (m), rayon du corps (petit : les obstacles ont déjà leur
 * marge dans la grille), marche et course (m/s), accélération au sol et en l'air (/s), saut (m/s ; ~0,8 m de haut avec
 * la gravité), gravité (m/s²), marche franchie en montant et en descendant sans tomber, surface où l'on se pose en
 * l'air au-dessus des pieds, lissage des marches ; échelles (distance où l'on y monte, direction du regard nécessaire,
 * vitesse d'escalade m/s) ; haubans (part de la longueur où l'on monte quand il ne mène à aucune hune, marche au pied,
 * distance où E y fait grimper) ; hune (distance du haut d'un hauban où E fait redescendre, départ sous le bord, m) ;
 * barre (distance où E la reprend, recul en la quittant, place laissée au barreur) ; balancement de la tête (hauteur m,
 * rythme par mètre, vitesse sous laquelle il ne se voit pas) ; emprise du pont (marge sous le pont le plus bas et
 * au-dessus du plus haut, m ; rangées voisines, devant et derrière, dont une rangée prend aussi l'emprise commune : cloisons).
 */
export const PLAYER = {
  eyeHeight: 1.55,
  radius: 0.05,
  walkSpeed: 2.2,
  runSpeed: 4.4,
  accel: 12,
  airAccel: 3,
  jumpSpeed: 4,
  gravity: 9.8,
  stepUp: 0.42,
  stepDown: 0.45,
  airStep: 0.25,
  stepSmooth: 16,
  ladderReach: 0.7,
  ladderFacing: 0.5,
  climbSpeed: 1.2,
  /** Escalade avec Maj enfoncée : vitesse × ce facteur. */
  climbRun: 1.8,
  shroudReach: 0.6,
  shroudStep: 0.1,
  shroudRange: 1.2,
  topReach: 0.7,
  topStep: 0.3,
  helmReach: 1.3,
  leaveBack: 0.8,
  helmClear: 0.7,
  bob: { height: 0.035, frequency: 5.5, minSpeed: 0.3 },
  footing: { below: 0.3, above: 1, rows: 2 },
  /** Chute sous le pont le plus bas (m) au-delà de laquelle on revient au dernier endroit sûr. */
  lostFall: 2,
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
  /** Fanaux qui éclairent vraiment la scène la nuit (lumières ponctuelles ; l'eau reçoit leur lueur dans tous les cas). */
  lampLights: number;
}

export const GRAPHICS = {
  presets: {
    low: { resolution: 0.75, dynamicResolution: false, antialias: false, fpsLimit: 0, oceanGrid: 128, farWater: 'simple', wakeResolution: 512, weatherDensity: 0.3, particleDensity: 0.3, lampLights: 2 },
    medium: { resolution: 1, dynamicResolution: false, antialias: false, fpsLimit: 0, oceanGrid: 192, farWater: 'simple', wakeResolution: 1024, weatherDensity: 0.6, particleDensity: 0.6, lampLights: 4 },
    high: { resolution: 1.5, dynamicResolution: false, antialias: true, fpsLimit: 0, oceanGrid: 256, farWater: 'detailed', wakeResolution: 1024, weatherDensity: 1, particleDensity: 1, lampLights: 6 },
    auto: { resolution: 1.5, dynamicResolution: true, antialias: true, fpsLimit: 0, oceanGrid: 256, farWater: 'detailed', wakeResolution: 1024, weatherDensity: 1, particleDensity: 1, lampLights: 6 },
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
    lampLights: [0, 2, 4, 6],
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
 * Forme d'une terre (île à port ou îlot). Sa côte est un rayon qui varie selon l'angle (cap, 0 = nord / +Z) : rayon moyen + quelques
 * ondulations, moins une crique creusée en direction de `bay.angle`, où se niche le port. Cette forme peut être
 * étirée (`stretch`) le long d'un grand axe tourné vers `rotation` : les ondulations et la crique se mesurent alors
 * dans le repère de la forme (cercle avant étirement). La même formule sert au relief, aux collisions, à l'évitement,
 * au radar et au shader de l'eau.
 */
export interface LandShapeDef {
  center: readonly [number, number];
  radius: number;
  /** Ondulations de la côte : [nombre de bosses sur le tour, amplitude (m), phase (rad)], au plus ISLAND_LOBES. */
  lobes: readonly (readonly [number, number, number])[];
  /**
   * Allongement : rapport longueur / largeur de l'île (1 = ronde, par défaut), à surface égale, le long d'un grand
   * axe orienté vers le cap `rotation` (rad, 0 par défaut = nord-sud).
   */
  stretch?: number;
  rotation?: number;
  /**
   * Courbure : décalage des deux bouts du grand axe vers bâbord (sa gauche, m ; négatif = vers tribord) par rapport au
   * milieu, en arc de parabole. Modérée seulement : la côte doit rester visible depuis le centre (radar, carte, `pointAt`).
   */
  bend?: number;
  /**
   * Crique : direction de son ouverture (cap, dans le monde : le port est sur la côte dans cette direction depuis le
   * centre), largeur angulaire (rad) et profondeur (m), mesurées dans le repère de la forme. Facultative pour un îlot.
   */
  bay?: { angle: number; width: number; depth: number };
  /** Relief : collines douces derrière de larges plages, ou falaises au-dessus d'une plage étroite. */
  relief: 'hills' | 'cliffs';
  /** Hauteur des sommets (m) et des falaises (relief 'cliffs'). */
  peak: number;
  cliff: number;
  /**
   * Les vagues sont atténuées sur cette distance au large de la côte (m) : nulles au rivage. 0 = pas d'atténuation
   * (îlot rocheux sans vraie plage : moins de calcul pour l'eau).
   */
  calmDistance: number;
  /** Largeur du lagon turquoise (m) et du ressac blanc (m) le long du rivage. */
  lagoonWidth: number;
  surfWidth: number;
  /** Herbe (claire, sombre) : les îles rocheuses sont plus sèches. */
  grass: number;
  darkGrass: number;
}

/** Une île à port (fiche de campagne `ISLAND_INFO`) : sa crique abrite le port, et parfois une ville derrière. */
export interface IslandShapeDef extends LandShapeDef {
  bay: { angle: number; width: number; depth: number };
  /**
   * Replat d'une ville derrière le port (en plus de celui du village) : centré à `inland` m à l'intérieur des terres
   * depuis le quai, plat sur `radius[0]` m, puis rejoint le relief à `radius[1]` m.
   */
  town?: { inland: number; radius: readonly [number, number] };
}

/** Nombre d'ondulations au plus par côte (taille des tableaux du shader de l'eau ; les manquantes sont nulles). */
export const ISLAND_LOBES = 6;
/**
 * Îles envoyées au shader de l'eau, au plus : les plus proches du joueur parmi celles qui touchent la grille de l'eau
 * (`islandShader.ts`). Chaque pixel d'eau ne parcourt que celles-là, quel que soit le nombre d'îles du monde.
 */
export const ISLAND_SLOTS = 8;

export type IslandId = 'tortuga' | 'sabre' | 'royale' | 'dauphin';

/** Îlots : terres de décor ou lieux de quête, sans port ni fiche de campagne (rien à sauvegarder). */
export type IsletId = 'castaway';

/** Décor semé sur une terre : palmiers, pins (au-dessus de `pineFrom` m), rochers, graine du tirage, altitude max (m). */
export interface LandDecor {
  palms: number;
  pines: number;
  rocks: number;
  seed: number;
  palmHeight: number;
  pineFrom: number;
  pineHeight: number;
}

/** Un îlot : sa forme, son nom sur la carte et son décor. */
export interface IsletDef extends LandShapeDef {
  name: string;
  decor: LandDecor;
}

export const ISLETS: Record<IsletId, IsletDef> = {
  /**
   * Le Banc du Naufragé : un banc de sable blanc étroit (≈ 360 × 45 m) entre la Tortue et l'Île Royale, une rangée de
   * palmiers penchés, un lagon turquoise de chaque côté, une chaloupe échouée sur la plage.
   */
  castaway: {
    name: 'Le Banc du Naufragé',
    center: [900, 1100],
    radius: 64,
    stretch: 8,
    rotation: 0.8,
    bend: 26,
    lobes: [
      [3, 5, 0.4],
      [2, 3, 1.9],
      [5, 1.5, 2.6],
    ],
    relief: 'hills',
    peak: 2.6,
    cliff: 0,
    calmDistance: 70,
    lagoonWidth: 45,
    surfWidth: 4,
    grass: 0x9fbf6a,
    darkGrass: 0x7fa354,
    decor: { palms: 16, pines: 0, rocks: 5, seed: 333, palmHeight: 4, pineFrom: 0, pineHeight: 0 },
  },
};

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
  /**
   * Île Royale : 2 km au nord, la plus grande (1,5 × la Tortue), tenue par la Marine. Falaises et collines boisées,
   * herbe plus sombre ; sa crique, profonde, regarde vers la Tortue.
   */
  royale: {
    center: [200, 2000],
    radius: 255,
    lobes: [
      [2, 22, 1.2],
      [3, 16, 3.4],
      [5, 10, 0.9],
      [7, 5, 2.6],
    ],
    bay: { angle: Math.PI + 0.1, width: 0.45, depth: 130 },
    relief: 'cliffs',
    peak: 62,
    cliff: 12,
    calmDistance: 180,
    lagoonWidth: 40,
    surfWidth: 6,
    grass: 0x5d8f45,
    darkGrass: 0x3d6b33,
    // La ville de l'arsenal, derrière Port-Royal.
    town: { inland: 50, radius: [55, 120] },
  },
  /** Île du Dauphin : 1,3 km à l'ouest (+X), petite et basse, poste de la Marine ; sa crique regarde vers la Tortue. */
  dauphin: {
    center: [1300, 200],
    radius: 110,
    lobes: [
      [2, 9, 0.7],
      [3, 7, 2.1],
      [5, 4, 4.0],
      [7, 2, 1.3],
    ],
    bay: { angle: -1.72, width: 0.5, depth: 55 },
    relief: 'hills',
    peak: 22,
    cliff: 0,
    calmDistance: 120,
    lagoonWidth: 55,
    surfWidth: 5,
    grass: 0x6aa64a,
    darkGrass: 0x4d8a3a,
  },
};

/**
 * Bord du monde : un cercle autour de l'archipel (toutes les îles prévues de la première mer, avec une petite marge),
 * au-delà duquel règne une tempête géante (`world/worldEdge.ts`). Elle s'annonce sur `approach` m avant le bord : le
 * temps affiché glisse vers la grosse tempête (ciel noir, mer énorme), sans changer le temps du reste du monde. Passé
 * le bord, la foudre frappe chaque navire de plus en plus souvent (délai entre deux coups au bord, puis à `band` m au
 * delà, s ; dégâts en part de la vie max), sans alerte ni message : on s'en sort en faisant demi-tour à temps.
 */
export const WORLD_EDGE = {
  center: [-150, 450] as const,
  radius: 3500,
  approach: 400,
  band: 300,
  strikeInterval: [7, 1.2] as const,
  strikeDamage: 0.15,
  /** Le premier coup tombe après ce délai (s), une fois le bord passé. */
  firstStrike: 2.5,
  /** Les IA restent à cette distance en deçà du bord (m), et rien n'apparaît plus loin. */
  margin: 300,
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
export type IslandUpgradeId = 'fort' | 'citadel' | 'royalFort' | 'dock' | 'shipyard' | 'workshop' | 'counter' | 'lighthouse' | 'smuggling' | 'moorings';

/** Ce que le joueur sait d'une île : son port, qui la tient, son marché, ce qu'on peut y construire. */
export interface IslandInfoDef {
  name: string;
  portName: string;
  /** Nom court dans les phrases (« jusqu'à la Tortue », « attaque Port-Sabre »). */
  shortName: string;
  /** Son fort : nom affiché, nom commun et genre (« le fort », « la citadelle ») ; `proper` : nom propre, sans article dans une phrase (Fort-Royal). */
  fort: { name: string; noun: string; feminine: boolean; proper?: boolean };
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
  /** Ce qui est déjà bâti quand tu prends l'île (arsenal de la Marine) : niveau minimal de ces améliorations. */
  captureLevels?: Partial<Record<IslandUpgradeId, number>>;
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
    upgrades: ['fort', 'dock', 'shipyard', 'moorings', 'workshop', 'counter', 'lighthouse'],
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
    upgrades: ['citadel', 'shipyard', 'moorings', 'smuggling'],
  },
  royale: {
    name: 'Île Royale',
    portName: 'Port-Royal',
    shortName: 'Port-Royal',
    fort: { name: 'Fort-Royal', noun: 'fort', feminine: false, proper: true },
    allegiance: 'navy',
    holders: 'La Marine royale',
    owned: false,
    // Pas à vendre : il faut abattre Fort-Royal, puis accoster.
    price: null,
    description: 'Grande île boisée au nord, arsenal de la Marine royale. Fort-Royal garde sa crique, des vaisseaux du roi y mouillent et patrouillent au large. Ses garnisons paient cher le rhum et les épices ; ses forêts donnent un bois de mâture réputé.',
    resources: ['Bois de mâture', 'Arsenal de la Marine'],
    market: {
      wood: { buy: 1, sell: 1 },
      fish: { buy: null, sell: 5 },
      rum: { buy: null, sell: 11 },
      spices: { buy: null, sell: 16 },
    },
    upgrades: ['royalFort', 'dock', 'shipyard', 'moorings', 'workshop', 'counter'],
    captureLevels: { shipyard: 2 },
  },
  dauphin: {
    name: 'Île du Dauphin',
    portName: 'Port-Dauphin',
    shortName: 'Port-Dauphin',
    fort: { name: 'Fortin du Dauphin', noun: 'fortin', feminine: false },
    allegiance: 'navy',
    holders: 'La Marine royale',
    owned: false,
    // Pas à vendre : il faut abattre le fortin, puis accoster.
    price: null,
    description: 'Petite île basse à l’ouest de la Tortue : un village de pêcheurs sous la garde d’un poste de la Marine et de son fortin. Ses eaux sont poissonneuses et son bois bon marché.',
    resources: ['Poisson', 'Bois'],
    market: {
      wood: { buy: 1, sell: 1 },
      fish: { buy: 2, sell: 2 },
      rum: { buy: null, sell: 9 },
      spices: { buy: null, sell: 12 },
    },
    upgrades: ['fort', 'dock', 'shipyard', 'moorings', 'workshop', 'counter'],
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
  /**
   * Chantier naval : sans lui, le port ne construit que les petits navires ; niveau 1 : brigantin, chébec, flûte,
   * brick et corvette ; niveau 2 : caraque, galéasse et frégate ; niveau 3 : galion (`required` : niveau qu'il faut pour
   * construire chaque type, 0 si absent).
   */
  shipyard: {
    costs: [{ gold: 400, wood: 250 }, { gold: 1000, wood: 600 }, { gold: 2400, wood: 1400 }],
    required: { brigantine: 1, xebec: 1, fluyt: 1, brig: 1, corvette: 1, carrack: 2, galleass: 2, frigate: 2, galleon: 3 } as Partial<Record<ShipType, number>>,
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
  /** Fort-Royal, une fois l'île prise : tes canonniers remettent en batterie les pièces de la Marine. */
  royalFort: {
    costs: [{ gold: 300, wood: 150 }, { gold: 550, wood: 260 }, { gold: 850, wood: 400 }],
    guns: [7, 9, 11],
    range: [280, 300, 320],
    damage: [15, 17, 19],
  },
  /** Comptoir de contrebande de Port-Sabre : on t'y achète plus cher, on t'y vend moins cher. */
  smuggling: {
    costs: [{ gold: 150, wood: 60 }, { gold: 300, wood: 120 }, { gold: 500, wood: 200 }],
    sellBonus: [0.1, 0.2, 0.3],
    buyDiscount: [0.05, 0.1, 0.15],
  },
  /**
   * Mouillage : emplacements pour les navires que l'île envoie en route commerciale (TRADE_ROUTES.islandSlots sans
   * lui, puis un par niveau).
   */
  moorings: {
    costs: [{ gold: 200, wood: 120 }, { gold: 450, wood: 250 }],
    slots: [2, 3],
  },
  lighthouse: {
    costs: [{ gold: 150, wood: 60 }, { gold: 300, wood: 120 }],
    /** Portée du radar près de l'île (m)… */
    radarRange: [520, 640],
    /** …à moins de cette distance de la côte (m). Les ennemis de cette zone apparaissent aussi sur la carte. */
    coverage: [700, 900],
  },
};

/**
 * Routes commerciales confiées à tes navires (onglet Routes du port). Un navire en commerce quitte tes places de flotte
 * et prend un emplacement de l'île d'où il part (une île à toi) ; on le reprend à son port, s'il reste une place.
 */
export const TRADE_ROUTES = {
  /** Emplacements d'une île à toi sans Mouillage (ISLAND_UPGRADES.moorings ensuite). */
  islandSlots: 1,
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
  types: ['sloop', 'sloop', 'caravel', 'schooner', 'brigantine', 'fluyt', 'carrack'] as const,
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

/** Fort-Royal une fois l'Île Royale à toi : armement avant amélioration (voir ISLAND_UPGRADES.royalFort). */
export const ROYAL_FORT = { guns: 5, range: 260, damage: 13 };

/** Fumée et flammes d'un fort touché : fumée sous `smokeBelow` de sa vie, incendie une fois tombé (émissions par seconde). */
export const FORT_FX = {
  smokeBelow: 0.5,
  smokeRate: 2.5,
  flameRate: 16,
  emberRate: 5,
  /** Taille de l'explosion quand il tombe. */
  fallScale: 2.5,
};

/**
 * Défense d'une île de la Marine (NAVY_HOLDS), tant qu'elle la tient, et ses contre-attaques une fois prise.
 * Le fort tire sur ta flotte et tes alliés ; tes boulets peuvent le toucher, et il se répare si on le laisse en paix.
 * Abattu, il se tait jusqu'à ce que tu prennes l'île (accoster). La garnison : des navires amarrés dans la crique, qui
 * appareillent quand on approche du port ou que le fort est touché, et des rondes autour de l'île ; un navire coulé est
 * remplacé après un délai, tant que le fort tient. Contre-attaques : une escadre (tables de CONTRACTS.defend, selon le
 * niveau de ta flotte) assiège le fort après un préavis ; repoussée, son butin va dans la réserve de l'île ; si le fort
 * tombe, la Marine reprend l'île.
 */
export interface NavyHoldDef {
  /** Armement (les autres réglages de tir sont ceux de FORT), vie, réparation (après `regenDelay` s sans être touché, `regenRate` de sa vie par seconde), orientation vers ce point au large de l'entrée de la crique (m). */
  fort: { guns: number; range: number; damage: number; health: number; regenDelay: number; regenRate: number; facingOffing: number };
  garrison: {
    /** Navires amarrés : type, place (écart d'angle depuis l'axe de la crique (rad), distance au large de la côte (m)). */
    moored: readonly { readonly type: ShipType; readonly angle: number; readonly offing: number }[];
    /** Rondes, chacune dans un sens, à `patrolOffing` m au-delà du rayon extérieur de l'île. */
    patrols: readonly ShipType[];
    patrolOffing: number;
    /** Améliorations des navires (0 à 1, comme la menace des ennemis), fixes : ils ne suivent pas tes victoires. */
    threat: number;
    /** Un navire coulé est remplacé après ce délai (s), tant que le fort tient. */
    reinforceDelay: readonly [number, number];
    /** La garnison prend la mer quand ton navire est à moins de `activeRadius` m du centre de l'île ; au-delà de `releaseRadius`, ses navires au repos rentrent. */
    activeRadius: number;
    releaseRadius: number;
  };
  counterAttack: {
    /** Temps entre deux contre-attaques (s), préavis entre l'alerte et l'arrivée de l'escadre (s). */
    interval: readonly [number, number];
    warning: number;
    /** Étoiles de l'escadre = niveau de ta flotte + `starBonus`, entre 1 et `maxStars`. */
    starBonus: number;
    maxStars: number;
    /** Butin d'un navire de l'escadre coulé, déposé dans la réserve de l'île quand elle est repoussée. */
    spoilsPerShip: Cost;
  };
}

export const NAVY_HOLDS: Partial<Record<IslandId, NavyHoldDef>> = {
  /** Île Royale : premier grand fort de la Marine ; une frégate bien améliorée doit pouvoir l'abattre seule. */
  royale: {
    fort: { guns: 11, range: 270, damage: 9, health: 1400, regenDelay: 60, regenRate: 0.003, facingOffing: 140 },
    garrison: {
      moored: [
        { type: 'corvette', angle: 0, offing: 90 },
        { type: 'brigantine', angle: 0.16, offing: 55 },
      ],
      patrols: ['caravel'],
      patrolOffing: 170,
      threat: 0.25,
      reinforceDelay: [180, 300],
      activeRadius: 1400,
      releaseRadius: 1800,
    },
    counterAttack: { interval: [1100, 1300], warning: 120, starBonus: 1, maxStars: 5, spoilsPerShip: { gold: 140, wood: 50 } },
  },
  /** Île du Dauphin : petit poste de la Marine, fortin et deux navires ; prenable avec un brigantin ou une corvette bien équipés. */
  dauphin: {
    fort: { guns: 4, range: 220, damage: 5, health: 600, regenDelay: 60, regenRate: 0.004, facingOffing: 100 },
    garrison: {
      moored: [
        { type: 'sloop', angle: 0.12, offing: 45 },
        { type: 'caravel', angle: -0.14, offing: 50 },
      ],
      patrols: [],
      patrolOffing: 120,
      threat: 0.15,
      reinforceDelay: [200, 320],
      activeRadius: 900,
      releaseRadius: 1200,
    },
    // Plus petites et plus rares que sur l'Île Royale.
    counterAttack: { interval: [1800, 2200], warning: 120, starBonus: 0, maxStars: 3, spoilsPerShip: { gold: 90, wood: 35 } },
  },
};

/** Réglages communs aux garnisons de la Marine (le reste dans NAVY_HOLDS). */
export const GARRISON = {
  /** Pas d'apparition à moins de cette distance de ton navire (m) : toujours hors de vue. */
  spawnClearance: 550,
  /** Les navires amarrés appareillent quand un navire hostile approche à moins de ce rayon du port (m), ou `hitAlarm` s après un coup sur le fort. */
  alertRadius: 500,
  hitAlarm: 5,
  /** Au-delà de cette distance de son poste (m), un navire de la garnison lâche sa proie et rentre. */
  leash: 900,
  /** Un navire amarré qui a appareillé rejette l'ancre à moins de cette distance de sa place (m). */
  mooringRadius: 25,
  /** Tes navires à moins de cette distance d'un fort de la Marine le prennent pour cible (m). */
  fortAimRange: 700,
  /**
   * La barre de vie d'un fort de la Marine s'affiche quand il sort de la brume : la caméra en est à moins de cette part
   * du chemin entre le début et la fin de la brume (0 = début, 1 = fin, où il disparaît).
   */
  fortBarFog: 0.5,
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
