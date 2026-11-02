/**
 * Une boucle (ambiance, musique) lue en continu depuis son fichier, sans la décoder entière en mémoire : un élément
 * `<audio>` branché sur le graphe du son par une source « élément média ». Son volume glisse vers celui demandé ;
 * muette assez longtemps, elle se met en pause (elle ne coûte alors plus rien) et reprend quand on la remonte.
 */
export class LoopTrack {
  private readonly element: HTMLAudioElement;
  private readonly gain: GainNode;
  private level = 0;
  private target = 0;
  private playing = false;
  /** Fin de lecture d'un morceau joué une fois (`loop` faux). */
  onEnded: (() => void) | null = null;

  constructor(
    context: AudioContext,
    output: AudioNode,
    url: string,
    loop = true,
  ) {
    this.element = new Audio(url);
    this.element.loop = loop;
    this.element.preload = 'auto';
    this.element.addEventListener('ended', () => {
      this.playing = false;
      this.onEnded?.();
    });
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    context.createMediaElementSource(this.element).connect(this.gain).connect(output);
  }

  /** Volume visé (0 à 1). */
  set(level: number) {
    this.target = level;
  }

  /** Recommence au début (morceau joué une fois). */
  restart() {
    this.element.currentTime = 0;
    this.level = 0;
    this.gain.gain.value = 0;
    this.start();
  }

  get audible(): boolean {
    return this.level > 0.001;
  }

  /** Avance le fondu : `rate` = part du volume parcourue par seconde. */
  update(dt: number, rate: number) {
    const step = rate * dt;
    this.level = this.level < this.target ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
    this.gain.gain.value = this.level;
    if (this.level > 0 && !this.playing && (this.element.loop || this.element.currentTime === 0)) this.start();
    else if (this.level === 0 && this.target === 0 && this.playing && this.element.loop) {
      this.element.pause();
      this.playing = false;
    }
  }

  private start() {
    this.playing = true;
    // Le navigateur peut encore refuser (pas de geste du joueur) : on réessaiera à la prochaine montée.
    void this.element.play().catch(() => (this.playing = false));
  }
}
