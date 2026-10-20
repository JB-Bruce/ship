import { FISHING } from '../config';
import { isHostile, type Ship } from '../ship/ship';
import { catchFactor } from '../progression/upgrades';
import { SHIP_TYPES } from '../shipTypes';
import type { FishSchool, FishSchools } from '../world/fishSchools';
import { conditions } from '../world/weather';
import type { Fleet, FleetMember } from './fleet';
import { freeSpace, store } from './holds';

/** Temps entre deux poissons pour un navire : plus court avec de meilleurs filets (s). */
const catchInterval = (m: FleetMember) => FISHING.catchInterval * catchFactor(m.type, m.levels);

export interface FishingEvents {
  /** Un poisson vient d'être pêché par `member`. */
  caught(member: FleetMember): void;
  /** Message à afficher (début ou fin de la pêche, cale pleine…). */
  say(text: string): void;
}

/**
 * Pêche de la flotte sur un banc. Touche F près d'un banc : les chaloupes et sloops qui ont de la place y vont
 * (les alliés à un poste autour du banc, le bateau piloté si c'est un pêcheur) et, presque à l'arrêt, remontent un
 * poisson de temps en temps. Tout s'arrête si un ennemi est en vue, si le bateau piloté s'éloigne, si le banc est
 * épuisé ou si les cales sont pleines.
 */
export class Fishing {
  /** Le banc pêché, ou null. */
  school: FishSchool | null = null;
  /** Pêcheurs engagés, avec le temps restant avant leur prochain poisson (s). */
  private readonly crew = new Map<FleetMember, number>();

  constructor(
    private readonly fleet: Fleet,
    private readonly events: FishingEvents,
  ) {}

  /** Le banc à portée du bateau piloté (pour proposer la commande), ou null. */
  schoolInRange(schools: FishSchools): FishSchool | null {
    const p = this.fleet.leader.position;
    return schools.nearest(p.x, p.z, FISHING.orderRange);
  }

  /** Touche F : arrête la pêche en cours, ou la lance sur le banc à portée. */
  toggle(schools: FishSchools, ships: readonly Ship[]) {
    if (this.school) {
      this.stop('Fin de la pêche.');
      return;
    }
    const school = this.schoolInRange(schools);
    if (!school) return;
    if (this.enemyInSight(ships)) {
      this.events.say('Impossible de pêcher : ennemi en vue !');
      return;
    }
    const afloat = this.fleet.hand.filter((m) => m.inWorld && m.ship.alive && SHIP_TYPES[m.type].canFish);
    const fishers = afloat.filter((m) => freeSpace(m) > 0);
    if (!fishers.length) {
      this.events.say(afloat.length ? 'Les cales de tes pêcheurs sont pleines.' : 'Aucun navire de ta flotte ne sait pêcher (une chaloupe, par exemple).');
      return;
    }
    this.school = school;
    const helm = this.fleet.controlled;
    // Pendant une escorte, les suiveurs restent autour du navire protégé : seul le bateau piloté pêche.
    const allies = this.fleet.guarded ? [] : fishers.filter((m) => m !== helm);
    allies.forEach((m, i) => {
      const angle = school.seed + (i / allies.length) * Math.PI * 2;
      m.station = { x: school.x + Math.sin(angle) * FISHING.stationRadius, z: school.z + Math.cos(angle) * FISHING.stationRadius };
    });
    if (!fishers.includes(helm) && !allies.length) {
      this.events.say('Ta flotte escorte le marchand : elle ne peut pas pêcher.');
      this.school = null;
      return;
    }
    for (const m of fishers) if (m === helm || allies.includes(m)) this.crew.set(m, catchInterval(m));
    const sent = allies.length ? `${allies.length} navire${allies.length > 1 ? 's' : ''} part${allies.length > 1 ? 'ent' : ''} pêcher.` : '';
    this.events.say(fishers.includes(helm) ? `Affale la voile au-dessus du banc pour pêcher. ${sent}` : sent);
  }

  update(dt: number, ships: readonly Ship[]) {
    const school = this.school;
    if (!school) return;
    const leader = this.fleet.leader;
    if (!leader.alive) return this.stop(null);
    if (school.diving) return this.stop(school.fish <= 0 ? 'Le banc est épuisé.' : 'Le banc a plongé.');
    if (this.enemyInSight(ships)) return this.stop('Ennemi en vue ! Fin de la pêche.');
    if (Math.hypot(leader.position.x - school.x, leader.position.z - school.z) > FISHING.leaveRange) {
      return this.stop('Tu t’éloignes du banc : fin de la pêche.');
    }
    for (const [member, timer] of this.crew) {
      if (!member.inWorld || !member.ship.alive) {
        this.release(member);
        continue;
      }
      if (!this.inPosition(member.ship, school)) continue;
      const left = timer - dt;
      this.crew.set(member, left > 0 ? left : left + catchInterval(member));
      if (left > 0) continue;
      if (store(member, 'fish', 1)) {
        school.fish--;
        this.events.caught(member);
      }
      if (freeSpace(member) === 0) {
        this.events.say(`${member.name} a la cale pleine.`);
        this.release(member);
      }
      if (school.fish <= 0) break;
    }
    if (this.crew.size === 0) this.stop('Cales pleines : fin de la pêche.');
  }

  /** Texte d'état pour l'interface, ou null si on ne pêche pas. */
  status(): string | null {
    if (!this.school) return null;
    const helm = this.fleet.controlled;
    if (this.crew.has(helm) && !this.inPosition(helm.ship, this.school)) return 'Pêche : affale la voile au-dessus du banc';
    return `Pêche en cours · ${this.school.fish} poissons dans le banc`;
  }

  /** Assez près du centre du banc, et presque à l'arrêt. */
  private inPosition(ship: Ship, school: FishSchool): boolean {
    const d = Math.hypot(ship.position.x - school.x, ship.position.z - school.z);
    return d < FISHING.radius + ship.stats.length / 2 && ship.speed < FISHING.maxSpeed;
  }

  private enemyInSight(ships: readonly Ship[]): boolean {
    const leader = this.fleet.leader;
    const range = FISHING.enemyRange * conditions.detectionFactor;
    return ships.some((s) => s.alive && isHostile(leader, s) && s.distanceTo(leader) < range);
  }

  private release(member: FleetMember) {
    this.crew.delete(member);
    member.station = null;
  }

  /** Arrête la pêche : les alliés reprennent leur place dans la formation. */
  private stop(message: string | null) {
    for (const member of this.crew.keys()) member.station = null;
    this.crew.clear();
    this.school = null;
    if (message) this.events.say(message);
  }
}
