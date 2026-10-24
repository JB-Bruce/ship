import { AUDIO } from '../config';
import type { AudioView } from './audioView';
import type { LoopTrack } from './loopTrack';
import { sound } from './sound';

/** Les musiques, de la plus prioritaire à la moins prioritaire. */
type Mood = 'boss' | 'cursed' | 'combat' | 'port' | 'night' | 'sailing';
const MOODS: readonly Mood[] = ['boss', 'cursed', 'combat', 'port', 'night', 'sailing'];
/** En mer, un air puis du silence : ces musiques ne bouclent pas. */
const OCCASIONAL: readonly Mood[] = ['night', 'sailing'];

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Musique selon la situation : boss, navires maudits, combat, port, puis en mer (nuit ou jour). Celles de la situation
 * jouent en boucle et se fondent de l'une à l'autre ; en mer, un air passe de temps en temps, puis la mer et le vent
 * restent seuls un moment (`AUDIO.music.silence`), comme à bord. Le motif du trésor baisse la musique le temps qu'il
 * joue (`stinger`).
 */
export class MusicDirector {
  private readonly tracks = {} as Record<Mood, LoopTrack | null>;
  private mood: Mood | null = null;
  /** Combat encore entendu pendant ce temps après le dernier signe (s). */
  private combatHold = 0;
  /** Silence avant le prochain air en mer (s). */
  private silence = 0;
  private duck = 0;
  private started = false;

  /** Un court motif (trésor trouvé, plan complet) par-dessus la musique, qui se baisse le temps qu'il joue. */
  stinger() {
    sound.play('music/treasure', { bus: 'music', volume: AUDIO.music.levels.treasure });
    this.duck = AUDIO.music.treasureLength;
  }

  update(dt: number, v: AudioView) {
    if (!sound.ready) return;
    if (!this.started) {
      this.started = true;
      for (const mood of MOODS) {
        const track = sound.loop(`music/${mood}`, 'music', !OCCASIONAL.includes(mood));
        if (track && OCCASIONAL.includes(mood)) track.onEnded = () => (this.silence = rand(AUDIO.music.silence));
        this.tracks[mood] = track;
      }
    }
    const m = AUDIO.music;
    this.combatHold = v.combat ? m.combatHold : Math.max(0, this.combatHold - dt);
    this.duck = Math.max(0, this.duck - dt);
    const mood: Mood = v.boss ? 'boss' : v.cursed < m.cursedRange ? 'cursed' : this.combatHold > 0 ? 'combat' : v.inPort ? 'port' : v.night > m.nightAt ? 'night' : 'sailing';
    if (mood !== this.mood) {
      const previous = this.mood;
      this.mood = mood;
      if (OCCASIONAL.includes(mood)) {
        // En quittant le port, un air tout de suite ; après un combat, d'abord la mer seule.
        const fromPort = previous === 'port' || previous === null;
        this.silence = fromPort ? 0 : rand(m.silence);
        if (fromPort) this.tracks[mood]?.restart();
      }
    }
    if (OCCASIONAL.includes(mood) && this.silence > 0) {
      this.silence -= dt;
      if (this.silence <= 0) this.tracks[mood]?.restart();
    }
    const duck = this.duck > 0 ? m.duck : 1;
    for (const key of MOODS) this.tracks[key]?.set(key === mood ? m.levels[key] * duck : 0);
    for (const track of Object.values(this.tracks)) track?.update(dt, 1 / m.fade);
  }
}

/** La musique du jeu (une seule). */
export const music = new MusicDirector();
