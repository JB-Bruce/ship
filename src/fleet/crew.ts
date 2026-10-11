import { ISLAND_INFO, OFFICERS, type IslandId } from '../config';
import type { FleetMember } from './fleet';
import { gainXp, randomOfficer, type Officer } from './officers';

const ISLAND_IDS = Object.keys(ISLAND_INFO) as IslandId[];

/**
 * L'équipage de la flotte : les officiers engagés (à bord d'un navire ou à terre), et les candidats de chaque taverne,
 * renouvelés à chaque journée. Un navire a OFFICERS.slots places selon son type.
 */
export class Crew {
  readonly officers: Officer[] = [];
  readonly candidates = Object.fromEntries(ISLAND_IDS.map((id) => [id, []])) as unknown as Record<IslandId, Officer[]>;
  private nextId = 1;

  /** Complète les candidats d'une taverne. */
  fillCandidates(island: IslandId) {
    const list = this.candidates[island];
    while (list.length < OFFICERS.candidates) list.push(randomOfficer(this.nextId++, this.takenNames()));
  }

  /** Nouvelle journée : nouveaux candidats dans toutes les tavernes. */
  newDay() {
    for (const id of ISLAND_IDS) {
      this.candidates[id].length = 0;
      this.fillCandidates(id);
    }
  }

  /** Engage un candidat (le prix est payé par le port). Il reste à terre jusqu'à son affectation. */
  recruit(island: IslandId, id: number): Officer | null {
    const list = this.candidates[island];
    const i = list.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const [officer] = list.splice(i, 1);
    this.officers.push(officer);
    return officer;
  }

  /** Officiers à bord d'un navire. */
  aboard(memberId: number): Officer[] {
    return this.officers.filter((o) => o.assignedTo === memberId);
  }

  /** Places libres à bord. */
  freeSlots(member: FleetMember): number {
    return OFFICERS.slots[member.type] - this.aboard(member.id).length;
  }

  /** Affecte un officier à un navire (s'il y a de la place), ou le débarque (`member` null). */
  assign(officer: Officer, member: FleetMember | null): boolean {
    if (member && officer.assignedTo !== member.id && this.freeSlots(member) <= 0) return false;
    officer.assignedTo = member ? member.id : null;
    return true;
  }

  /** Le navire a coulé un ennemi : ses officiers gagnent de l'expérience. Renvoie ceux qui gagnent une étoile. */
  onKill(memberId: number): Officer[] {
    return this.aboard(memberId).filter((o) => gainXp(o));
  }

  /** Le navire quitte la flotte (vendu) : ses officiers débarquent. */
  release(memberId: number) {
    for (const o of this.aboard(memberId)) o.assignedTo = null;
  }

  /** Mission spéciale réussie : l'officier unique qu'elle offre (s'il y en a un) rejoint l'équipage, à terre. */
  grantUnique(special: string): Officer | null {
    const def = OFFICERS.unique.find((u) => u.special === special);
    if (!def || this.officers.some((o) => o.name === def.name)) return null;
    const officer: Officer = { id: this.nextId++, name: def.name, role: def.role, baseTalent: def.talent, talent: def.talent, trait: def.trait, xp: 0, assignedTo: null, unique: true };
    this.officers.push(officer);
    return officer;
  }

  private takenNames(): Set<string> {
    return new Set([...this.officers, ...Object.values(this.candidates).flat()].map((o) => o.name));
  }
}
