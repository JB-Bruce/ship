import * as THREE from 'three';
import { DAMAGE } from '../../config';
import { EMBLEM_DECLARATIONS, EMBLEM_FRAGMENT, emblemUniforms } from './sailEmblem';

/**
 * Toiles qui se trouent avec les dégâts, pour un bateau. Chaque voile reçoit son propre matériau (copie de celui
 * de la livrée) avec sa graine : les trous ne se répètent ni d'une voile à l'autre, ni d'un bateau à l'autre.
 * Tous partagent le même niveau de dégâts et le même programme de shader.
 * Les trous sont découpés dans le shader, dans le repère de la voile (ils suivent la toile quand elle se cargue
 * ou gonfle), par un bruit aléatoire à plusieurs échelles ; leur bord est un peu assombri, comme un accroc.
 * Une livrée à emblème (élites de la Marine) le peint sur la voile qu'on désigne (la plus grande).
 */
export class TornSail {
  private readonly tear = { value: 0 };
  private readonly materials: THREE.Material[] = [];

  /** `emblem` : la livrée porte un emblème sur sa plus grande voile. */
  constructor(
    private readonly base: THREE.Material,
    private readonly emblem = false,
  ) {}

  /**
   * Un nouveau matériau de voile, avec son propre motif de trous. `emblemOn` : la géométrie de la voile qui porte
   * l'emblème de la livrée (s'il y en a un).
   */
  material(emblemOn?: THREE.BufferGeometry): THREE.Material {
    const material = this.base.clone();
    const seed = { value: new THREE.Vector2(Math.random() * 100, Math.random() * 100) };
    const emblem = this.emblem && emblemOn ? emblemUniforms(emblemOn) : null;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTear = this.tear;
      shader.uniforms.uTearSeed = seed;
      if (emblem) Object.assign(shader.uniforms, emblem);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSailPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSailPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
varying vec3 vSailPos;
uniform float uTear;
uniform vec2 uTearSeed;
${emblem ? EMBLEM_DECLARATIONS : ''}
float tearHash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
}
// Bruit de valeur (cases aléatoires lissées) : pas de motif périodique.
float tearValue(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tearHash(i), tearHash(i + vec2(1.0, 0.0)), u.x), mix(tearHash(i + vec2(0.0, 1.0)), tearHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Gros accrocs, déchirures moyennes et grain fin pour des bords déchiquetés.
float tearNoise(vec3 p) {
  vec2 q = p.xy * 0.75 + p.z * 0.3 + uTearSeed;
  return tearValue(q) * 0.58 + tearValue(q * 2.3 + 17.3) * 0.3 + tearValue(q * 7.1 + 41.7) * 0.12;
}`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
${emblem ? EMBLEM_FRAGMENT : ''}
  if (uTear > 0.0) {
    float margin = tearNoise(vSailPos) - (1.0 - uTear);
    if (margin > 0.0) discard;
    // Bord de l'accroc assombri.
    diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.05, -margin));
  }`,
        );
    };
    // Même programme pour toutes les voiles trouées (seuls les uniforms changent d'une voile à l'autre).
    material.customProgramCacheKey = () => (emblem ? 'torn-sail-emblem' : 'torn-sail');
    this.materials.push(material);
    return material;
  }

  /** `damage` : vie perdue (0 = intact, 1 = coulé). */
  setDamage(damage: number) {
    this.tear.value = DAMAGE.maxSailHoles * Math.min(1, damage / DAMAGE.fullDamageAt);
  }

  dispose() {
    for (const material of this.materials) material.dispose();
  }
}
