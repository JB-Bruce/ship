import type { CampaignSnapshot } from '../campaign';
import { SPECIAL_CONTRACTS, type IslandId } from '../config';

/**
 * Sauvegarde d'avant la brume de la carte (v3 et moins, sans `CampaignSnapshot.discovery`) : les îles dont on a
 * visiblement visité le port, pour les montrer sur la carte. La Tortue, le dernier port d'escale, toute île à toi
 * (achetée ou prise), toute île qui a des améliorations (une île de la Marine reprise les garde) ou une réserve, celles
 * dont la taverne a donné un contrat en cours ou une mission spéciale réussie, et les îles de la Marine dont le fort a
 * été entamé.
 */
export function visitedIslands(s: CampaignSnapshot): Set<IslandId> {
  const visited = new Set<IslandId>(['tortuga', s.lastPort]);
  for (const [id, island] of Object.entries(s.islands) as [IslandId, CampaignSnapshot['islands'][IslandId]][]) {
    if (!island) continue;
    const upgraded = Object.values(island.levels).some((level) => level > 0);
    const stocked = island.stock.gold > 0 || island.stock.wood > 0;
    if (island.owned || upgraded || stocked) visited.add(id);
  }
  for (const c of s.contracts.active) visited.add(c.from);
  for (const [id, specials] of Object.entries(SPECIAL_CONTRACTS) as [IslandId, (typeof SPECIAL_CONTRACTS)[IslandId]][]) {
    if (specials.some((special) => s.contracts.specialsDone.includes(special.id))) visited.add(id);
  }
  for (const [id, share] of Object.entries(s.navyForts ?? {}) as [IslandId, number][]) if (share < 1) visited.add(id);
  return visited;
}
