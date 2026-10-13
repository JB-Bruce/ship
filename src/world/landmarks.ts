import { ISLAND_INFO, ISLANDS, type IslandId } from '../config';
import { royale, sabre, tortuga } from './island';

export type LandmarkKind = 'port' | 'fort' | 'lighthouse';

/** Un lieu remarquable, affiché sur la carte (M) : son pictogramme ; seul un port y porte son nom. */
export interface Landmark {
  readonly kind: LandmarkKind;
  readonly name: string;
  /** L'île où il se trouve (un port de la Marine se dessine en rouge). */
  readonly island: IslandId;
  readonly x: number;
  readonly z: number;
}

/** Fort de la Tortue : sur la pointe ouest de la crique, assez en retrait pour que ses bastions s'arrêtent au rivage. */
export const FORT_SPOT = tortuga.pointAt(ISLANDS.tortuga.bay.angle + 0.62, 15);
/** Phare de la Tortue : sur la pointe est de la crique. */
export const LIGHTHOUSE_SPOT = tortuga.pointAt(ISLANDS.tortuga.bay.angle - 0.62, 9);
/** Citadelle de Port-Sabre : sur la hauteur qui domine la crique et le port. */
export const CITADEL_SPOT = sabre.pointAt(ISLANDS.sabre.bay.angle - 0.62, 30);
/** Fort-Royal : sur les hauteurs à l'est de la crique de l'Île Royale, ses bastions au-dessus de l'entrée. */
export const ROYAL_FORT_SPOT = royale.pointAt(ISLANDS.royale.bay.angle + 0.5, 48);

/** Tous les lieux à montrer sur la carte. Un nouveau lieu (île, épave, trésor…) s'ajoute ici. */
export const LANDMARKS: readonly Landmark[] = [
  { kind: 'port', name: ISLAND_INFO.tortuga.portName, island: 'tortuga', ...tortuga.port },
  { kind: 'fort', name: ISLAND_INFO.tortuga.fort.name, island: 'tortuga', ...FORT_SPOT },
  { kind: 'lighthouse', name: 'Phare', island: 'tortuga', ...LIGHTHOUSE_SPOT },
  { kind: 'port', name: ISLAND_INFO.sabre.portName, island: 'sabre', ...sabre.port },
  { kind: 'fort', name: ISLAND_INFO.sabre.fort.name, island: 'sabre', ...CITADEL_SPOT },
  { kind: 'port', name: ISLAND_INFO.royale.portName, island: 'royale', ...royale.port },
  { kind: 'fort', name: ISLAND_INFO.royale.fort.name, island: 'royale', ...ROYAL_FORT_SPOT },
];
