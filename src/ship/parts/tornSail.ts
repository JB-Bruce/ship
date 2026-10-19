import * as THREE from 'three';
import { DAMAGE, SAIL_BILLOW } from '../../config';
import type { EmblemId } from '../../config';
import { EMBLEM_DECLARATIONS, EMBLEM_FRAGMENT, emblemBox, emblemState, setEmblem } from './sailEmblem';

/** Gonflement maximal d'une voile selon sa hauteur (voir SAIL_BILLOW). */
function maxBillow(sail: THREE.BufferGeometry): number {
  if (!sail.boundingBox) sail.computeBoundingBox();
  const height = sail.boundingBox!.max.y - sail.boundingBox!.min.y;
  const { small, large } = SAIL_BILLOW;
  const t = THREE.MathUtils.clamp((height - small.height) / (large.height - small.height), 0, 1);
  return THREE.MathUtils.lerp(small.max, large.max, t);
}

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
  /** Usure des toiles (ancienneté du navire, 0 à 1 : voir RANK_LOOKS) : jaunies, tachées, rapiécées. */
  private readonly wear = { value: 0 };
  /** Part du gonflement maximal de chaque voile (0 = creux d'origine, 1 = maximum) : celle du vent × le déploiement. */
  private readonly fill = { value: 0 };
  /** Part donnée par le vent (voir setWind), et déploiement des voiles (0 = affalées, 1 = pleine voile). */
  private windFill = 0;
  private deployment = 1;
  private readonly materials: THREE.Material[] = [];
  /** Emblème de la voile désignée : la couronne d'une livrée d'élite, ou celui choisi par le joueur (setEmblem). */
  private readonly emblemUniforms;

  /** `crown` : la livrée porte la couronne de la Marine sur sa plus grande voile. */
  constructor(
    private readonly base: THREE.Material,
    private readonly crown = false,
  ) {
    this.emblemUniforms = emblemState(crown);
  }

  /** Emblème choisi pour la grande voile (null : aucun, ou la couronne d'une livrée d'élite). */
  setEmblem(id: EmblemId | null) {
    setEmblem(this.emblemUniforms, id, this.crown);
  }

  /**
   * Un nouveau matériau pour la voile `sail`, avec son propre motif de trous et son gonflement maximal (selon sa
   * hauteur). `axis` : l'axe du creux de la voile dans son repère (voile carrée : 'z' ; foc et voile aurique : 'x').
   * `emblem` : c'est la voile qui porte l'emblème (couronne d'une livrée d'élite, ou celui choisi par le joueur). `curve` : multiplie toute sa courbure
   * (creux d'origine et gonflement), 1 = telle que dessinée.
   */
  material(sail: THREE.BufferGeometry, axis: SailAxis, emblem = false, curve = 1): THREE.Material {
    const material = this.base.clone();
    const seed = { value: new THREE.Vector2(Math.random() * 100, Math.random() * 100) };
    const emblemOn = emblem ? { ...this.emblemUniforms, ...emblemBox(sail) } : null;
    const max = maxBillow(sail);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTear = this.tear;
      shader.uniforms.uTearSeed = seed;
      shader.uniforms.uWear = this.wear;
      if (emblemOn) Object.assign(shader.uniforms, emblemOn);
      this.addBillow(shader, axis, max, curve);
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
uniform float uWear;
${emblemOn ? EMBLEM_DECLARATIONS : ''}
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
${emblemOn ? EMBLEM_FRAGMENT : ''}
  if (uWear > 0.0) {
    // Toile patinée : jaunie et ternie, des taches de sel et de goudron, quelques pièces rapiécées (~1 m).
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.8, 0.66), uWear);
    float stain = smoothstep(0.55, 0.75, tearValue(vSailPos.xy * 0.8 + uTearSeed * 1.7 + 5.0));
    diffuseColor.rgb *= 1.0 - stain * 0.22 * uWear;
    vec2 cell = floor(vSailPos.xy * 0.9 + uTearSeed);
    float mend = tearHash(cell);
    if (mend < 0.06 * uWear) diffuseColor.rgb *= tearHash(cell + 7.0) < 0.5 ? vec3(1.1, 1.06, 0.95) : vec3(0.78, 0.72, 0.62);
  }
  if (uTear > 0.0) {
    float margin = tearNoise(vSailPos) - (1.0 - uTear);
    if (margin > 0.0) discard;
    // Bord de l'accroc assombri.
    diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.05, -margin));
  }`,
        );
    };
    // Repère des voiles (un coup critique au gréement en fait tomber une).
    material.userData.sail = true;
    material.userData.wear = this.wear;
    material.userData.tornSail = this;
    // Même programme pour toutes les voiles trouées (seuls les uniforms changent d'une voile à l'autre).
    material.customProgramCacheKey = () => (emblemOn ? 'torn-sail-emblem' : 'torn-sail');
    this.materials.push(material);
    return material;
  }

  /** Matériau d'une pièce posée sur la voile `sail` (rapiéçage) : elle gonfle avec la voile, sans trous. */
  patchMaterial(base: THREE.Material, sail: THREE.BufferGeometry, axis: SailAxis): THREE.Material {
    const material = base.clone();
    const max = maxBillow(sail);
    material.onBeforeCompile = (shader) => this.addBillow(shader, axis, max, 1);
    material.customProgramCacheKey = () => 'billow-patch';
    this.materials.push(material);
    return material;
  }

  /**
   * Le vent gonfle les voiles : face au vent, leur creux d'origine ; vent arrière, jusqu'à leur maximum, selon sa force
   * (et en proportion de leur déploiement, voir setDeployment).
   * `relativeDirection` : où va le vent, par rapport au cap (0 = vent arrière).
   */
  setWind(relativeDirection: number, strength: number) {
    this.windFill = ((1 + Math.cos(relativeDirection)) / 2) * Math.min(1, strength / SAIL_BILLOW.fullStrength);
    this.fill.value = this.windFill * this.deployment;
  }

  /** Déploiement des voiles (jauge de voile, 0 à 1) : une voile à moitié hissée ne se gonfle qu'à moitié. */
  setDeployment(amount: number) {
    this.deployment = Math.max(0, Math.min(1, amount));
    this.fill.value = this.windFill * this.deployment;
  }

  /**
   * Creux variable : chaque point de la toile s'écarte de son plan le long de l'axe du creux, jusqu'à `max` fois plus
   * que dans la géométrie selon le vent (la voile est plane à 0 sur cet axe), le tout multiplié par `curve` ; la normale suit la nouvelle courbure. Une voile carrée
   * pend de sa vergue (en y = 0) : le surplus de creux y est nul et s'installe sur SAIL_BILLOW.yardBlend mètres, pour
   * que la toile reste attachée à la vergue droite. Foc et voile aurique ont déjà un creux nul sur leurs bords.
   */
  private addBillow(shader: THREE.WebGLProgramParametersWithUniforms, axis: SailAxis, max: number, curve: number) {
    shader.uniforms.uBillowFill = this.fill;
    shader.uniforms.uBillowMax = { value: max };
    shader.uniforms.uSailCurve = { value: curve };
    shader.uniforms.uBillowAxis = { value: axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0) };
    shader.uniforms.uYardBlend = { value: axis === 'z' ? SAIL_BILLOW.yardBlend : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBillowFill;\nuniform float uBillowMax;\nuniform vec3 uBillowAxis;\nuniform float uYardBlend;\nuniform float uSailCurve;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nfloat sailBillow = (1.0 + (uBillowMax - 1.0) * uBillowFill) * uSailCurve;\nobjectNormal = normalize(objectNormal - uBillowAxis * dot(objectNormal, uBillowAxis) * (1.0 - 1.0 / sailBillow));',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat billowFade = uYardBlend > 0.0 ? smoothstep(0.0, uYardBlend, -position.y) : 1.0;\ntransformed += uBillowAxis * dot(position, uBillowAxis) * (sailBillow - 1.0) * billowFade;',
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
