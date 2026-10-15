import * as THREE from 'three';
import { ISLAND_LOBES, ISLAND_SLOTS, OCEAN } from '../config';
import { LAND_LIST, SDF, type Landmass } from './island';

/**
 * Au-delà de cette distance du joueur (m), aucune case de la grille de l'eau : son coin le plus lointain (la grille est
 * un carré de côté 2 × OCEAN.halfSize centré sur lui).
 */
const OCEAN_REACH = OCEAN.halfSize * Math.SQRT2;

const vectors4 = () => Array.from({ length: ISLAND_SLOTS }, () => new THREE.Vector4());

/**
 * Uniforms des îles pour le shader de l'eau : seulement les `uIslandCount` îles choisies par `selectIslands`, dans les
 * premiers emplacements. Partagés par référence avec le matériau de l'océan.
 */
export const islandUniforms = {
  uIslandCount: { value: 0 },
  /** (centre x, centre z, rayon extérieur, rayon moyen) */
  uIslandA: { value: vectors4() },
  /** (atténuation des vagues, largeur du lagon, largeur du ressac, profondeur de la crique) */
  uIslandB: { value: vectors4() },
  /** (cosinus et sinus de l'orientation du grand axe, étirement, cap de la crique dans le repère de la forme) */
  uIslandC: { value: vectors4() },
  /** (largeur de la crique, inutilisés) */
  uIslandD: { value: vectors4() },
  uIslandLobes: { value: Array.from({ length: ISLAND_SLOTS * ISLAND_LOBES }, () => new THREE.Vector3()) },
};

/** Îles candidates et leur distance au joueur (rivage le plus proche possible) : une fiche par île, réutilisée. */
interface Candidate {
  readonly island: Landmass;
  key: number;
}
const entries = new Map<Landmass, Candidate>();
const candidates: Candidate[] = [];
const byDistance = (a: Candidate, b: Candidate) => a.key - b.key;
const chosen: Landmass[] = [];
let warned = false;

/**
 * Choisit les îles que l'eau doit connaître autour de (x, z) : celles dont la zone d'influence (atténuation, lagon,
 * ressac) touche la grille de l'eau, les plus proches d'abord, au plus ISLAND_SLOTS. Les uniforms ne sont réécrits que
 * si le choix change. `list` : toutes les terres du monde (îles et îlots).
 */
export function selectIslands(x: number, z: number, list: readonly Landmass[] = LAND_LIST) {
  candidates.length = 0;
  for (const island of list) {
    const { calmDistance, lagoonWidth, surfWidth } = island.def;
    const near = Math.hypot(island.cx - x, island.cz - z) - island.outerRadius;
    if (near - Math.max(calmDistance, lagoonWidth, surfWidth) > OCEAN_REACH) continue;
    let entry = entries.get(island);
    if (!entry) entries.set(island, (entry = { island, key: 0 }));
    entry.key = near;
    candidates.push(entry);
  }
  candidates.sort(byDistance);
  if (candidates.length > ISLAND_SLOTS && !warned) {
    warned = true;
    console.warn(`Eau : ${candidates.length} îles proches pour ${ISLAND_SLOTS} emplacements (ISLAND_SLOTS) ; les plus lointaines sont ignorées.`);
  }
  const count = Math.min(candidates.length, ISLAND_SLOTS);
  let same = count === chosen.length;
  for (let i = 0; same && i < count; i++) same = chosen[i] === candidates[i].island;
  if (same) return;
  chosen.length = 0;
  for (let i = 0; i < count; i++) {
    chosen.push(candidates[i].island);
    writeSlot(i, candidates[i].island);
  }
  islandUniforms.uIslandCount.value = count;
}

function writeSlot(i: number, island: Landmass) {
  const u = islandUniforms;
  const { def, frame } = island;
  u.uIslandA.value[i].set(island.cx, island.cz, island.outerRadius, def.radius);
  u.uIslandB.value[i].set(def.calmDistance, def.lagoonWidth, def.surfWidth, def.bay?.depth ?? 0);
  u.uIslandC.value[i].set(frame.cos, frame.sin, frame.stretch, island.bayAngle);
  u.uIslandD.value[i].set(def.bay?.width ?? 1, 0, 0, 0);
  island.lobes.forEach(([k, amp, phase], j) => u.uIslandLobes.value[i * ISLAND_LOBES + j].set(k, amp, phase));
}

/**
 * Même calcul que Island.coastRadius / sdf / calmAt, en GLSL, pour les îles choisies. `islandShore` donne (distance
 * au rivage le plus proche, largeur de son lagon, largeur de son ressac). Nécessite `#include <common>` (PI).
 */
export const ISLAND_GLSL = /* glsl */ `
#define ISLAND_SLOTS ${ISLAND_SLOTS}
#define ISLAND_LOBES ${ISLAND_LOBES}
uniform int uIslandCount;
uniform vec4 uIslandA[ISLAND_SLOTS];
uniform vec4 uIslandB[ISLAND_SLOTS];
uniform vec4 uIslandC[ISLAND_SLOTS];
uniform vec4 uIslandD[ISLAND_SLOTS];
uniform vec3 uIslandLobes[ISLAND_SLOTS * ISLAND_LOBES];

/** Rayon de la côte dans le repère de la forme, au cap t de ce repère (Island.shapeRadius). */
float islandCoast(int i, float t) {
  float r = uIslandA[i].w;
  for (int k = 0; k < ISLAND_LOBES; k++) {
    vec3 lobe = uIslandLobes[i * ISLAND_LOBES + k];
    r += lobe.y * sin(lobe.x * t + lobe.z);
  }
  float d = mod(t - uIslandC[i].w + PI, 2.0 * PI) - PI;
  float b = d / uIslandD[i].x;
  return r - uIslandB[i].w * exp(-b * b);
}

float islandSdfOf(int i, vec2 p) {
  vec2 d = p - uIslandA[i].xy;
  float len = length(d);
  if (len > uIslandA[i].z + ${SDF.far.toFixed(1)}) return len - uIslandA[i].z;
  // Repère de la forme (Island.toShape) : tourné, resserré le long du grand axe, élargi en travers.
  vec3 f = uIslandC[i].xyz;
  vec2 q = vec2((d.x * f.x - d.y * f.y) * f.z, (d.x * f.y + d.y * f.x) / f.z);
  float t = atan(q.x, q.y);
  vec2 s = vec2(sin(t), cos(t));
  float rc = islandCoast(i, t);
  float slope = (islandCoast(i, t + ${SDF.slopeStep.toFixed(3)}) - islandCoast(i, t - ${SDF.slopeStep.toFixed(3)})) / ${(2 * SDF.slopeStep).toFixed(3)};
  float radial = length(q) - rc;
  float scale = length(vec2(f.z * s.x, s.y / f.z));
  float k = sqrt(exp(-abs(radial / scale) / ${SDF.slopeFade.toFixed(1)})) * slope / rc;
  return radial / length(vec2(f.z * (s.x - k * s.y), (s.y + k * s.x) / f.z));
}

/** Atténuation des vagues : 0 au rivage, 1 au large (la plus forte des îles ; aucune pour une île sans atténuation). */
float islandCalm(vec2 p) {
  float calm = 1.0;
  for (int i = 0; i < ISLAND_SLOTS; i++) {
    if (i >= uIslandCount) break;
    float reach = uIslandB[i].x;
    if (reach <= 0.0 || length(p - uIslandA[i].xy) > uIslandA[i].z + reach + 10.0) continue;
    calm = min(calm, smoothstep(0.0, reach, islandSdfOf(i, p)));
  }
  return calm;
}

/** (distance au rivage le plus proche, largeur de son lagon, largeur de son ressac). */
vec3 islandShore(vec2 p) {
  vec3 best = vec3(1e6, 1.0, 1.0);
  for (int i = 0; i < ISLAND_SLOTS; i++) {
    if (i >= uIslandCount) break;
    // Loin de l'île, une borne inférieure suffit (seule une distance sous la largeur du lagon ou du ressac compte) :
    // pas de calcul de la côte pour la plupart des pixels d'eau.
    float bound = length(p - uIslandA[i].xy) - uIslandA[i].z;
    float s = bound > max(uIslandB[i].y, uIslandB[i].z) ? bound : islandSdfOf(i, p);
    if (s < best.x) best = vec3(s, uIslandB[i].y, uIslandB[i].z);
  }
  return best;
}
`;
