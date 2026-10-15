// Caractéristiques de base de chaque type de bateau (avant améliorations), côté joueur, et version ennemie.

import { MORTAR_SHELL, type ShipStats } from './config';

const DEG = Math.PI / 180;

export const LONGBOAT_STATS: ShipStats = {
  length: 7.5,
  width: 2.4,
  maxSpeed: 14,
  acceleration: 4,
  deceleration: 5,
  turnRate: 0.85,
  rudderSpeed: 4,
  turnHeel: 0.012,
  maxHealth: 160,
  cannonsPerSide: 1,
  cannon: { range: 120, reloadTime: 3, arcHalfAngle: 35 * DEG, spread: 3 * DEG, rangeError: 0.09, damage: 12, ballSpeed: 55 },
  buoyancy: { stiffness: 60, damping: 11, tiltResponse: 10 },
};

/** Sloop « polyvalent » : presque aussi rapide qu'une chaloupe, deux fois plus solide, mais tourne moins vite. */
export const SLOOP_STATS: ShipStats = {
  length: 12,
  width: 3.8,
  maxSpeed: 13,
  acceleration: 3,
  deceleration: 4,
  turnRate: 0.55,
  rudderSpeed: 3,
  turnHeel: 0.008,
  maxHealth: 350,
  cannonsPerSide: 2,
  cannon: { range: 130, reloadTime: 3.2, arcHalfAngle: 35 * DEG, spread: 3.75 * DEG, rangeError: 0.105, damage: 14, ballSpeed: 58 },
  buoyancy: { stiffness: 40, damping: 10, tiltResponse: 6 },
};

/**
 * Brigantin : deux mâts à voiles carrées, château arrière (deux canons à l'abri à l'intérieur) et gaillard
 * d'avant surélevé. Le « tireur d'élite » de la flotte : très précis et longue portée, mais lent à virer.
 */
export const BRIGANTINE_STATS: ShipStats = {
  length: 16,
  width: 4.6,
  maxSpeed: 12.5,
  acceleration: 2.6,
  deceleration: 3.5,
  turnRate: 0.45,
  rudderSpeed: 2.5,
  turnHeel: 0.006,
  maxHealth: 540,
  cannonsPerSide: 3,
  cannon: { range: 140, reloadTime: 3.4, arcHalfAngle: 35 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 15, ballSpeed: 60 },
  buoyancy: { stiffness: 32, damping: 9, tiltResponse: 5 },
};

/**
 * Caravelle : courte et haute (château arrière, gaillard d'avant), grand mât à voiles carrées et artimon latin. Pas
 * très rapide mais très maniable, assez robuste. Second calibre : le gros canon de chasse sous le gaillard d'avant,
 * qui tire droit devant (lent à recharger, longue portée).
 */
export const CARAVEL_STATS: ShipStats = {
  length: 13,
  width: 4.4,
  maxSpeed: 12,
  acceleration: 2.8,
  deceleration: 3.8,
  turnRate: 0.65,
  rudderSpeed: 3.2,
  turnHeel: 0.007,
  maxHealth: 490,
  cannonsPerSide: 2,
  cannon: { range: 130, reloadTime: 3.2, arcHalfAngle: 35 * DEG, spread: 3.75 * DEG, rangeError: 0.105, damage: 14, ballSpeed: 58 },
  deckCannon: { range: 160, reloadTime: 6, arcHalfAngle: 15 * DEG, spread: 2.7 * DEG, rangeError: 0.075, damage: 28, ballSpeed: 64 },
  buoyancy: { stiffness: 36, damping: 9.5, tiltResponse: 5.5 },
};

/**
 * Goélette : longue et fine, deux mâts à voiles auriques et focs, pont ras. La plus rapide, fragile, petits canons :
 * un navire de commerce et de course, qui remonte bien au vent.
 */
export const SCHOONER_STATS: ShipStats = {
  length: 15,
  width: 3.8,
  maxSpeed: 14.5,
  acceleration: 3.4,
  deceleration: 4,
  turnRate: 0.55,
  rudderSpeed: 3,
  turnHeel: 0.008,
  maxHealth: 380,
  cannonsPerSide: 2,
  cannon: { range: 125, reloadTime: 2.9, arcHalfAngle: 35 * DEG, spread: 3.75 * DEG, rangeError: 0.105, damage: 12, ballSpeed: 58 },
  buoyancy: { stiffness: 38, damping: 10, tiltResponse: 6 },
};

/**
 * Chébec : long, bas et étroit, voiles latines et carrées, éperon. Rapide et vif, peu de canons de flanc ; second
 * calibre : les canons de chasse à la proue, qui tirent droit devant (de 1 à 3).
 */
export const XEBEC_STATS: ShipStats = {
  length: 21,
  width: 4.6,
  maxSpeed: 13.5,
  acceleration: 3,
  deceleration: 3.8,
  turnRate: 0.52,
  rudderSpeed: 2.8,
  turnHeel: 0.007,
  maxHealth: 470,
  cannonsPerSide: 2,
  chaseGuns: 1,
  cannon: { range: 130, reloadTime: 3, arcHalfAngle: 35 * DEG, spread: 3.75 * DEG, rangeError: 0.105, damage: 14, ballSpeed: 58 },
  deckCannon: { range: 200, reloadTime: 4.5, arcHalfAngle: 15 * DEG, spread: 3 * DEG, rangeError: 0.09, damage: 18, ballSpeed: 62 },
  buoyancy: { stiffness: 32, damping: 9, tiltResponse: 5 },
};

/**
 * Brick : deux mâts carrés, pont ras, tous ses canons (légers, rapides à recharger) sur le pont. Plus rapide et plus
 * maniable que la corvette, moins solide : le chasseur de la Marine. Second calibre : un mortier sur le pont avant, qui
 * pivote dans toutes les directions et lance en cloche de gros obus explosifs, lents à recharger et peu précis.
 */
export const BRIG_STATS: ShipStats = {
  length: 20,
  width: 5.4,
  maxSpeed: 13.5,
  acceleration: 2.7,
  deceleration: 3.4,
  turnRate: 0.47,
  rudderSpeed: 2.5,
  turnHeel: 0.006,
  maxHealth: 700,
  cannonsPerSide: 6,
  cannon: { range: 125, reloadTime: 2.4, arcHalfAngle: 35 * DEG, spread: 3.9 * DEG, rangeError: 0.105, damage: 10, ballSpeed: 58 },
  deckCannon: { range: 200, reloadTime: 10, arcHalfAngle: Math.PI, spread: 6 * DEG, rangeError: 0.18, damage: 100, ballSpeed: 45, shell: MORTAR_SHELL },
  buoyancy: { stiffness: 30, damping: 8.8, tiltResponse: 4.7 },
};

/**
 * Flûte : navire de charge hollandais, ventru, haut sur l'eau, aux flancs très rentrés. Lente et lourde à virer, mais
 * solide ; deux calibres : une batterie couverte dans la coque (angle de tir assez étroit) et des canons légers sur les
 * gaillards.
 */
export const FLUYT_STATS: ShipStats = {
  length: 24,
  width: 6.8,
  maxSpeed: 11.5,
  acceleration: 2,
  deceleration: 3,
  turnRate: 0.36,
  rudderSpeed: 2.1,
  turnHeel: 0.005,
  maxHealth: 860,
  cannonsPerSide: 6,
  cannon: { range: 150, reloadTime: 3.8, arcHalfAngle: 25 * DEG, spread: 3.45 * DEG, rangeError: 0.0975, damage: 14, ballSpeed: 60 },
  deckCannon: { range: 130, reloadTime: 2.6, arcHalfAngle: 35 * DEG, spread: 3.9 * DEG, rangeError: 0.105, damage: 10, ballSpeed: 58 },
  buoyancy: { stiffness: 26, damping: 8.4, tiltResponse: 4.2 },
};

/**
 * Corvette : deux calibres. Batterie couverte = canons lourds, lents à recharger, coincés dans leurs sabords
 * (angle de tir étroit) ; pont supérieur = canons légers et rapides, angle de tir normal.
 */
export const CORVETTE_STATS: ShipStats = {
  length: 22,
  width: 6,
  maxSpeed: 12.5,
  acceleration: 2.3,
  deceleration: 3.2,
  turnRate: 0.4,
  rudderSpeed: 2.2,
  turnHeel: 0.005,
  maxHealth: 860,
  cannonsPerSide: 4,
  cannon: { range: 150, reloadTime: 4, arcHalfAngle: 20 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 18, ballSpeed: 62 },
  deckCannon: { range: 130, reloadTime: 2.5, arcHalfAngle: 35 * DEG, spread: 3.9 * DEG, rangeError: 0.105, damage: 11, ballSpeed: 58 },
  buoyancy: { stiffness: 28, damping: 8.5, tiltResponse: 4.5 },
};

/**
 * Frégate : trois-mâts carré de guerre, deux calibres comme la corvette mais en plus grand. Batterie couverte de canons
 * lourds (4 à 8 par bord, angle de tir étroit) et canons légers sur les gaillards (2 à 4 par bord). Très solide, longue
 * portée, très lente à virer.
 */
export const FRIGATE_STATS: ShipStats = {
  length: 28,
  width: 7.4,
  maxSpeed: 12,
  acceleration: 2,
  deceleration: 2.9,
  turnRate: 0.33,
  rudderSpeed: 2,
  turnHeel: 0.004,
  maxHealth: 1300,
  cannonsPerSide: 6,
  cannon: { range: 160, reloadTime: 4.2, arcHalfAngle: 20 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 20, ballSpeed: 64 },
  deckCannon: { range: 135, reloadTime: 2.6, arcHalfAngle: 35 * DEG, spread: 3.9 * DEG, rangeError: 0.105, damage: 12, ballSpeed: 58 },
  buoyancy: { stiffness: 24, damping: 8, tiltResponse: 4 },
};

/**
 * Caraque : grand navire du XVIe siècle, large et haut, châteaux à étages à l'avant et à l'arrière, quatre mâts.
 * Forteresse lente : la plus solide, lourde à virer, perd beaucoup au près. Deux calibres : batterie basse de gros
 * canons dans le bordé (angle de tir étroit) et pièces légères des châteaux (angle large, tir rapide) ; trois gros
 * canons de chasse, deux côte à côte et le troisième au-dessus (au calibre de la batterie), dans la face du château avant.
 */
export const CARRACK_STATS: ShipStats = {
  length: 29,
  width: 8.8,
  maxSpeed: 10.5,
  acceleration: 1.6,
  deceleration: 2.6,
  turnRate: 0.28,
  rudderSpeed: 1.8,
  turnHeel: 0.004,
  maxHealth: 1800,
  cannonsPerSide: 7,
  chaseGuns: 3,
  cannon: { range: 150, reloadTime: 4.6, arcHalfAngle: 20 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 22, ballSpeed: 62 },
  deckCannon: { range: 150, reloadTime: 2.2, arcHalfAngle: 45 * DEG, spread: 4.2 * DEG, rangeError: 0.1125, damage: 9, ballSpeed: 56 },
  buoyancy: { stiffness: 22, damping: 7.8, tiltResponse: 3.8 },
};

/**
 * Galéasse : grande galère de guerre, longue et basse, trois mâts à voiles latines, château avant et château de poupe,
 * éperon ; ses rameurs sortent les avirons par vent de face. Deux calibres sur les flancs : batterie dans le bordé,
 * au-dessus des avirons (angle de tir étroit), et pièces du pont dans le pavois. Canons de chasse (GALLEASS_BOW) : deux
 * triples canons au calibre de la batterie dans la face du château avant, et deux pièces légères sur son dessus.
 */
export const GALLEASS_STATS: ShipStats = {
  length: 33,
  width: 7.2,
  maxSpeed: 11.5,
  acceleration: 1.9,
  deceleration: 2.8,
  turnRate: 0.3,
  rudderSpeed: 1.9,
  turnHeel: 0.004,
  maxHealth: 1400,
  cannonsPerSide: 8,
  chaseGuns: 4,
  cannon: { range: 155, reloadTime: 4.6, arcHalfAngle: 20 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 22, ballSpeed: 62 },
  deckCannon: { range: 130, reloadTime: 2.4, arcHalfAngle: 35 * DEG, spread: 3.9 * DEG, rangeError: 0.105, damage: 10, ballSpeed: 58 },
  buoyancy: { stiffness: 23, damping: 7.9, tiltResponse: 3.9 },
};

/**
 * Galion : grand navire au trésor, très haut, château arrière à trois étages et galeries dorées, château avant bas en
 * retrait de la poulaine, quatre mâts. Deux batteries couvertes dans le bordé, au même calibre (gros canons, angle de
 * tir étroit), et le second calibre : pièces légères des châteaux, puis du pont (navire allongé), qui tirent large.
 * Le plus solide et la plus forte bordée, une cale immense, mais lent, lourd à virer, et il perd beaucoup au près.
 */
export const GALLEON_STATS: ShipStats = {
  length: 36,
  width: 9.2,
  maxSpeed: 10,
  acceleration: 1.5,
  deceleration: 2.4,
  turnRate: 0.24,
  rudderSpeed: 1.6,
  turnHeel: 0.0035,
  maxHealth: 2400,
  cannonsPerSide: 12,
  cannon: { range: 155, reloadTime: 4.8, arcHalfAngle: 20 * DEG, spread: 3.3 * DEG, rangeError: 0.09, damage: 24, ballSpeed: 62 },
  deckCannon: { range: 140, reloadTime: 2.4, arcHalfAngle: 45 * DEG, spread: 4.05 * DEG, rangeError: 0.108, damage: 10, ballSpeed: 57 },
  buoyancy: { stiffness: 20, damping: 7.5, tiltResponse: 3.5 },
};

/** Barque à rames ennemie : lente, fragile, un seul pierrier à l'avant. L'adversaire des débuts. */
export const ROWBOAT_STATS: ShipStats = {
  length: 5,
  width: 1.7,
  maxSpeed: 8,
  acceleration: 3,
  deceleration: 4,
  turnRate: 1.1,
  rudderSpeed: 5,
  turnHeel: 0.01,
  maxHealth: 70,
  /** Pour la barque : nombre de pierriers à l'avant. */
  cannonsPerSide: 1,
  cannon: { range: 90, reloadTime: 4, arcHalfAngle: 30 * DEG, spread: 7.5 * DEG, rangeError: 0.18, damage: 5, ballSpeed: 50 },
  buoyancy: { stiffness: 70, damping: 12, tiltResponse: 12 },
};
