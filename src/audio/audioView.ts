import type { Ship } from '../ship/ship';

/** Ce que le son lit du monde à chaque image (rempli par `Game`), pour les ambiances et la musique. */
export interface AudioView {
  /** Le navire piloté. */
  leader: Ship;
  /** Houle (WeatherProfile.waveFactor), pluie (0 à 1), force du vent (Wind.strength), nuit (0 à 1). */
  waves: number;
  rain: number;
  wind: number;
  night: number;
  /** Distance au port ouvert le plus proche, et à la côte la plus proche (m). */
  port: number;
  coast: number;
  /** Au port (zone d'escale), ou dans le panneau du port et ses lieux. */
  inPort: boolean;
  /** Distance au navire en feu, et au navire maudit, les plus proches (m ; Infinity s'il n'y en a pas). */
  fire: number;
  cursed: number;
  /** Un ennemi s'en prend à ta flotte tout près ; un boss est en vue. */
  combat: boolean;
  boss: boolean;
}

/** Lieux ouverts qui ont leur propre ambiance (posés par les menus). */
export const audioPlaces = { tavern: false, port: false };
