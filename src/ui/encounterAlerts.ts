import { ENCOUNTER_ALERT } from '../config';
import type { Ship } from '../ship/ship';
import { shipTypeLabel } from '../progression/blueprints';
import { wrapAngle } from '../utils/math';
import type { Enemy } from '../world/enemySpawner';
import { threatOf, type Threat } from './enemyTags';
import type { Hud } from './hud';
import type { Radar } from './radar';

const THREAT_ORDER: readonly Threat[] = ['weak', 'even', 'strong', 'deadly'];
/** Huit secteurs autour du navire piloté, en partant de l'avant vers bâbord (le cap augmente vers bâbord). */
const SECTORS = ['devant', 'à bâbord avant', 'par bâbord', 'à bâbord arrière', 'derrière', 'à tribord arrière', 'par tribord', 'à tribord avant'];

/**
 * « Voile à l'horizon ! » : dès qu'un ennemi repère un navire de ta flotte (il se lance à sa poursuite), un bandeau
 * annonce la rencontre (navire, ou flottille et son chef ; direction par rapport à ton navire, comme le radar ; en rouge
 * si elle est plus forte que toi) et un anneau pulse autour de lui sur le radar. Une seule fois par rencontre (une
 * flottille compte pour une) ; les boss ont leur propre annonce.
 */
export class EncounterAlerts {
  /** Rencontres déjà annoncées : la flottille (son groupe) ou le navire seul. */
  private readonly announced = new WeakSet<object>();

  constructor(
    private readonly hud: Hud,
    private readonly radar: Radar,
  ) {}

  update(enemies: readonly Enemy[], leader: Ship) {
    for (const enemy of enemies) {
      const { ai, ship } = enemy;
      if (enemy.boss || !ship.alive || ai.hidden || ai.state === 'patrol' || ai.target?.faction !== 'player') continue;
      const key = ai.group ?? ship;
      if (this.announced.has(key)) continue;
      this.announced.add(key);
      const members = ai.group ? enemies.filter((e) => e.ai.group === ai.group && e.ship.alive) : [enemy];
      this.announce(members, leader);
    }
  }

  private announce(members: readonly Enemy[], leader: Ship) {
    const chief = members.find((e) => e.ship === e.ai.group?.leader) ?? members[0];
    const threat = members.reduce<Threat>((worst, e) => {
      const t = threatOf(e, leader);
      return THREAT_ORDER.indexOf(t) > THREAT_ORDER.indexOf(worst) ? t : worst;
    }, 'weak');
    const name = (e: Enemy) => `${e.name ? `${e.name}, ` : ''}${shipTypeLabel(e.ship.type, e.ship.extension)}${e.elite ? ' d’élite' : ''}`;
    const who = members.length > 1 ? `${members.length} navires (chef : ${name(chief)})` : name(chief);
    const { x, z } = chief.ship.position;
    const bearing = wrapAngle(Math.atan2(x - leader.position.x, z - leader.position.z) - leader.heading);
    const sector = SECTORS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
    const distance = Math.round(chief.ship.distanceTo(leader) / 10) * 10;
    this.hud.message(`⚓ Voile à l'horizon ! ${who}, ${sector}, ${distance} m`, ENCOUNTER_ALERT.bannerTime, threat === 'strong' || threat === 'deadly');
    for (const e of members) this.radar.ping(e.ship, ENCOUNTER_ALERT.radarPing);
  }
}
