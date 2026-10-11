import { BOSSES } from '../config';
import type { Ship } from '../ship/ship';
import { sizeRank, typeName } from '../shipTypes';
import type { Enemy } from '../world/enemySpawner';

/** Menace d'un ennemi pour le navire piloté : plus petit, de même taille, plus fort, ou redoutable (boss, deux crans au-dessus). */
export type Threat = 'weak' | 'even' | 'strong' | 'deadly';

/** Une élite compte un cran de plus ; un boss est toujours redoutable. */
export function threatOf(enemy: Enemy, leader: Ship): Threat {
  if (enemy.boss) return 'deadly';
  const diff = sizeRank(enemy.ship.type) + (enemy.elite ? 1 : 0) - sizeRank(leader.type);
  return diff < 0 ? 'weak' : diff === 0 ? 'even' : diff === 1 ? 'strong' : 'deadly';
}

/** Texte de l'étiquette (HTML) : nom du boss ou du capitaine, sinon le type ; couronne pour une élite, crâne si redoutable. */
export function enemyTagHtml(enemy: Enemy, threat: Threat): string {
  const type = typeName(enemy.ship.type);
  const name = enemy.boss ? BOSSES[enemy.boss].name : enemy.name ? `${enemy.name} · ${type}` : type;
  const crown = enemy.elite ? '<b class="crown">♛</b>' : '';
  const skull = threat === 'deadly' ? '☠ ' : '';
  return `${skull}${crown}${name}`;
}
