import { ISLAND_INFO, type IslandId, type Price, type TradeGood } from '../../config';
import { harbors } from '../../world/harbors';
import type { Island } from '../../world/island';
import type { PortContext } from '../port/portContext';

/** Ce que le Comptoir lit en plus du port : les prix des autres îles et ce que la carte a découvert. */
export interface MarketContext extends PortContext {
  /** Prix du marché d'une île (comparaisons, routes). */
  priceAt(island: IslandId, good: TradeGood): Price;
  /** Ce point de la carte est-il découvert ? */
  known(x: number, z: number): boolean;
}

/** Les autres ports ouverts dont l'île est découverte : comparaisons de prix et destinations des routes. */
export function knownPorts(ctx: MarketContext): Island[] {
  return harbors.open().filter((i) => i.id !== ctx.island.id && ctx.known(i.port.x, i.port.z));
}

/** « La Tortue », « Port-Sabre » : le nom court d'un port, en tête de phrase ou sur la carte. */
export function portLabel(id: IslandId): string {
  const name = ISLAND_INFO[id].shortName;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
