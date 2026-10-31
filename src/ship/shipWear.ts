import * as THREE from 'three';
import { RANK_LOOKS } from '../config';

/** Copies assombries des matériaux de coque, par matériau d'origine et par rang (partagées par tous les navires). */
const worn = new Map<THREE.Material, THREE.Material[]>();

/** Un matériau de bois ou de peinture de la coque : sans texture, ni métal, ni lumière, ni toile. */
function isHullMaterial(m: THREE.Material): m is THREE.MeshStandardMaterial {
  if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false;
  const s = m as THREE.MeshStandardMaterial;
  if (s.map || s.userData.sail || s.metalness > 0.3) return false;
  return s.emissive.getHex() === 0;
}

function wornMaterial(base: THREE.MeshStandardMaterial, stars: number): THREE.Material {
  let list = worn.get(base);
  if (!list) worn.set(base, (list = []));
  let m = list[stars];
  if (!m) {
    const copy = base.clone();
    // Bois patiné par les campagnes : plus sombre et un peu terni.
    const hsl = { h: 0, s: 0, l: 0 };
    copy.color.getHSL(hsl);
    copy.color.setHSL(hsl.h, hsl.s * (1 - RANK_LOOKS.hullFade[stars]), hsl.l * (1 - RANK_LOOKS.hullDarken[stars]));
    copy.userData.wornFrom = base;
    addWoodWear(copy, stars);
    list[stars] = m = copy;
  }
  return m;
}

/** Pavillon usé : son bout flottant s'effiloche et des trous s'ouvrent dans la toile, selon RANK_LOOKS.flagWear. */
function wornFlag(base: THREE.Material, stars: number): THREE.Material {
  let list = worn.get(base);
  if (!list) worn.set(base, (list = []));
  let m = list[stars];
  if (!m) {
    const copy = base.clone();
    const w = RANK_LOOKS.flagWear[stars].toFixed(3);
    copy.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nfloat flagHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  {
    // Bout flottant effiloché (u = 1), en dents irrégulières, et quelques trous.
    float fray = 1.0 - ${w} * (0.12 + 0.2 * flagHash(vec2(floor(vMapUv.y * 11.0), 1.0)));
    if (vMapUv.x > fray) discard;
    vec2 g = vMapUv * vec2(8.0, 5.0);
    if (flagHash(floor(g) + 5.0) < ${w} * 0.14 && length(fract(g) - 0.5) < 0.22 + 0.12 * flagHash(floor(g))) discard;
  }`,
        );
    };
    copy.customProgramCacheKey = () => `worn-flag-${stars}`;
    copy.userData.wornFrom = base;
    list[stars] = m = copy;
  }
  return m;
}

/**
 * Bois des campagnes, dans le repère du navire (le motif ne glisse pas) : des planches remplacées d'une autre teinte,
 * des fentes sombres, et une bande de sel et de mousse le long de la flottaison. Rangs de planches horizontaux sur le
 * bordé, en travers sur les ponts.
 */
function addWoodWear(material: THREE.MeshStandardMaterial, stars: number) {
  const L = RANK_LOOKS;
  const f = (v: number) => v.toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWearPos;\nvarying vec3 vWearNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWearPos = position;\nvWearNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWearPos;
varying vec3 vWearNormal;
float wearHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float wearNoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wearHash(i), wearHash(i + vec2(1.0, 0.0)), u.x), mix(wearHash(i + vec2(0.0, 1.0)), wearHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    // Rang de planches : en hauteur sur le bordé, en travers sur un pont (surface horizontale).
    bool deck = abs(vWearNormal.y) > 0.7;
    float across = deck ? vWearPos.x : vWearPos.y;
    float row = floor(across / ${f(L.plank.height)});
    float run = vWearPos.z / ${f(L.plank.length)} + wearHash(vec2(row, 3.0));
    vec2 cell = vec2(row, floor(run));
    float h = wearHash(cell);
    if (h < ${f(L.planks[stars])}) diffuseColor.rgb *= wearHash(cell + 11.0) < 0.5 ? vec3(1.28, 1.2, 1.1) : vec3(0.68, 0.64, 0.6);
    // Fente : un trait sombre en biais dans quelques planches.
    if (wearHash(cell + 23.0) < ${f(L.cracks[stars])}) {
      float t = fract(run);
      float v = fract(across / ${f(L.plank.height)});
      float line = abs(v - (0.2 + 0.6 * t + 0.3 * sin(t * 9.0 + h * 6.0)));
      diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.02, 0.07, line) + step(0.75, abs(t - 0.5) * 2.0));
    }
    // Sel et mousse le long de la flottaison (bordé seulement).
    if (!deck && vWearPos.y < 1.0) {
      float band = (1.0 - smoothstep(0.2, 1.0, vWearPos.y)) * ${f(L.grime[stars])};
      // Mousse verdâtre en dessous, croûtes de sel blanchies par endroits au-dessus (petites taches, jamais un damier).
      float n = wearNoise(vWearPos.zy * vec2(1.3, 4.0));
      vec3 moss = diffuseColor.rgb * vec3(0.8, 0.9, 0.72);
      vec3 salt = mix(diffuseColor.rgb, vec3(0.74, 0.74, 0.7), 0.3);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(moss, salt, smoothstep(0.55, 0.75, n)), band * (0.25 + 0.25 * n));
    }
  }`,
      );
  };
  material.customProgramCacheKey = () => `worn-wood-${stars}`;
}

/**
 * Ancienneté d'un navire de la flotte (rang en étoiles, 0 = recrue) : voiles patinées (jaunies, tachées, rapiécées :
 * `uWear` des voiles trouées) et coque usée (bois plus sombre). Reposée après chaque reconstruction du modèle.
 */
export function applyWear(root: THREE.Object3D, stars: number) {
  const sail = RANK_LOOKS.sailWear[stars] ?? 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      if (m.userData.wear) {
        m.userData.wear.value = sail;
        return m;
      }
      const base = (m.userData.wornFrom as THREE.Material | undefined) ?? m;
      if (base.userData.flag) return stars > 0 ? wornFlag(base, stars) : base;
      if (!isHullMaterial(base)) return m;
      return stars > 0 ? wornMaterial(base, stars) : base;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
