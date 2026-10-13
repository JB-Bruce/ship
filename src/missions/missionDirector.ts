import { CONTRACTS, ISLAND_INFO } from '../config';
import type { Contract } from '../progression/contracts';
import type { Ship } from '../ship/ship';
import type { Fort } from '../world/fort';
import { EscortMission } from './escortMission';
import { HuntMission } from './huntMission';
import type { MapZone, Mission, MissionWorld } from './mission';
import { SiegeMission } from './siegeMission';

export interface MissionEvents {
  say(text: string, danger?: boolean): void;
  succeeded(contract: Contract): void;
  failed(contract: Contract, reason: string): void;
}

/**
 * Directeur des missions : quand un contrat de chasse, de défense ou d'escorte est accepté, il fait apparaître ce
 * qu'il faut en mer et suit la mission jusqu'à sa réussite ou son échec (ou son abandon).
 */
export class MissionDirector {
  private readonly running = new Map<Contract, Mission>();

  constructor(
    private readonly world: MissionWorld,
    private readonly events: MissionEvents,
  ) {}

  /** Un contrat vient d'être accepté : s'il s'agit d'une mission, elle commence. */
  start(contract: Contract) {
    switch (contract.kind) {
      case 'hunt':
        this.running.set(contract, new HuntMission(this.world, contract));
        this.events.say(`${contract.captain} est signalé au large : sa zone est marquée sur ta carte.`);
        break;
      case 'defend': {
        const place = ISLAND_INFO[contract.from].shortName;
        const order = { island: contract.from, stars: contract.tier ?? contract.stars, squadron: contract.squadron, delay: CONTRACTS.defend.delay };
        this.running.set(contract, new SiegeMission(this.world, order, () => this.events.say(`⚔ Une escadre de la Marine attaque ${place} !`, true)));
        this.events.say(`Les vigies de ${place} guettent l’escadre…`);
        break;
      }
      case 'escort':
        this.running.set(contract, new EscortMission(this.world, contract, () => this.events.say('⚔ Embuscade ! La Marine attaque le marchand.', true)));
        this.events.say(`Le marchand quitte le port : escorte-le jusqu’à ${ISLAND_INFO[contract.claimAt].shortName}.`);
        break;
    }
  }

  /** Contrat abandonné : la mission s'arrête. */
  cancel(contract: Contract) {
    this.running.get(contract)?.dispose();
    this.running.delete(contract);
  }

  update(dt: number) {
    for (const [contract, mission] of this.running) {
      const outcome = mission.update(dt);
      if (outcome === 'running') continue;
      mission.dispose();
      this.running.delete(contract);
      if (outcome === 'success') this.events.succeeded(contract);
      else this.events.failed(contract, mission.failure);
    }
  }

  /** État d'une mission, pour le suivi des contrats (null si ce n'est pas une mission en cours). */
  status(contract: Contract): string | null {
    return this.running.get(contract)?.status() ?? null;
  }

  /** Zones à marquer sur la carte. */
  zones(): MapZone[] {
    const zones: MapZone[] = [];
    for (const mission of this.running.values()) {
      const zone = mission.zone();
      if (zone) zones.push(zone);
    }
    return zones;
  }

  /** Navires escortés (à protéger), en bleu ciel sur le radar et la carte. */
  escorts(): Ship[] {
    const ships: Ship[] = [];
    for (const mission of this.running.values()) if (mission instanceof EscortMission) ships.push(mission.ship);
    return ships;
  }

  /** Ouvrages assiégés en ce moment (les boulets ennemis peuvent les toucher). */
  besieged(): Fort[] {
    const forts: Fort[] = [];
    for (const mission of this.running.values()) {
      const fort = mission instanceof SiegeMission ? mission.besieged : null;
      if (fort) forts.push(fort);
    }
    return forts;
  }
}
