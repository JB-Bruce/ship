import * as THREE from 'three';
import { DAMAGE, SAIL_BILLOW } from '../../config';
import { EMBLEM_DECLARATIONS, EMBLEM_FRAGMENT, emblemUniforms } from './sailEmblem';

/** Axe du creux d'une voile dans son repère : 'z' pour une voile carrée, 'x' pour un foc ou une voile aurique. */
export type SailAxis = 'x' | 'z';

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
  /** Creux des voiles : 1 = celui de leur forme, plus quand le vent les gonfle (voir setWind). */
  private readonly billow = { value: 1 };
  private readonly materials: THREE.Material[] = [];

  /** `emblem` : la livrée porte un emblème sur sa plus grande voile. */
  constructor(
    private readonly base: THREE.Material,
    private readonly emblem = false,
  ) {}

  /**
   * Un nouveau matériau de voile, avec son propre motif de trous. `axis` : l'axe du creux de la voile dans son repère
   * (voile carrée : 'z' ; foc et voile aurique : 'x'). `emblemOn` : la géométrie de la voile qui porte l'emblème de la
   * livrée (s'il y en a un).
   */
  material(axis: SailAxis, emblemOn?: THREE.BufferGeometry): THREE.Material {
    const material = this.base.clone();
    const seed = { value: new THREE.Vector2(Math.random() * 100, Math.random() * 100) };
    const emblem = this.emblem && emblemOn ? emblemUniforms(emblemOn) : null;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTear = this.tear;
      shader.uniforms.uTearSeed = seed;
      if (emblem) Object.assign(shader.uniforms, emblem);
      this.addBillow(shader, axis);
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

  /** Matériau d'une pièce posée sur une voile (rapiéçage) : elle gonfle avec la voile, sans trous. */
  patchMaterial(base: THREE.Material, axis: SailAxis): THREE.Material {
    const material = base.clone();
    material.onBeforeCompile = (shader) => this.addBillow(shader, axis);
    material.customProgramCacheKey = () => 'billow-patch';
    this.materials.push(material);
    return material;
  }

  /**
   * Le vent gonfle les voiles : face au vent, leur creux d'origine ; vent arrière, jusqu'à SAIL_BILLOW.max fois, selon
   * sa force. `relativeDirection` : où va le vent, par rapport au cap (0 = vent arrière).
   */
  setWind(relativeDirection: number, strength: number) {
    const fill = (1 + Math.cos(relativeDirection)) / 2;
    this.billow.value = 1 + (SAIL_BILLOW.max - 1) * fill * Math.min(1, strength / SAIL_BILLOW.fullStrength);
  }

  /**
   * Creux variable : chaque point de la toile s'écarte de son plan le long de l'axe du creux, `uBillow` fois plus que
   * dans la géométrie (la voile est plane à 0 sur cet axe) ; la normale suit la nouvelle courbure. Une voile carrée
   * pend de sa vergue (en y = 0) : le surplus de creux y est nul et s'installe sur SAIL_BILLOW.yardBlend mètres, pour
   * que la toile reste attachée à la vergue droite. Foc et voile aurique ont déjà un creux nul sur leurs bords.
   */
  private addBillow(shader: THREE.WebGLProgramParametersWithUniforms, axis: SailAxis) {
    shader.uniforms.uBillow = this.billow;
    shader.uniforms.uBillowAxis = { value: axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0) };
    shader.uniforms.uYardBlend = { value: axis === 'z' ? SAIL_BILLOW.yardBlend : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBillow;\nuniform vec3 uBillowAxis;\nuniform float uYardBlend;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal = normalize(objectNormal - uBillowAxis * dot(objectNormal, uBillowAxis) * (1.0 - 1.0 / uBillow));',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat billowFade = uYardBlend > 0.0 ? smoothstep(0.0, uYardBlend, -position.y) : 1.0;\ntransformed += uBillowAxis * dot(position, uBillowAxis) * (uBillow - 1.0) * billowFade;',
      );
  }

  /** `damage` : vie perdue (0 = intact, 1 = coulé). */
  setDamage(damage: number) {
    this.tear.value = DAMAGE.maxSailHoles * Math.min(1, damage / DAMAGE.fullDamageAt);
  }

  dispose() {
    for (const material of this.materials) material.dispose();
  }
}
