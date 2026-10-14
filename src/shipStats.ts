// Caractéristiques de base de chaque type de bateau (avant améliorations), côté joueur, et version ennemie.

import type { ShipStats } from './config';

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
  maxHealth: 80,
  cannonsPerSide: 1,
  cannon: { range: 120, reloadTime: 3, arcHalfAngle: 35 * DEG, spread: 2 * DEG, rangeError: 0.06, damage: 12, ballSpeed: 55 },
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
  maxHealth: 175,
  cannonsPerSide: 2,
  cannon: { range: 130, reloadTime: 3.2, arcHalfAngle: 35 * DEG, spread: 2.5 * DEG, rangeError: 0.07, damage: 14, ballSpeed: 58 },
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
  maxHealth: 270,
  cannonsPerSide: 3,
  cannon: { range: 140, reloadTime: 3.4, arcHalfAngle: 35 * DEG, spread: 2.2 * DEG, rangeError: 0.06, damage: 15, ballSpeed: 60 },
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
  maxHealth: 245,
  cannonsPerSide: 2,
  cannon: { range: 130, reloadTime: 3.2, arcHalfAngle: 35 * DEG, spread: 2.5 * DEG, rangeError: 0.07, damage: 14, ballSpeed: 58 },
  deckCannon: { range: 160, reloadTime: 6, arcHalfAngle: 15 * DEG, spread: 1.8 * DEG, rangeError: 0.05, damage: 28, ballSpeed: 64 },
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
  maxHealth: 190,
  cannonsPerSide: 2,
  cannon: { range: 125, reloadTime: 2.9, arcHalfAngle: 35 * DEG, spread: 2.5 * DEG, rangeError: 0.07, damage: 12, ballSpeed: 58 },
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
  maxHealth: 235,
  cannonsPerSide: 2,
  chaseGuns: 1,
  cannon: { range: 130, reloadTime: 3, arcHalfAngle: 35 * DEG, spread: 2.5 * DEG, rangeError: 0.07, damage: 14, ballSpeed: 58 },
  deckCannon: { range: 200, reloadTime: 4.5, arcHalfAngle: 15 * DEG, spread: 2 * DEG, rangeError: 0.06, damage: 18, ballSpeed: 62 },
  buoyancy: { stiffness: 32, damping: 9, tiltResponse: 5 },
};

/**
 * Brick : deux mâts carrés, pont ras, tous ses canons (légers, rapides à recharger) sur le pont. Plus rapide et plus
 * maniable que la corvette, moins solide : le chasseur de la Marine.
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
  maxHealth: 350,
  cannonsPerSide: 6,
  cannon: { range: 125, reloadTime: 2.4, arcHalfAngle: 35 * DEG, spread: 2.6 * DEG, rangeError: 0.07, damage: 10, ballSpeed: 58 },
  buoyancy: { stiffness: 30, damping: 8.8, tiltResponse: 4.7 },
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
  maxHealth: 430,
  cannonsPerSide: 4,
  cannon: { range: 150, reloadTime: 4, arcHalfAngle: 20 * DEG, spread: 2.2 * DEG, rangeError: 0.06, damage: 18, ballSpeed: 62 },
  deckCannon: { range: 130, reloadTime: 2.5, arcHalfAngle: 35 * DEG, spread: 2.6 * DEG, rangeError: 0.07, damage: 11, ballSpeed: 58 },
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
  maxHealth: 650,
  cannonsPerSide: 6,
  cannon: { range: 160, reloadTime: 4.2, arcHalfAngle: 20 * DEG, spread: 2.2 * DEG, rangeError: 0.06, damage: 20, ballSpeed: 64 },
  deckCannon: { range: 135, reloadTime: 2.6, arcHalfAngle: 35 * DEG, spread: 2.6 * DEG, rangeError: 0.07, damage: 12, ballSpeed: 58 },
  buoyancy: { stiffness: 24, damping: 8, tiltResponse: 4 },
};

/** Version ennemie : plus lente, moins précise, moins solide. */
export function weaker(stats: ShipStats, health: number, damage: number): ShipStats {
  return {
    ...stats,
    maxSpeed: stats.maxSpeed * 0.9,
    turnRate: stats.turnRate * 0.9,
    maxHealth: health,
    cannon: { ...stats.cannon, reloadTime: stats.cannon.reloadTime * 1.15, spread: stats.cannon.spread * 1.75, rangeError: stats.cannon.rangeError * 1.6, damage },
    // Le second calibre garde le même rapport de dégâts avec le premier.
    deckCannon: stats.deckCannon && {
      ...stats.deckCannon,
      reloadTime: stats.deckCannon.reloadTime * 1.15,
      spread: stats.deckCannon.spread * 1.75,
      rangeError: stats.deckCannon.rangeError * 1.6,
      damage: (stats.deckCannon.damage * damage) / stats.cannon.damage,
    },
    buoyancy: { ...stats.buoyancy },
  };
}

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
  maxHealth: 35,
  /** Pour la barque : nombre de pierriers à l'avant. */
  cannonsPerSide: 1,
  cannon: { range: 90, reloadTime: 4, arcHalfAngle: 30 * DEG, spread: 5 * DEG, rangeError: 0.12, damage: 5, ballSpeed: 50 },
  buoyancy: { stiffness: 70, damping: 12, tiltResponse: 12 },
};
