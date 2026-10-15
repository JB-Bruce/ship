import { AllyAI } from '../ai/allyAI';
import type { Crew } from '../fleet/crew';
import type { Fleet, FleetMember } from '../fleet/fleet';
import { refit } from '../fleet/refit';
import { emptyCargo } from '../progression/goods';
import { standardGuns } from '../progression/modifiers';
import { noUpgrades } from '../progression/upgrades';
import { createShip } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import type { MemberSnapshot, SaveData } from './saveData';

/** Un navire de la flotte tel qu'on le sauvegarde. Celui qui coule est noté en attente de réapparition. */
export function snapshotMember(m: FleetMember, respawnFactor: number): MemberSnapshot {
  const { ship } = m;
  const afloat = m.inWorld && ship.alive;
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    levels: { ...m.levels },
    spent: { ...m.spent },
    kills: m.kills,
    cargo: { ...m.cargo },
    guns: { ...m.guns },
    ownedGuns: [...m.ownedGuns],
    trophies: [...m.trophies],
    hiddenTrophies: [...m.hiddenTrophies],
    trade: m.trade && { ports: [...m.trade.ports], goods: [...m.trade.goods], leg: m.trade.leg },
    afloat: afloat ? { x: ship.position.x, z: ship.position.z, heading: ship.heading, health: ship.health, sail: ship.controls.sail } : null,
    respawnIn: afloat ? 0 : m.inWorld ? SHIP_TYPES[m.type].respawnTime * respawnFactor : m.respawnIn,
  };
}

/** Recrée les navires d'une sauvegarde dans une flotte vide, chacun à sa place, et reprend la barre du bon. */
export function rebuildFleet(fleet: Fleet, saved: SaveData['fleet']) {
  fleet.formation = saved.formation;
  for (const s of saved.members) {
    const ship = createShip(s.type, 'player', { ...noUpgrades(), ...s.levels });
    const member: FleetMember = {
      id: s.id,
      name: s.name,
      type: s.type,
      levels: { ...noUpgrades(), ...s.levels },
      ship,
      ai: new AllyAI(ship),
      inWorld: false,
      respawnIn: s.respawnIn,
      spent: { ...s.spent },
      freeSlot: { side: 0, back: 0, timer: 0 },
      kills: s.kills,
      cargo: { ...emptyCargo(), ...s.cargo },
      station: null,
      guns: { ...standardGuns(), ...s.guns },
      ownedGuns: new Set(s.ownedGuns),
      trophies: [...s.trophies],
      hiddenTrophies: new Set(s.hiddenTrophies),
      trade: s.trade && { ports: [...s.trade.ports], goods: [...s.trade.goods], leg: s.trade.leg },
    };
    fleet.adopt(member, s.afloat && { x: s.afloat.x, z: s.afloat.z, heading: s.afloat.heading });
  }
  fleet.controlled = fleet.members.find((m) => m.id === saved.controlledId) ?? fleet.members[0];
}

/**
 * Une fois l'équipage rétabli : caractéristiques de chaque navire (améliorations, officiers, rang), puis sa vie (× `healthScale`
 * pour une ancienne sauvegarde, voir healthScaleOf) et sa voile.
 */
export function finishFleet(fleet: Fleet, saved: SaveData['fleet'], crew: Crew, healthScale = 1) {
  for (const s of saved.members) {
    const member = fleet.members.find((m) => m.id === s.id);
    if (!member) continue;
    refit(member, crew);
    if (!s.afloat) continue;
    member.ship.health = Math.min(member.ship.stats.maxHealth, Math.max(1, s.afloat.health * healthScale));
    member.ship.controls.sail = s.afloat.sail;
  }
}
