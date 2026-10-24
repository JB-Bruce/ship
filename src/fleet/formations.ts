import { FLEET } from '../config';
import type { Formation } from './fleet';

/** Résultat de `formationOffset` (réutilisé : appelé pour chaque suiveur à chaque image). */
const offset = { back: 0, side: 0 };

/**
 * Décalage d'un suiveur dans la formation, dans le repère du bateau piloté : vers l'arrière (`back`) et vers bâbord
 * (`side`), en mètres. `rank` = sa place parmi les suiveurs (à partir de 1) ; `freeSlot` = sa place tirée au hasard
 * pour la formation « libre », retirée quand son délai est écoulé. Renvoie un objet réutilisé.
 */
export function formationOffset(formation: Formation, rank: number, freeSlot: { side: number; back: number; timer: number }, dt: number): { back: number; side: number } {
  const pair = Math.ceil(rank / 2);
  const alternate = rank % 2 === 1 ? 1 : -1;
  const s = FLEET.spacing;
  let back = 0;
  let side = 0;
  switch (formation) {
    case 'column':
      back = s * rank;
      break;
    case 'line':
      side = alternate * s * pair;
      back = 2;
      break;
    case 'vee':
      side = alternate * s * 0.75 * pair;
      back = s * 0.85 * pair;
      break;
    case 'free': {
      const f = freeSlot;
      f.timer -= dt;
      if (f.timer <= 0) {
        f.side = (Math.random() * 2 - 1) * 55;
        f.back = -25 + Math.random() * 85;
        f.timer = 15 + Math.random() * 10;
      }
      side = f.side;
      back = f.back;
    }
  }
  offset.back = back;
  offset.side = side;
  return offset;
}
