import type { Fleet } from '../fleet/fleet';
import { fleetStock } from '../fleet/holds';
import type { Contract, Contracts } from '../progression/contracts';

/** Avancement d'un contrat : nombre atteint, et s'il est prêt à être payé. */
export function contractProgress(c: Contract, contracts: Contracts, fleet: Fleet): { count: number; ready: boolean } {
  if (c.kind === 'deliver' && c.good) {
    const count = Math.min(c.target, fleetStock(fleet.hand, c.good));
    return { count, ready: count >= c.target };
  }
  return { count: Math.min(c.target, c.progress), ready: contracts.isDone(c) };
}
