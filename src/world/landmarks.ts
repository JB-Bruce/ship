import { ISLANDS } from '../config';
import { royale, sabre, tortuga } from './island';

export type LandmarkKind = 'port' | 'fort' | 'lighthouse';

/** Un lieu remarquable, affiché sur la carte (M). */
export interface Landmark {
  readonly kind: LandmarkKind;
  readonly name: string;
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
export const ROYAL_FORT_SPOT = royale.pointAt(ISLANDS.royale.bay.angle + 0.5, 40);

/** Tous les lieux à montrer sur la carte. Un nouveau lieu (île, épave, trésor…) s'ajoute ici. */
export const LANDMARKS: readonly Landmark[] = [
  { kind: 'port', name: 'Port de la Tortue', ...tortuga.port },
  { kind: 'fort', name: 'Fort', ...FORT_SPOT },
  { kind: 'lighthouse', name: 'Phare', ...LIGHTHOUSE_SPOT },
  { kind: 'port', name: 'Port-Sabre', ...sabre.port },
  { kind: 'fort', name: 'Citadelle', ...CITADEL_SPOT },
  { kind: 'port', name: 'Port-Royal', ...royale.port },
  { kind: 'fort', name: 'Fort-Royal', ...ROYAL_FORT_SPOT },
];
