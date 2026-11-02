import { ISLAND_INFO, type IslandId } from '../config';
import { ISLAND_LIST, type Island } from './island';

/** Ports fermés : tenus par la Marine (île pas encore prise, ou reprise). Au départ, ceux des îles de la Marine. */
const closed = new Set<IslandId>(ISLAND_LIST.filter((i) => ISLAND_INFO[i.id].allegiance === 'navy' && !ISLAND_INFO[i.id].owned).map((i) => i.id));

/**
 * Accès aux ports : un port tenu par la Marine est fermé (pas d'escale, de réparation ni de taverne ; pirates,
 * marchands, routes commerciales et escortes l'évitent). La campagne l'ouvre quand tu prends l'île, le referme si la
 * Marine la reprend.
 */
export const harbors = {
  isOpen(id: IslandId): boolean {
    return !closed.has(id);
  },

  setClosed(id: IslandId, value: boolean) {
    if (value) closed.add(id);
    else closed.delete(id);
  },

  /** Les îles dont le port est ouvert. */
  open(): Island[] {
    return ISLAND_LIST.filter((i) => !closed.has(i.id));
  },
};
