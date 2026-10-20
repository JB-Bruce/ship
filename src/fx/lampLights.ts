import * as THREE from 'three';
import { DAY_NIGHT } from '../config';
import type { LanternSpot } from '../ship/parts/nightGlow';
import type { Ship } from '../ship/ship';

const L = DAY_NIGHT.lamps;
const FIRE_COLOR = new THREE.Color(L.fireColor);
const WHITE = new THREE.Color(1, 1, 1);

/** Lampes vues par le shader de l'eau : position et éclat (w), couleur ; seules les `uLampCount` premières comptent. */
export const lampUniforms = {
  uLamps: { value: Array.from({ length: L.water }, () => new THREE.Vector4()) },
  uLampColors: { value: Array.from({ length: L.water }, () => new THREE.Color()) },
  uLampCount: { value: 0 },
};

/**
 * GLSL de l'eau : chaque lampe proche y pose une flaque de lumière chaude (l'eau éclairée autour d'elle) et y trace son
 * chemin de reflets (son image, étirée par les vagues vers la caméra). Le jour, aucune lampe : la boucle ne tourne pas.
 */
export const LAMP_GLSL = /* glsl */ `
uniform vec4 uLamps[${L.water}];
uniform vec3 uLampColors[${L.water}];
uniform int uLampCount;
vec3 lampsOnWater(vec3 p, vec3 N, vec3 R) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${L.water}; i++) {
    if (i >= uLampCount) break;
    vec3 toLamp = uLamps[i].xyz - p;
    float d2 = dot(toLamp, toLamp);
    vec3 dir = toLamp * inversesqrt(d2);
    float pool = max(dot(N, dir), 0.0) * ${L.waterPool.toFixed(3)} / (1.0 + d2 / ${(L.poolRadius * L.poolRadius).toFixed(1)});
    float s = max(dot(R, dir), 0.0);
    float glints = (pow(s, 500.0) * ${L.glint.toFixed(2)} + pow(s, 60.0) * ${L.glintHalo.toFixed(3)}) / (1.0 + d2 / ${(L.glintRadius * L.glintRadius).toFixed(1)});
    sum += uLampColors[i] * uLamps[i].w * (pool + glints);
  }
  return sum;
}
`;

/** Une lampe retenue : où, sa couleur, sa distance à la caméra (et celle qui sert au tri), son éclat, sa graine. */
interface Lamp {
  at: THREE.Vector3;
  color: THREE.Color;
  distance: number;
  key: number;
  power: number;
  flicker: number;
  seed: number;
}

const world = new THREE.Vector3();

/**
 * La lumière des fanaux, la nuit et par temps sombre : les lanternes (navires, ports) et les incendies les plus
 * proches de la caméra éclairent vraiment ce qui les entoure : un petit lot de lumières ponctuelles de la scène
 * (ponts, coques, voiles, matelots ; leur nombre est un réglage graphique) et l'eau (lampUniforms). Une lampe qui entre
 * ou sort du lot s'allume ou s'éteint en douceur. Le jour, le lot est caché : rien ne coûte.
 */
export class LampLights {
  readonly group = new THREE.Group();
  private lights: THREE.PointLight[] = [];
  /** Les lampes les plus proches, triées ; une de plus que l'eau n'en prend (la suivante règle l'effacement). */
  private readonly near: Lamp[];
  private found = 0;
  private time = 0;

  constructor(private readonly ports: readonly LanternSpot[]) {
    this.near = Array.from({ length: L.water + 1 }, () => ({ at: new THREE.Vector3(), color: new THREE.Color(), distance: 0, key: 0, power: 0, flicker: 0, seed: 0 }));
    this.group.visible = false;
    this.setCount(0);
  }

  /** Nombre de lumières ponctuelles (réglage graphique ; 0 : seule l'eau reçoit la lueur des lampes). */
  setCount(count: number) {
    if (count === this.lights.length) return;
    for (const light of this.lights) {
      this.group.remove(light);
      light.dispose();
    }
    this.lights = Array.from({ length: Math.min(count, L.water) }, () => {
      const light = new THREE.PointLight(0xffffff, 0, L.distance, L.decay);
      this.group.add(light);
      return light;
    });
  }

  /** `dark` : obscurité (0 en plein jour) ; `fogFar` : au-delà, rien n'est visible. */
  update(dt: number, camera: THREE.Camera, ships: readonly Ship[], dark: number, fogFar: number) {
    this.time += dt;
    const on = dark > 0.01;
    this.group.visible = on;
    lampUniforms.uLampCount.value = 0;
    if (!on) return;
    const range = Math.min(L.range, fogFar);
    this.found = 0;
    for (const spot of this.ports) this.consider(spot.at, spot.color, camera, range, 1, L.flicker, spot.at.x + spot.at.z);
    for (const ship of ships) {
      const { root, lanterns, fireSpots } = ship.model;
      const burning = ship.crits.fire > 0 && fireSpots.length > 0;
      if (ship.sunk || !root.visible || (lanterns.length === 0 && !burning)) continue;
      if (ship.position.distanceTo(camera.position) > range * L.firePriority + ship.stats.length) continue;
      root.updateMatrix();
      for (const spot of lanterns) this.consider(world.copy(spot.at).applyMatrix4(root.matrix), spot.color, camera, range, 1, L.flicker, spot.at.x * 3 + spot.at.y + spot.at.z * 7);
      // Un incendie à bord : une grande lueur orange qui vacille, vue de plus loin.
      if (burning) this.consider(world.copy(fireSpots[ship.crits.fireSpot % fireSpots.length]).applyMatrix4(root.matrix), FIRE_COLOR, camera, range, L.fire, L.fireFlicker, 0);
    }
    const t = this.time;
    const waterCut = this.found > L.water ? this.near[L.water].key : range;
    const lightCut = this.found > this.lights.length ? this.near[this.lights.length].key : range;
    const count = Math.min(this.found, L.water);
    for (let i = 0; i < count; i++) {
      const lamp = this.near[i];
      const flicker = 1 + lamp.flicker * (Math.sin(t * 8.3 + lamp.seed * 13) * 0.6 + Math.sin(t * 13.7 + lamp.seed * 7) * 0.4);
      // S'efface vers le bord de la sélection (la suivante va la remplacer) et vers le bout de la portée.
      const far = 1 - THREE.MathUtils.smoothstep(lamp.distance, range * (1 - L.fade), range);
      const strength = dark * lamp.power * flicker * far;
      lampUniforms.uLamps.value[i].set(lamp.at.x, lamp.at.y, lamp.at.z, strength * L.waterIntensity * fadeIn(lamp.key, waterCut));
      lampUniforms.uLampColors.value[i].copy(lamp.color);
      const light = this.lights[i];
      if (!light) continue;
      light.position.copy(lamp.at);
      light.color.copy(lamp.color);
      light.intensity = strength * L.intensity * fadeIn(lamp.key, lightCut);
    }
    for (let i = count; i < this.lights.length; i++) this.lights[i].intensity = 0;
    lampUniforms.uLampCount.value = count;
  }

  /** Garde la lampe si elle est parmi les plus proches de la caméra (un incendie compte comme plus proche). */
  private consider(at: THREE.Vector3, color: THREE.Color, camera: THREE.Camera, range: number, power: number, flicker: number, seed: number) {
    const distance = at.distanceTo(camera.position);
    const key = power > 1 ? distance / L.firePriority : distance;
    const near = this.near;
    const max = near.length;
    if (key > range || (this.found === max && key >= near[max - 1].key)) return;
    // La plus loin des retenues (ou une place libre) est reprise et glissée à son rang.
    let i = Math.min(this.found, max - 1);
    const lamp = near[i];
    while (i > 0 && near[i - 1].key > key) {
      near[i] = near[i - 1];
      i--;
    }
    near[i] = lamp;
    lamp.at.copy(at);
    lamp.color.copy(color).lerp(WHITE, L.whiten);
    lamp.distance = distance;
    lamp.key = key;
    lamp.power = power;
    lamp.flicker = flicker;
    lamp.seed = seed;
    if (this.found < max) this.found++;
  }
}

/** Part d'éclat d'une lampe selon sa place : pleine loin du bord de la sélection, nulle au bord (`cut`). */
function fadeIn(key: number, cut: number): number {
  return THREE.MathUtils.clamp((cut - key) / (cut * L.fade), 0, 1);
}
