import * as THREE from 'three';
import { ISLAND_LOBES, ISLANDS, PORT, type IslandId, type IslandShapeDef } from '../config';

const TWO_PI = Math.PI * 2;
const { clamp } = THREE.MathUtils;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/**
 * Réglages du calcul de la distance au rivage, partagés avec le shader de l'eau (`islandShader.ts`) : écart pour les
 * dérivées le long de la côte (rad), distance où s'efface la correction de pente (m), et distance au-delà de son
 * rayon extérieur où une île n'est plus calculée en détail (m).
 */
export const SDF = { slopeStep: 0.01, slopeFade: 30, far: 200 };
const { slopeStep: SLOPE_STEP, slopeFade: SLOPE_FADE, far: FAR } = SDF;
/** Décalages d'angle (rad) sur lesquels on moyenne la côte pour adoucir le relief intérieur. */
const RELIEF_SMOOTHING = [-0.5, -0.25, 0, 0.25, 0.5];
const NO_LOBE = [0, 0, 0] as const;

/**
 * Un point dans le repère de la forme d'une île (cercle avant étirement) : coordonnées, distance au centre, angle
 * (cap) et `scale` = étirement local (m de forme par m de monde, le long du rayon). Rempli par `Island.toShape`.
 */
const shape = { x: 0, z: 0, length: 0, angle: 0, scale: 1 };

/**
 * Une île, définie par une seule formule (voir IslandShapeDef dans config.ts).
 * Le shader de l'eau reprend exactement les mêmes calculs (ISLAND_GLSL de `islandShader.ts`) : les modifier aux deux endroits.
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
  /** Rayon moyen de l'île le long de son grand axe (m) : étendue de son terrain et de son décor. */
  readonly reach: number;
  /** Ondulations de la côte, complétées jusqu'à ISLAND_LOBES. */
  readonly lobes: readonly (readonly [number, number, number])[];
  /** Repère de la forme : cosinus et sinus de l'orientation du grand axe, étirement (√ du rapport longueur / largeur). */
  readonly frame: { cos: number; sin: number; stretch: number };
  /** Cap de la crique dans le repère de la forme. */
  readonly bayAngle: number;
  /** Centre du replat de la ville derrière le port (IslandShapeDef.town), ou null. */
  readonly town: { x: number; z: number } | null;

  constructor(
    readonly id: IslandId,
    readonly def: IslandShapeDef,
  ) {
    [this.cx, this.cz] = def.center;
    const rotation = def.rotation ?? 0;
    this.frame = { cos: Math.cos(rotation), sin: Math.sin(rotation), stretch: Math.sqrt(def.stretch ?? 1) };
    const spread = Math.max(this.frame.stretch, 1 / this.frame.stretch);
    this.lobes = Array.from({ length: ISLAND_LOBES }, (_, i) => def.lobes[i] ?? NO_LOBE);
    this.outerRadius = (def.radius + def.lobes.reduce((s, l) => s + Math.abs(l[1]), 0)) * spread;
    this.reach = def.radius * spread;
    this.toShape(Math.sin(def.bay.angle), Math.cos(def.bay.angle));
    this.bayAngle = shape.angle;
    this.port = this.pointAt(def.bay.angle, 0);
    const spawn = this.pointAt(def.bay.angle, -PORT.spawnOffset);
    this.portSpawn = { ...spawn, heading: def.bay.angle };
    this.town = def.town ? this.pointAt(def.bay.angle, def.town.inland) : null;
  }

  /**
   * Passe le décalage (dx, dz) depuis le centre dans le repère de la forme (résultat dans `shape`) : on le tourne
   * pour que le grand axe soit nord-sud, puis on le resserre le long du grand axe et on l'élargit en travers.
   */
  private toShape(dx: number, dz: number) {
    const { cos, sin, stretch } = this.frame;
    shape.x = (dx * cos - dz * sin) * stretch;
    shape.z = (dx * sin + dz * cos) / stretch;
    shape.length = Math.hypot(shape.x, shape.z);
    shape.angle = Math.atan2(shape.x, shape.z);
    // Étirement local le long du rayon : 1 pour une île ronde.
    shape.scale = Math.hypot(stretch * Math.sin(shape.angle), Math.cos(shape.angle) / stretch);
  }

  /** Rayon de la côte dans le repère de la forme, au cap `angle` de ce repère. */
  private shapeRadius(angle: number): number {
    const { radius, bay } = this.def;
    let r = radius;
    for (const [k, amp, phase] of this.lobes) r += amp * Math.sin(k * angle + phase);
    const d = angle - this.bayAngle;
    const wrapped = d - TWO_PI * Math.floor((d + Math.PI) / TWO_PI);
    const b = wrapped / bay.width;
    return r - bay.depth * Math.exp(-b * b);
  }

  /** Rayon de la côte dans la direction `theta` (cap depuis le centre, dans le monde). */
  coastRadius(theta: number): number {
    this.toShape(Math.sin(theta), Math.cos(theta));
    return this.shapeRadius(shape.angle) / shape.length;
  }

  /**
   * Distance signée au rivage (m) : positive en mer, négative à terre. Elle se mesure dans le repère de la forme,
   * divisée par la pente de cette mesure dans le monde : l'étirement, et près de la côte la pente de la côte (pour
   * mesurer perpendiculairement, utile dans la crique).
   */
  sdf(x: number, z: number): number {
    const dx = x - this.cx;
    const dz = z - this.cz;
    const r = Math.hypot(dx, dz);
    if (r > this.outerRadius + FAR) return r - this.outerRadius;
    this.toShape(dx, dz);
    const { angle, length, scale } = shape;
    const rc = this.shapeRadius(angle);
    const slope = (this.shapeRadius(angle + SLOPE_STEP) - this.shapeRadius(angle - SLOPE_STEP)) / (2 * SLOPE_STEP);
    const radial = length - rc;
    const k = Math.sqrt(Math.exp(-Math.abs(radial / scale) / SLOPE_FADE)) * (slope / rc);
    // Pente de la mesure dans le repère de la forme (le long du rayon, et le long de la côte), ramenée au monde.
    const sx = Math.sin(angle);
    const sz = Math.cos(angle);
    const stretch = this.frame.stretch;
    return radial / Math.hypot(stretch * (sx - k * sz), (sz + k * sx) / stretch);
  }

  /** Atténuation des vagues : 0 au rivage, 1 au large (même formule que le shader) ; aucune sans `calmDistance`. */
  calmAt(x: number, z: number): number {
    if (this.def.calmDistance <= 0) return 1;
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
    this.toShape(x - this.cx, z - this.cz);
    const { angle, length, scale } = shape;
    const exact = (this.shapeRadius(angle) - length) / scale;
    let average = 0;
    for (const offset of RELIEF_SMOOTHING) average += this.shapeRadius(angle + offset);
    average = (average / RELIEF_SMOOTHING.length - length) / scale;
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

  /**
   * Point du rectangle qui couvre l'île le long de ses axes, agrandi de `spread` : `across` et `along` vont de -1 à 1
   * (en travers et le long du grand axe). Sert à semer le décor sans gaspiller les tirages sur une île longue.
   */
  pointInBox(across: number, along: number, spread: number): { x: number; z: number } {
    const { cos, sin, stretch } = this.frame;
    const x = across * (this.def.radius / stretch) * spread;
    const z = along * this.def.radius * stretch * spread;
    return { x: this.cx + x * cos + z * sin, z: this.cz - x * sin + z * cos };
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
export const dauphin = new Island('dauphin', ISLANDS.dauphin);
/** Toutes les îles, dans l'ordre des tableaux du shader. */
export const ISLAND_LIST: readonly Island[] = [tortuga, sabre, royale, dauphin];
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
