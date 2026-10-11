import { RANKS } from '../config';
import { addEffect, noModifiers } from '../progression/modifiers';
import type { Crew } from './crew';
import type { FleetMember } from './fleet';
import { officerEffect, rankOf } from './officers';

/**
 * Remet un navire de la flotte à jour après un changement (amélioration, officiers, rang, canons, pavillons) : ses
 * caractéristiques (améliorations, puis officiers et rang, puis types de canons) et ce qui se voit (fûts des canons,
 * drapeau de rang à la poupe, pavillons des boss sous son pavillon).
 */
export function refit(member: FleetMember, crew: Crew) {
  const stars = rankOf(member.kills);
  const modifiers = noModifiers();
  addEffect(modifiers, RANKS.perStar, stars);
  for (const officer of crew.aboard(member.id)) addEffect(modifiers, officerEffect(officer));
  const ship = member.ship;
  ship.modifiers = modifiers;
  ship.guns = { ...member.guns };
  ship.upgrade(member.levels);
  ship.dressing.setRank(stars);
  ship.dressing.setTrophies(member.trophies.filter((id) => !member.hiddenTrophies.has(id)));
}
