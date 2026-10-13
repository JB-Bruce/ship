import * as THREE from 'three';
import { ISLAND_LOBES, ISLANDS, PORT, type IslandId, type IslandShapeDef } from '../config';

const TWO_PI = Math.PI * 2;
const { clamp } = THREE.MathUtils;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Écart pour les dérivées numériques le long de la côte (rad). */
const SLOPE_STEP = 0.01;
/** Distance au-delà de laquelle la correction de pente s'efface (m). */
const SLOPE_FADE = 30;
/** Au-delà de cette distance de son rayon extérieur, une île n'est plus calculée en détail (m). */
const FAR = 200;
/** Décalages d'angle (rad) sur lesquels on moyenne la côte pour adoucir le relief intérieur. */
const RELIEF_SMOOTHING = [-0.5, -0.25, 0, 0.25, 0.5];

/**
 * Une île, définie par une seule formule (voir IslandShapeDef dans config.ts).
 * Le shader de l'eau reprend exactement les mêmes calculs (ISLAND_GLSL) : les modifier aux deux endroits.
 */
export class Island {
  readonly cx: number;
  readonly cz: number;
  /** Point du rivage au fond de la crique, où se trouve le quai. */
  readonly port: { x: number; z: number };
  /** Où la flotte apparaît : dans la crique, proue vers le large. */
  readonly portSpawn: { x: number; z: number; heading: number };
  /** Rayon au-delà duquel on est sûrement en mer (pour les calculs rapides). */
  readonly outerRadius: number;
  /** Centre du replat de la ville derrière le port (IslandShapeDef.town), ou null. */
  readonly town: { x: number; z: number } | null;

  constructor(
    readonly id: IslandId,
    readonly def: IslandShapeDef,
  ) {
    [this.cx, this.cz] = def.center;
    this.outerRadius = def.radius + def.lobes.reduce((s, l) => s + l[1], 0);
    this.port = this.pointAt(def.bay.angle, 0);
    const spawn = this.pointAt(def.bay.angle, -PORT.spawnOffset);
    this.portSpawn = { ...spawn, heading: def.bay.angle };
    this.town = def.town ? this.pointAt(def.bay.angle, def.town.inland) : null;
  }

  /** Rayon de la côte dans la direction `theta` (cap depuis le centre). */
  coastRadius(theta: number): number {
    const { radius, lobes, bay } = this.def;
    let r = radius;
    for (const [k, amp, phase] of lobes) r += amp * Math.sin(k * theta + phase);
    const d = theta - bay.angle;
    const wrapped = d - TWO_PI * Math.floor((d + Math.PI) / TWO_PI);
    const b = wrapped / bay.width;
    return r - bay.depth * Math.exp(-b * b);
  }

  /**
   * Distance signée au rivage (m) : positive en mer, négative à terre.
   * Près de la côte, on corrige par la pente de la côte pour mesurer perpendiculairement (utile dans la crique).
   */
  sdf(x: number, z: number): number {
    const dx = x - this.cx;
    const dz = z - this.cz;
    const r = Math.hypot(dx, dz);
    if (r > this.outerRadius + FAR) return r - this.outerRadius;
    const theta = Math.atan2(dx, dz);
    const rc = this.coastRadius(theta);
    const slope = (this.coastRadius(theta + SLOPE_STEP) - this.coastRadius(theta - SLOPE_STEP)) / (2 * SLOPE_STEP);
    const radial = r - rc;
    const w = Math.exp(-Math.abs(radial) / SLOPE_FADE);
    return radial / Math.sqrt(1 + w * (slope / rc) ** 2);
  }

  /** Atténuation des vagues : 0 au rivage, 1 au large (même formule que le shader). */
  calmAt(x: number, z: number): number {
    if (Math.hypot(x - this.cx, z - this.cz) > this.outerRadius + this.def.calmDistance + 10) return 1;
    return smoothstep(0, this.def.calmDistance, this.sdf(x, z));
  }

  /** Altitude du terrain (m) : négative sous l'eau (fond marin), plage au rivage, collines ou falaises à l'intérieur. */
  heightAt(x: number, z: number): number {
    const s = this.sdf(x, z);
    if (s > 0) return -Math.min(s, 80) * 0.15;
    // Distance à l'intérieur des terres. Près du rivage, elle est exacte (la plage suit la côte) ;
    // plus loin, on moyenne la côte sur plusieurs angles, sinon le « V » de la crique se prolongerait
    // en ravin étroit et rocheux derrière le village.
    const dx = x - this.cx;
    const dz = z - this.cz;
    const r = Math.hypot(dx, dz);
    const theta = Math.atan2(dx, dz);
    const exact = this.coastRadius(theta) - r;
    let average = 0;
    for (const offset of RELIEF_SMOOTHING) average += this.coastRadius(theta + offset);
    average = average / RELIEF_SMOOTHING.length - r;
    const inland = exact + (average - exact) * smoothstep(10, 60, exact);
    const noise = 0.5 + 0.25 * Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.4) + 0.25 * Math.sin(x * 0.013 - z * 0.017);
    // Le village s'étale sur un replat autour du port (et la ville sur le sien) ; ailleurs le terrain monte vite.
    let nearPort = smoothstep(25, 110, Math.hypot(x - this.port.x, z - this.port.z));
    const town = this.def.town;
    if (town && this.town) nearPort = Math.min(nearPort, smoothstep(town.radius[0], town.radius[1], Math.hypot(x - this.town.x, z - this.town.z)));
    const { peak, cliff, relief } = this.def;
    if (relief === 'cliffs') {
      // Plage étroite au pied d'une falaise, puis des hauteurs rocheuses.
      const beach = Math.min(inland / 3, 1) * 1.2;
      const wall = cliff * smoothstep(2, 12, inland) * (0.8 + 0.4 * noise);
      return beach + (wall + peak * smoothstep(25, 110, inland) * (0.6 + 0.4 * noise)) * nearPort;
    }
    const beach = Math.min(inland / 10, 1) * 1.4;
    return beach + peak * smoothstep(8, 120, inland) * (0.65 + 0.35 * noise) * nearPort;
  }

  /** Point dans la direction `theta`, à `inland` mètres à l'intérieur des terres depuis la côte (négatif = au large). */
  pointAt(theta: number, inland: number): { x: number; z: number } {
    const r = this.coastRadius(theta) - inland;
    return { x: this.cx + Math.sin(theta) * r, z: this.cz + Math.cos(theta) * r };
  }
}

export const tortuga = new Island('tortuga', ISLANDS.tortuga);
export const sabre = new Island('sabre', ISLANDS.sabre);
export const royale = new Island('royale', ISLANDS.royale);
/** Toutes les îles, dans l'ordre des tableaux du shader. */
export const ISLAND_LIST: readonly Island[] = [tortuga, sabre, royale];
export const islandById = (id: IslandId): Island => ISLAND_LIST.find((island) => island.id === id)!;

/**
 * Les terres de tout l'archipel : chaque question est posée à l'île la plus proche (distance au rivage la plus
 * petite). C'est ce qu'utilisent la navigation, les collisions, les boulets et les vagues.
 */
export const land = {
  /** L'île dont le rivage est le plus proche de (x, z). */
  nearest(x: number, z: number): Island {
    let best = ISLAND_LIST[0];
    let bestDistance = Infinity;
    for (const island of ISLAND_LIST) {
      const d = island.sdf(x, z);
      if (d < bestDistance) {
        best = island;
        bestDistance = d;
      }
    }
    return best;
  },

  /** Distance signée au rivage le plus proche (m) : positive en mer. */
  sdf(x: number, z: number): number {
    let best = Infinity;
    for (const island of ISLAND_LIST) best = Math.min(best, island.sdf(x, z));
    return best;
  },

  /** Direction (normalisée) vers le large, là où la distance au rivage augmente. */
  gradient(x: number, z: number, out: { x: number; z: number }) {
    const e = 1;
    const gx = this.sdf(x + e, z) - this.sdf(x - e, z);
    const gz = this.sdf(x, z + e) - this.sdf(x, z - e);
    const len = Math.hypot(gx, gz) || 1;
    out.x = gx / len;
    out.z = gz / len;
    return out;
  },

  /** Atténuation des vagues : la plus forte des îles (même formule que le shader). */
  calmAt(x: number, z: number): number {
    let calm = 1;
    for (const island of ISLAND_LIST) calm = Math.min(calm, island.calmAt(x, z));
    return calm;
  },

  /** Altitude du terrain : celle de l'île la plus proche (fond marin au large). */
  heightAt(x: number, z: number): number {
    return this.nearest(x, z).heightAt(x, z);
  },

  /** Repousse le point (x, z) vers le large jusqu'à `margin` mètres du rivage. */
  keepOffshore(x: number, z: number, margin: number): { x: number; z: number } {
    const g = { x: 0, z: 0 };
    for (let i = 0; i < 4; i++) {
      const s = this.sdf(x, z);
      if (s >= margin) break;
      this.gradient(x, z, g);
      x += g.x * (margin - s);
      z += g.z * (margin - s);
    }
    return { x, z };
  },
};

const COUNT = ISLAND_LIST.length;

/** Uniforms des îles pour le shader de l'eau (un élément par île, dans l'ordre d'ISLAND_LIST). */
export const islandUniforms = {
  uIslandCenter: { value: ISLAND_LIST.map((i) => new THREE.Vector2(i.cx, i.cz)) },
  /** (rayon moyen, distance d'atténuation des vagues, largeur du lagon, largeur du ressac) */
  uIslandShape: { value: ISLAND_LIST.map((i) => new THREE.Vector4(i.def.radius, i.def.calmDistance, i.def.lagoonWidth, i.def.surfWidth)) },
  /** (rayon extérieur, …) : au-delà, l'île n'est pas calculée en détail. */
  uIslandOuter: { value: ISLAND_LIST.map((i) => i.outerRadius) },
  uIslandLobes: { value: ISLAND_LIST.flatMap((i) => i.def.lobes.map(([k, amp, phase]) => new THREE.Vector3(k, amp, phase))) },
  uIslandBay: { value: ISLAND_LIST.map((i) => new THREE.Vector3(i.def.bay.angle, i.def.bay.width, i.def.bay.depth)) },
};

/**
 * Même calcul que Island.coastRadius / sdf / calmAt, en GLSL, pour toutes les îles. `islandShore` donne
 * (distance au rivage le plus proche, largeur de son lagon, largeur de son ressac). Nécessite `#include <common>` (PI).
 */
export const ISLAND_GLSL = /* glsl */ `
#define ISLAND_COUNT ${COUNT}
#define ISLAND_LOBES ${ISLAND_LOBES}
uniform vec2 uIslandCenter[ISLAND_COUNT];
uniform vec4 uIslandShape[ISLAND_COUNT];
uniform float uIslandOuter[ISLAND_COUNT];
uniform vec3 uIslandLobes[ISLAND_COUNT * ISLAND_LOBES];
uniform vec3 uIslandBay[ISLAND_COUNT];

float islandCoast(int i, float t) {
  float r = uIslandShape[i].x;
  for (int k = 0; k < ISLAND_LOBES; k++) {
    vec3 lobe = uIslandLobes[i * ISLAND_LOBES + k];
    r += lobe.y * sin(lobe.x * t + lobe.z);
  }
  float d = mod(t - uIslandBay[i].x + PI, 2.0 * PI) - PI;
  float b = d / uIslandBay[i].y;
  return r - uIslandBay[i].z * exp(-b * b);
}

float islandSdfOf(int i, vec2 p) {
  vec2 d = p - uIslandCenter[i];
  float len = length(d);
  if (len > uIslandOuter[i] + ${FAR.toFixed(1)}) return len - uIslandOuter[i];
  float t = atan(d.x, d.y);
  float rc = islandCoast(i, t);
  float slope = (islandCoast(i, t + ${SLOPE_STEP.toFixed(3)}) - islandCoast(i, t - ${SLOPE_STEP.toFixed(3)})) / ${(2 * SLOPE_STEP).toFixed(3)};
  float radial = len - rc;
  float w = exp(-abs(radial) / ${SLOPE_FADE.toFixed(1)});
  float k = slope / rc;
  return radial / sqrt(1.0 + w * k * k);
}

/** Atténuation des vagues : 0 au rivage, 1 au large (la plus forte des îles). */
float islandCalm(vec2 p) {
  float calm = 1.0;
  for (int i = 0; i < ISLAND_COUNT; i++) {
    if (length(p - uIslandCenter[i]) > uIslandOuter[i] + uIslandShape[i].y + 10.0) continue;
    calm = min(calm, smoothstep(0.0, uIslandShape[i].y, islandSdfOf(i, p)));
  }
  return calm;
}

/** (distance au rivage le plus proche, largeur de son lagon, largeur de son ressac). */
vec3 islandShore(vec2 p) {
  vec3 best = vec3(1e6, 1.0, 1.0);
  for (int i = 0; i < ISLAND_COUNT; i++) {
    // Loin de l'île, une borne inférieure suffit (seule une distance sous la largeur du lagon ou du ressac compte) :
    // pas de calcul de la côte pour la plupart des pixels d'eau.
    float bound = length(p - uIslandCenter[i]) - uIslandOuter[i];
    float s = bound > max(uIslandShape[i].z, uIslandShape[i].w) ? bound : islandSdfOf(i, p);
    if (s < best.x) best = vec3(s, uIslandShape[i].z, uIslandShape[i].w);
  }
  return best;
}
`;
