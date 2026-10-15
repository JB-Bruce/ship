import * as THREE from 'three';
import { OCEAN, SKY, WEATHER, WIND, WORLD, type WeatherProfile } from '../config';
import { Lightning, type LightningEvents } from '../fx/lightning';
import { Rain } from '../fx/rain';
import { WindStreaks } from '../fx/windStreaks';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { moveTowards } from '../utils/math';
import { seaStateUniforms } from '../ocean/seaState';
import type { DayCycle } from './dayCycle';
import { HeavySeas } from './heavySeas';
import { SkyLighting } from './skyLighting';
import { worldEdge } from './worldEdge';
import type { Wind } from './wind';

const { lerp, smoothstep } = THREE.MathUtils;

export type WeatherKind = 'clear' | 'fog' | 'windy' | 'rain' | 'storm' | 'tempest';

/** Ce que la météo fait subir aux bateaux, traité par le jeu (dégâts, effets, caméra). */
export interface WeatherEvents extends LightningEvents {
  /** Un paquet de mer déferle sur l'avant d'un bateau (grosse tempête). */
  seaHit(ship: Ship, bow: THREE.Vector3, damage: number): void;
}

/** Ce que la météo change aux règles du jeu (1 = beau temps). Lu par les canons, le fort et les IA ennemies. */
export const conditions = {
  /** Multiplie la portée de tir des canons. */
  rangeFactor: 1,
  /** Multiplie la distance à laquelle un ennemi repère une proie. */
  detectionFactor: 1,
  /** Multiplie la vitesse de virage de tous les bateaux (mer démontée = barre plus dure). */
  turnFactor: 1,
  /** Nuit (0 de jour, 1 en pleine nuit) : la Marine patrouille moins. */
  night: 0,
};

/** Le beau temps, décrit par les réglages du ciel et du monde. Sa houle (waveFactor) varie au fil du temps. */
const CLEAR: WeatherProfile = {
  fogNear: WORLD.fogNear,
  fogFar: WORLD.fogFar,
  fogColor: SKY.horizonColor,
  zenithColor: SKY.zenithColor,
  sunlight: 1,
  ambientIntensity: SKY.ambientIntensity,
  sunIntensity: SKY.sunIntensity,
  waveFactor: 1,
  windMin: WIND.clearKnots[0],
  windMax: WIND.clearKnots[1],
  rangeFactor: 1,
  detectionFactor: 1,
  rain: 0,
  lightning: 0,
  windStreaks: 0,
  chop: 0,
  turnFactor: 1,
  seaDamage: 0,
  strikeFactor: 1,
  seaFoam: 0,
};
const PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: CLEAR,
  fog: WEATHER.fog,
  windy: WEATHER.windy,
  rain: WEATHER.rain,
  storm: WEATHER.storm,
  tempest: WEATHER.tempest,
};
const COLORS = Object.fromEntries(
  Object.entries(PROFILES).map(([kind, p]) => [kind, { fog: new THREE.Color(p.fogColor), zenith: new THREE.Color(p.zenithColor) }]),
) as Record<WeatherKind, { fog: THREE.Color; zenith: THREE.Color }>;
const NUMBERS = (Object.keys(CLEAR) as (keyof WeatherProfile)[]).filter((k) => k !== 'fogColor' && k !== 'zenithColor');
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Le temps qu'il fait. Le temps demandé (`target`) s'installe petit à petit depuis l'état actuel : brume, ciel,
 * lumière, vent, vagues, pluie, éclairs, filets de vent, embruns et portée de tir. Par beau temps, la houle
 * change d'elle-même de temps en temps, entre quasi plate et la houle normale.
 */
export class Weather {
  /** Temps demandé (boutons à l'écran). */
  target: WeatherKind = 'clear';
  private readonly rain = new Rain();
  private readonly streaks = new WindStreaks();
  private readonly lightning: Lightning;
  /** Temps actuel, et celui d'où l'on part pendant un changement. */
  private readonly current: WeatherProfile = { ...CLEAR };
  private readonly from: WeatherProfile = { ...CLEAR };
  private readonly fogBase = new THREE.Color(SKY.horizonColor);
  private readonly zenith = new THREE.Color(SKY.zenithColor);
  private readonly fromFog = new THREE.Color(SKY.horizonColor);
  private readonly fromZenith = new THREE.Color(SKY.zenithColor);
  private shownTarget: WeatherKind = 'clear';
  /**
   * Temps montré : le temps actuel, glissé vers la grosse tempête près du bord du monde (worldEdge.storm autour du
   * bateau piloté). C'est lui qui s'applique à la scène et aux règles ; `current` reste le temps du monde (boss, transitions).
   */
  private readonly shown: WeatherProfile = { ...CLEAR };
  private readonly shownFog = new THREE.Color(SKY.horizonColor);
  private readonly shownZenith = new THREE.Color(SKY.zenithColor);
  /** Avancement du changement de temps (0..1). */
  private progress = 1;
  /** Houle du beau temps (0 = quasi plate, 1 = normale), sa cible et le délai avant d'en tirer une nouvelle. */
  private swell = Math.random();
  private swellTarget = this.swell;
  private swellTimer = rand(WEATHER.swell.interval[0], WEATHER.swell.interval[1]);
  private readonly baseSteepness: number[];
  private appliedWaveFactor = NaN;
  private appliedChop = NaN;
  private readonly heavySeas: HeavySeas;
  /** Horloge des rafales (s). */
  private gustTime = Math.random() * 100;
  /** Composition avec l'heure (jour, crépuscule, nuit). */
  private readonly lighting: SkyLighting;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly waves: Waves,
    ambient: THREE.HemisphereLight,
    sun: THREE.DirectionalLight,
    private readonly day: DayCycle,
    events: WeatherEvents,
  ) {
    this.lighting = new SkyLighting(day, sun, ambient);
    this.baseSteepness = waves.list.map((w) => w.steepness);
    this.lightning = new Lightning(events);
    this.heavySeas = new HeavySeas((ship, bow, damage) => events.seaHit(ship, bow, damage));
    scene.add(this.rain.mesh, this.streaks.mesh, this.lightning.mesh);
  }

  /** Part de la pluie et des filets de vent dessinés (réglage graphique, 0..1). */
  setEffectDensity(density: number) {
    this.rain.setDensity(density);
    this.streaks.setDensity(density);
  }

  /**
   * Force du temps `kind` s'il est en cours (0..1) : 1 quand il est pleinement installé (pour la grosse tempête, quand
   * la mer est démontée).
   */
  levelOf(kind: WeatherKind): number {
    // Tant que le changement n'a pas commencé (temps tout juste demandé), il n'est pas encore là.
    if (this.target !== kind || this.shownTarget !== kind) return 0;
    return kind === 'tempest' ? this.current.seaFoam : this.progress;
  }

  /** Obscurité qui allume les lumières (0 en plein jour, 1 la nuit ou sous l'orage). */
  get darkness(): number {
    return this.lighting.darkness;
  }

  /** `focus` : le bateau piloté (les éclairs tombent autour de lui). */
  update(dt: number, camera: THREE.Camera, wind: Wind, ships: readonly Ship[], focus: Ship) {
    this.day.update();
    this.updateSwell(dt);
    if (this.target !== this.shownTarget) {
      // Nouveau temps : on part de l'état actuel, même au milieu d'un autre changement.
      this.shownTarget = this.target;
      Object.assign(this.from, this.current);
      this.fromFog.copy(this.fogBase);
      this.fromZenith.copy(this.zenith);
      this.progress = 0;
    }
    this.progress = Math.min(1, this.progress + dt / WEATHER.transitionTime);
    this.blend(smoothstep(this.progress, 0, 1));
    this.compose(worldEdge.storm(focus.position.x, focus.position.z));
    this.apply(wind);

    const p = this.shown;
    const light = this.lighting.effectsLight;
    this.rain.update(dt, camera, p.rain, wind.direction, wind.strength, light);
    this.gustTime += dt;
    this.streaks.update(dt, camera, Math.max(p.windStreaks, this.gustStreaks(wind)), wind.direction, light);
    this.lightning.update(dt, p.lightning, p.strikeFactor, camera, this.waves, ships, focus);
    this.heavySeas.update(dt, p.seaDamage, ships, this.waves);
    this.applyFlash(this.lightning.flash);
  }

  /**
   * Filets de vent des bourrasques, par vent fort hors grand vent : seulement pendant les rafales (de temps en temps),
   * plus nombreux quand le vent forcit, jamais sous la pluie.
   */
  private gustStreaks(wind: Wind): number {
    const g = WEATHER.gusts;
    const strong = smoothstep(wind.knots, g.knots[0], g.knots[1]);
    if (strong <= 0) return 0;
    const t = (this.gustTime / g.period) * Math.PI * 2;
    const gust = smoothstep(Math.sin(t) * Math.sin(t * 0.37 + 1.3), 0.2, 0.7);
    return g.streaks * strong * gust * (1 - this.shown.rain);
  }

  /** De temps en temps, une nouvelle houle de beau temps, rejointe en douceur. */
  private updateSwell(dt: number) {
    const s = WEATHER.swell;
    this.swellTimer -= dt;
    if (this.swellTimer <= 0) {
      this.swellTimer = rand(s.interval[0], s.interval[1]);
      this.swellTarget = Math.random();
    }
    this.swell = moveTowards(this.swell, this.swellTarget, dt / s.changeTime);
    CLEAR.waveFactor = lerp(s.min, 1, smoothstep(this.swell, 0, 1));
  }

  /**
   * Le temps montré : le temps actuel glissé de `edge` (0..1) vers la grosse tempête du bord du monde. La foudre
   * ordinaire n'y vise pas les navires (c'est EdgeStorm qui frappe, sans message) et les paquets de mer restent ceux du
   * temps actuel.
   */
  private compose(edge: number) {
    const storm = PROFILES.tempest;
    for (const key of NUMBERS) this.shown[key] = lerp(this.current[key], storm[key], edge);
    this.shown.strikeFactor = lerp(this.current.strikeFactor, 0, edge);
    this.shown.seaDamage = this.current.seaDamage;
    this.shownFog.lerpColors(this.fogBase, COLORS.tempest.fog, edge);
    this.shownZenith.lerpColors(this.zenith, COLORS.tempest.zenith, edge);
  }

  /** La foudre de la tempête du bord tombe sur le mât de `ship` (éclair, lueur, secousse) ; renvoie le point frappé. */
  strikeShip(ship: Ship, camera: THREE.Camera, focus: Ship): THREE.Vector3 {
    return this.lightning.strikeShip(ship, camera, focus);
  }

  private blend(t: number) {
    const to = PROFILES[this.target];
    for (const key of NUMBERS) this.current[key] = lerp(this.from[key], to[key], t);
    this.fogBase.lerpColors(this.fromFog, COLORS[this.target].fog, t);
    this.zenith.lerpColors(this.fromZenith, COLORS[this.target].zenith, t);
  }

  /** Applique le temps montré à la scène et aux règles. */
  private apply(wind: Wind) {
    const p = this.shown;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = p.fogNear;
    fog.far = p.fogFar;
    // Ciel, soleil, lune et lumières : la météo composée avec l'heure.
    this.lighting.apply(p, this.shownZenith);
    wind.minKnots = p.windMin;
    wind.maxKnots = p.windMax;
    // Les vagues ne sont retouchées que si elles changent (le panneau ?debug peut les régler entre-temps).
    // Houle : raideur de base × waveFactor ; clapot (les dernières vagues de la liste) : raideur max × chop.
    if (p.waveFactor !== this.appliedWaveFactor || p.chop !== this.appliedChop) {
      this.appliedWaveFactor = p.waveFactor;
      this.appliedChop = p.chop;
      const swells = OCEAN.waves.length;
      this.waves.list.forEach((w, k) => {
        w.steepness = k < swells ? this.baseSteepness[k] * p.waveFactor : OCEAN.chopWaves[k - swells].steepness * p.chop;
      });
    }
    conditions.rangeFactor = p.rangeFactor;
    conditions.detectionFactor = p.detectionFactor;
    conditions.turnFactor = p.turnFactor;
    conditions.night = this.day.night;
    seaStateUniforms.uSeaFoam.value = p.seaFoam;
    seaStateUniforms.uWindDir.value.set(Math.sin(wind.direction), Math.cos(wind.direction));
  }

  /** Lueur d'un éclair : ciel, brume (donc tout le lointain) et lumière ambiante s'illuminent un instant. */
  private applyFlash(flash: number) {
    // La brume se fond dans l'horizon du ciel : même couleur (composée avec l'heure).
    this.lighting.applyFog(this.shown, this.shownFog, flash, this.scene.fog as THREE.Fog, this.scene.background as THREE.Color);
  }
}
