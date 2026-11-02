import type * as THREE from 'three';
import { AUDIO } from '../config';
import type { Campaign } from '../campaign';
import type { Fleet } from '../fleet/fleet';
import type { Ship } from '../ship/ship';
import type { Bosses } from '../world/bossEncounter';
import type { EnemySpawner } from '../world/enemySpawner';
import { harbors } from '../world/harbors';
import { ISLAND_LIST, land } from '../world/island';
import { conditions, type Weather } from '../world/weather';
import type { Wind } from '../world/wind';
import { AmbienceDirector } from './ambienceDirector';
import { audioPlaces, type AudioView } from './audioView';
import { music } from './musicDirector';
import { sound } from './sound';

/** Ce que le son lit du jeu. */
export interface GameAudioWorld {
  fleet: Fleet;
  weather: Weather;
  wind: Wind;
  campaign: Campaign;
  spawner: EnemySpawner;
  bosses: Bosses;
  /** Un monstre (le Kraken) menace ta flotte : musique de boss. */
  monster: () => boolean;
  ships: readonly Ship[];
}

/**
 * Le son en jeu, à chaque image (même en pause : les fondus suivent le temps réel) : l'oreille sur la caméra, puis ce
 * que les ambiances et la musique doivent savoir du monde (`AudioView`, refait sur place, sans allocation).
 */
export class GameAudio {
  private readonly ambience = new AmbienceDirector();
  private readonly view: AudioView;
  /** Combat à l'image précédente : au premier signe, l'équipage crie aux postes. */
  private fighting = false;

  constructor(private readonly w: GameAudioWorld) {
    this.view = { leader: w.fleet.leader, waves: 1, rain: 0, wind: 0, night: 0, port: Infinity, coast: Infinity, inPort: true, fire: Infinity, cursed: Infinity, combat: false, boss: false };
  }

  update(elapsed: number, camera: THREE.Camera) {
    sound.listen(camera);
    if (!sound.ready) return;
    const { fleet, weather, wind, campaign, spawner, bosses, ships } = this.w;
    const v = this.view;
    const leader = fleet.leader;
    const p = leader.position;
    v.leader = leader;
    v.waves = weather.state.waveFactor;
    v.rain = weather.state.rain;
    v.wind = wind.strength;
    v.night = conditions.night;
    v.port = Infinity;
    for (const island of ISLAND_LIST) if (harbors.isOpen(island.id)) v.port = Math.min(v.port, Math.hypot(p.x - island.port.x, p.z - island.port.z));
    v.coast = land.sdf(p.x, p.z);
    v.inPort = audioPlaces.port || campaign.portInRange(leader) !== null;
    v.fire = Infinity;
    for (const ship of ships) if (ship.alive && ship.crits.fire > 0) v.fire = Math.min(v.fire, sound.distance(ship.position));
    v.cursed = Infinity;
    v.combat = false;
    for (const e of spawner.enemies) {
      const ship = e.ship;
      if (!ship.alive) continue;
      const d = ship.distanceTo(leader);
      if (e.cursed && !ship.intangible) v.cursed = Math.min(v.cursed, d);
      if (d < AUDIO.music.combatRange && e.ai.target?.faction === 'player') v.combat = true;
    }
    v.boss = bosses.inSight(leader) !== null || this.w.monster();
    if (v.combat && !this.fighting) sound.at('crew/shout', leader.position);
    this.fighting = v.combat;
    this.ambience.update(elapsed, v);
    music.update(elapsed, v);
  }
}
