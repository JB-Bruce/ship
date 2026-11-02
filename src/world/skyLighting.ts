import * as THREE from 'three';
import { DAY_NIGHT, LIGHTNING, SKY, type WeatherProfile } from '../config';
import type { DayCycle } from './dayCycle';
import { skyUniforms, sunDirection } from './sky';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DAY_SUN = new THREE.Color(SKY.sunColor);
const DUSK_SUN = new THREE.Color(DAY_NIGHT.duskSun);
const MOON = new THREE.Color(DAY_NIGHT.moonColor);
const DUSK_ZENITH = new THREE.Color(DAY_NIGHT.duskZenith);
const DUSK_HORIZON = new THREE.Color(DAY_NIGHT.duskHorizon);
const NIGHT_ZENITH = new THREE.Color(DAY_NIGHT.nightZenith);
const NIGHT_HORIZON = new THREE.Color(DAY_NIGHT.nightHorizon);
const DAY_AMBIENT_SKY = new THREE.Color(SKY.ambientSky);
const DAY_AMBIENT_GROUND = new THREE.Color(SKY.ambientGround);
const NIGHT_AMBIENT_SKY = new THREE.Color(DAY_NIGHT.nightAmbientSky);
const NIGHT_AMBIENT_GROUND = new THREE.Color(DAY_NIGHT.nightAmbientGround);
/** Teinte vers laquelle la brume s'éclaircit pendant la lueur d'un éclair. */
const FLASH_COLOR = new THREE.Color(0xc9d3e6);
const night = new THREE.Color();

/**
 * Compose la météo (ses couleurs et lumières de jour) avec l'heure (DayCycle) au moment d'écrire dans la scène : la
 * météo garde ses propres valeurs (on n'y touche pas, sinon un changement de temps assombrirait deux fois). Appelé par
 * Weather à chaque image. Le soleil et la lune se partagent l'unique lumière directionnelle (pas de lumière en plus).
 */
export class SkyLighting {
  constructor(
    private readonly day: DayCycle,
    private readonly sun: THREE.DirectionalLight,
    private readonly ambient: THREE.HemisphereLight,
  ) {}

  /** Ciel, soleil, lune et lumières, à partir du temps `p` et du zénith de la météo. */
  apply(p: WeatherProfile, weatherZenith: THREE.Color) {
    const { day } = this;
    const clear = p.sunlight;
    const u = skyUniforms;
    sunDirection.copy(day.sun);
    u.uMoonDir.value.copy(day.moon);
    u.uNight.value = day.night;
    u.uTwilight.value = day.twilight;
    u.uClearSky.value = clear;
    // Zénith : doré au crépuscule, bleu nuit la nuit (plus sombre sous les nuages).
    night.copy(NIGHT_ZENITH).multiplyScalar(lerp(DAY_NIGHT.nightCloudy, 1, clear));
    u.uSkyZenith.value.copy(weatherZenith).lerp(DUSK_ZENITH, day.twilight * DAY_NIGHT.duskZenithMix * clear).lerp(night, day.night);
    // Soleil : seulement s'il est levé (halo, reflets, contre-jour, phare éteint) ; doré à l'aube et au crépuscule.
    u.uSunlight.value = clear * day.daylight;
    u.uSunColor.value.copy(DAY_SUN).lerp(DUSK_SUN, day.twilight);
    // L'unique lumière directionnelle : le soleil de jour, la lune la nuit (on bascule quand l'une et l'autre sont faibles).
    const moonlight = DAY_NIGHT.moonIntensity * day.night * day.moonUp * lerp(DAY_NIGHT.moonThroughClouds, 1, clear);
    const sunlight = p.sunIntensity * day.daylight;
    const useMoon = moonlight > sunlight;
    this.sun.position.copy(useMoon ? day.moon : day.sun).multiplyScalar(100);
    this.sun.color.copy(useMoon ? MOON : u.uSunColor.value);
    this.sun.intensity = useMoon ? moonlight : sunlight;
    // Lumière ambiante : bleutée et plus faible la nuit, jamais nulle (on voit toujours les navires).
    this.ambient.color.copy(DAY_AMBIENT_SKY).lerp(NIGHT_AMBIENT_SKY, day.night);
    this.ambient.groundColor.copy(DAY_AMBIENT_GROUND).lerp(NIGHT_AMBIENT_GROUND, day.night);
    // Eau et écume (sans lumière de scène) : plus sombres la nuit.
    u.uWaterLight.value = lerp(1, DAY_NIGHT.nightWater, day.night);
    u.uFoamLight.value = lerp(1, DAY_NIGHT.nightFoam, day.night);
  }

  /** Brume = horizon (dorée au crépuscule, bleu nuit la nuit), puis la lueur d'un éclair ; et l'intensité ambiante. */
  applyFog(p: WeatherProfile, fogBase: THREE.Color, flash: number, fog: THREE.Fog, background: THREE.Color) {
    const { day } = this;
    const clear = p.sunlight;
    night.copy(NIGHT_HORIZON).multiplyScalar(lerp(DAY_NIGHT.nightCloudy, 1, clear));
    fog.color.copy(fogBase).lerp(DUSK_HORIZON, day.twilight * DAY_NIGHT.duskHorizonMix * clear).lerp(night, day.night);
    fog.color.lerp(FLASH_COLOR, flash * 0.6 * lerp(1, DAY_NIGHT.nightFlash, day.night));
    background.copy(fog.color);
    skyUniforms.uSkyHorizon.value.copy(fog.color);
    skyUniforms.uFlash.value = flash;
    this.ambient.intensity = p.ambientIntensity * lerp(1, DAY_NIGHT.nightAmbient, day.night) + flash * LIGHTNING.ambientBoost;
  }

  /**
   * Obscurité qui allume les lumières (fanaux, fenêtres, halos) : 0 en plein jour, 1 la nuit, mais aussi dans le
   * brouillard ou sous l'orage (lue sur la lumière du soleil, écrite par apply).
   */
  get darkness(): number {
    const [from, full] = DAY_NIGHT.lightsOn;
    return THREE.MathUtils.clamp((from - skyUniforms.uSunlight.value) / (from - full), 0, 1);
  }

  /** Part de leur couleur de jour que gardent la pluie et les filets de vent (sans lumière de scène). */
  get effectsLight(): number {
    return lerp(1, DAY_NIGHT.nightEffects, this.day.night);
  }
}
