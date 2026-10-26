import { AUDIO } from '../config';
import * as THREE from 'three';
import type { LoopTrack } from './loopTrack';
import { sound } from './sound';
import { audioPlaces, type AudioView } from './audioView';

type Loop = 'calm' | 'rough' | 'storm' | 'windLight' | 'windStrong' | 'rain' | 'night' | 'harbor' | 'fire' | 'presence' | 'tavern';

const FILES: Record<Loop, string> = {
  calm: 'ambience/sea_calm',
  rough: 'ambience/sea_rough',
  storm: 'ambience/sea_storm',
  windLight: 'ambience/wind_light',
  windStrong: 'ambience/wind_strong',
  rain: 'ambience/rain',
  night: 'ambience/night_sea',
  harbor: 'ambience/harbor',
  fire: 'combat/fire',
  presence: 'cursed/presence',
  tavern: 'crew/tavern',
};

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const smoothstep = THREE.MathUtils.smoothstep;
const near = (distance: number, range: number) => Math.max(0, 1 - distance / range);

/**
 * Ambiance sonore : la mer (calme, formée, tempête selon la houle), le vent, la pluie, la nuit, le port, l'incendie
 * et la présence des maudits en boucles qui se fondent ; et, de temps en temps, les grincements du navire piloté,
 * ses embruns d'étrave, les mouettes près des côtes et la cloche en entrant au port.
 */
export class AmbienceDirector {
  private readonly loops = {} as Record<Loop, LoopTrack | null>;
  private readonly timers = { creak: 2, gulls: 5, splash: 3 };
  private wasInPort = true;
  private started = false;

  update(dt: number, v: AudioView) {
    if (!sound.ready) return;
    if (!this.started) {
      this.started = true;
      for (const key of Object.keys(FILES) as Loop[]) this.loops[key] = sound.loop(FILES[key], key === 'fire' || key === 'presence' || key === 'tavern' ? 'sfx' : 'ambience');
    }
    const a = AUDIO.ambience;
    const L = a.levels;
    const rough = smoothstep(v.waves, a.roughAt - a.blend, a.roughAt);
    const storm = smoothstep(v.waves, a.stormAt - a.blend, a.stormAt);
    const strong = smoothstep(v.wind, a.strongWind - a.blend, a.strongWind);
    const inside = audioPlaces.tavern ? a.insideTavern : 1;
    this.set('calm', (1 - rough) * L.calm * inside);
    this.set('rough', rough * (1 - storm) * L.rough * inside);
    this.set('storm', storm * L.storm * inside);
    this.set('windLight', Math.min(1, v.wind) * (1 - strong) * L.windLight * inside);
    this.set('windStrong', strong * L.windStrong * inside);
    this.set('rain', v.rain * L.rain * inside);
    this.set('night', v.night * (1 - rough) * L.night * inside);
    this.set('harbor', Math.max(near(v.port, a.harborRange), audioPlaces.port ? 1 : 0) * L.harbor * inside);
    this.set('fire', near(v.fire, a.fireRange) * L.fire);
    this.set('presence', near(v.cursed, a.cursedRange) * L.presence);
    this.set('tavern', audioPlaces.tavern ? L.tavern : 0);
    const rate = 1 / a.fade;
    for (const loop of Object.values(this.loops)) loop?.update(dt, rate);
    this.oneShots(dt, v);
  }

  private set(key: Loop, level: number) {
    this.loops[key]?.set(level);
  }

  /** Grincements, embruns, mouettes, cloche du port. */
  private oneShots(dt: number, v: AudioView) {
    const a = AUDIO.ambience;
    const ship = v.leader;
    const t = this.timers;
    if (v.inPort && !this.wasInPort) sound.play('ambience/ship_bell');
    this.wasInPort = v.inPort;
    if (!ship.alive || audioPlaces.tavern) return;
    // Plus la mer est grosse, plus le bois travaille.
    t.creak -= dt * (1 + v.waves * a.creakSea);
    if (t.creak <= 0) {
      t.creak = rand(a.creakEvery);
      const pick = Math.random();
      sound.at(pick < 0.6 ? 'ambience/hull_creak' : 'ambience/rope_creak', ship.position, { bus: 'ambience' });
    }
    t.splash -= dt;
    if (t.splash <= 0) {
      t.splash = rand(a.splashEvery);
      if (ship.speed > a.splashSpeed) {
        const half = ship.stats.length / 2;
        sound.at('ambience/bow_splash', { x: ship.position.x + Math.sin(ship.heading) * half, y: ship.position.y, z: ship.position.z + Math.cos(ship.heading) * half }, { bus: 'ambience', volume: Math.min(1, ship.speed / (a.splashSpeed * 2)) });
      }
    }
    t.gulls -= dt;
    if (t.gulls <= 0) {
      t.gulls = rand(a.gullEvery);
      if (v.coast < a.gullCoast && v.night < a.gullNight) sound.play('ambience/gulls', { bus: 'ambience', volume: near(v.coast, a.gullCoast) });
    }
  }
}
