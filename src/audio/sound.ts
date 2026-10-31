import * as THREE from 'three';
import { AUDIO } from '../config';
import type { Volumes } from '../settings/settings';
import { LoopTrack } from './loopTrack';

/** Les quatre voies du son : musique, effets (combat, menus, équipage), ambiance (mer, vent, pluie). */
export type Bus = 'music' | 'sfx' | 'ambience';

/** Réglages d'un son joué : volume (× celui du son), hauteur, voie. */
export interface PlayOptions {
  volume?: number;
  rate?: number;
  bus?: Bus;
  /** Retard (s) : le tonnerre après l'éclair. */
  delay?: number;
  /** Distance (m) en deçà de laquelle un son en 3D garde tout son volume : plus grande pour un son très fort (canon). */
  ref?: number;
}

const forward = new THREE.Vector3();
const up = new THREE.Vector3();

/**
 * Le son du jeu (un seul, `sound`) : muet tant que le joueur n'a pas cliqué (`unlock`, écran d'accueil), puis il
 * charge la liste des fichiers (`manifest.json`) et décode les bruitages courts. `play` joue un son à plat (menus),
 * `at` le place en 3D autour de l'oreille, posée chaque image sur la caméra (`listen`). Un nom sans numéro
 * (« combat/splash ») tire l'une de ses variantes (`splash_1`, `splash_2`…). Les boucles longues sont des `LoopTrack`.
 * Un fichier absent reste muet.
 */
class Sound {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private readonly buses = {} as Record<Bus, GainNode>;
  /** Fichiers connus par nom de base (sans numéro ni extension), et leurs sons décodés. */
  private readonly variants = new Map<string, string[]>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private voices = 0;
  private volumes: Volumes = { ...AUDIO.volumes };
  private muted = false;
  /** Position de l'oreille (la caméra). */
  readonly ear = new THREE.Vector3();

  /** Le son est allumé et la liste des fichiers lue : les boucles peuvent se créer. */
  get ready(): boolean {
    return this.loaded;
  }
  private loaded = false;

  /** Premier geste du joueur : le son s'allume et les fichiers se chargent. */
  async unlock(): Promise<void> {
    if (this.context) return;
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    for (const bus of ['music', 'sfx', 'ambience'] as Bus[]) {
      this.buses[bus] = context.createGain();
      this.buses[bus].connect(this.master);
    }
    this.applyVolumes();
    try {
      const list = (await (await fetch(`${AUDIO.root}manifest.json`)).json()) as Record<string, { duration?: number }>;
      for (const [file, info] of Object.entries(list)) {
        const base = file.replace(/\.ogg$/, '').replace(/_\d+$/, '');
        const files = this.variants.get(base) ?? [];
        files.push(file);
        this.variants.set(base, files);
        // Les bruitages courts sont décodés d'avance ; les boucles et la musique sont lues en continu.
        if ((info.duration ?? 0) < AUDIO.streamFrom) void this.decode(file);
      }
      this.loaded = true;
    } catch {
      // Pas de liste : tout reste muet.
    }
  }

  setVolumes(volumes: Volumes, muted: boolean) {
    this.volumes = { ...volumes };
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.context) return;
    this.master.gain.value = this.muted ? 0 : this.volumes.master;
    for (const bus of ['music', 'sfx', 'ambience'] as Bus[]) this.buses[bus].gain.value = this.volumes[bus];
  }

  /** L'oreille suit la caméra (position et orientation). */
  listen(camera: THREE.Camera) {
    this.ear.setFromMatrixPosition(camera.matrixWorld);
    if (!this.context) return;
    const l = this.context.listener;
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = this.ear.x;
      l.positionY.value = this.ear.y;
      l.positionZ.value = this.ear.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(this.ear.x, this.ear.y, this.ear.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Distance de l'oreille à un point (m). */
  distance(p: { x: number; y?: number; z: number }): number {
    return Math.hypot(p.x - this.ear.x, (p.y ?? 0) - this.ear.y, p.z - this.ear.z);
  }

  /** Un son à plat (menus, ton navire). */
  play(name: string, options: PlayOptions = {}) {
    this.voice(name, options, null);
  }

  /** Un son placé en 3D ; rien au-delà de sa portée. */
  at(name: string, p: { x: number; y: number; z: number }, options: PlayOptions = {}) {
    if (this.distance(p) > AUDIO.maxDistance) return;
    this.voice(name, options, p);
  }

  /** Un coup de canon (ou de mortier) : tout proche, ou lointain et sourd au-delà de `AUDIO.farCannon`. */
  cannon(p: { x: number; y: number; z: number }, mortar = false) {
    if (mortar) this.at('combat/mortar_fire', p, { ref: AUDIO.refs.cannon });
    else this.at(this.distance(p) > AUDIO.farCannon ? 'combat/cannon_far' : 'combat/cannon_near', p, { ref: AUDIO.refs.cannon });
  }

  /** Une boucle longue lue en continu, sur une voie. `loop` faux : un morceau joué une fois (voir LoopTrack). */
  loop(name: string, bus: Bus, loop = true): LoopTrack | null {
    if (!this.context) return null;
    const file = this.variants.get(name)?.[0];
    if (!file) return null;
    return new LoopTrack(this.context, this.buses[bus], `${AUDIO.root}${file}`, loop);
  }

  private voice(name: string, options: PlayOptions, p: { x: number; y: number; z: number } | null) {
    const context = this.context;
    if (!context || this.muted || this.voices >= AUDIO.maxVoices) return;
    const files = this.variants.get(name);
    if (!files) return;
    const buffer = this.buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * AUDIO.pitchJitter);
    const gain = context.createGain();
    gain.gain.value = (options.volume ?? 1) * (AUDIO.gains[name] ?? 1);
    source.connect(gain);
    let out: AudioNode = gain;
    if (p) {
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = options.ref ?? AUDIO.refDistance;
      panner.maxDistance = AUDIO.maxDistance;
      panner.rolloffFactor = AUDIO.rolloff;
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
      gain.connect(panner);
      out = panner;
    }
    out.connect(this.buses[options.bus ?? 'sfx']);
    this.voices++;
    source.onended = () => {
      this.voices--;
      out.disconnect();
    };
    source.start(context.currentTime + (options.delay ?? 0));
  }

  private async decode(file: string) {
    try {
      const data = await (await fetch(`${AUDIO.root}${file}`)).arrayBuffer();
      this.buffers.set(file, await this.context!.decodeAudioData(data));
    } catch {
      // Fichier absent ou illisible : ce son reste muet.
    }
  }
}

export const sound = new Sound();
