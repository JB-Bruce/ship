import { cargoTotal, emptyCargo, GOODS, goodText, type Good } from '../progression/goods';
import { factor } from '../progression/modifiers';
import { holdCapacity } from '../progression/upgrades';
import type { FleetMember } from './fleet';

/** Places dans la cale d'un navire (un quartier-maître sait mieux l'arrimer). */
export function capacityOf(member: FleetMember): number {
  return Math.round(holdCapacity(member.type, member.levels) * factor(member.ship.modifiers, 'hold'));
}

/** Places libres dans la cale d'un navire. */
export function freeSpace(member: FleetMember): number {
  return Math.max(0, capacityOf(member) - cargoTotal(member.cargo));
}

/** Range jusqu'à `amount` unités dans la cale d'un navire. Renvoie ce qui a pu être rangé. */
export function store(member: FleetMember, good: Good, amount: number): number {
  const stored = Math.min(amount, freeSpace(member));
  member.cargo[good] += stored;
  return stored;
}

/** Navires dont la cale est utilisable : dans le monde et à flot. */
function afloat(members: readonly FleetMember[]): FleetMember[] {
  return members.filter((m) => m.inWorld && m.ship.alive);
}

/** Total d'une marchandise dans les cales de la flotte à flot. */
export function fleetStock(members: readonly FleetMember[], good: Good): number {
  return afloat(members).reduce((sum, m) => sum + m.cargo[good], 0);
}

/** Places occupées et places totales dans les cales de la flotte à flot. */
export function fleetHold(members: readonly FleetMember[]): { used: number; capacity: number } {
  const ships = afloat(members);
  return {
    used: ships.reduce((sum, m) => sum + cargoTotal(m.cargo), 0),
    capacity: ships.reduce((sum, m) => sum + capacityOf(m), 0),
  };
}

/** Décharge jusqu'à `amount` unités d'une marchandise, cale après cale. Renvoie ce qui a été déchargé. */
export function unload(members: readonly FleetMember[], good: Good, amount: number): number {
  let left = amount;
  for (const m of afloat(members)) {
    const taken = Math.min(left, m.cargo[good]);
    m.cargo[good] -= taken;
    left -= taken;
  }
  return amount - left;
}

/** Charge jusqu'à `amount` unités dans les cales libres de la flotte, `first` d'abord. Renvoie ce qui a été chargé. */
export function load(members: readonly FleetMember[], good: Good, amount: number, first?: FleetMember): number {
  const ships = afloat(members).sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
  let left = amount;
  for (const m of ships) left -= store(m, good, left);
  return amount - left;
}

/** Vide la cale d'un navire qui sombre. Renvoie la description de ce qui a été perdu, ou null si elle était vide. */
export function loseCargo(member: FleetMember): string | null {
  const lost = GOODS.filter((g) => member.cargo[g] > 0).map((g) => goodText(g, member.cargo[g]));
  Object.assign(member.cargo, emptyCargo());
  return lost.length ? lost.join(', ') : null;
}
