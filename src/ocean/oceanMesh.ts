import * as THREE from 'three';
import { GRAPHICS, OCEAN } from '../config';
import { RENDER_ORDER } from '../utils/renderOrder';
import { ISLAND_GLSL, islandUniforms } from '../world/island';
import { SKY_GLSL, skyUniforms } from '../world/sky';
import { createRippleTexture } from './rippleTexture';
import { seaStateUniforms } from './seaState';
import { wakeUniforms } from './wakeMap';
import { WAKE_GLSL } from './wakeShaders';
import type { Waves } from './waves';

// Eau stylisée « lisse » : normales analytiques des vagues de Gerstner (GPU Gems, chap. 1),
// rides de détail, reflet du ciel selon l'angle (Fresnel), éclat du soleil,
// crêtes turquoise à contre-jour et écume (à la Sea of Thieves).

// Même formule que Waves.displace() dans waves.ts (atténuation près de l'île comprise) : les garder identiques.
const vertexShader = (waveCount: number) => /* glsl */ `
#include <common>
#include <fog_pars_vertex>
${ISLAND_GLSL}
#define WAVE_COUNT ${waveCount}
uniform float uTime;
uniform vec4 uWaves[WAVE_COUNT]; // (dirX, dirZ, steepness, wavelength)
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vJacobian;

void main() {
  // La grille n'est que translatée (jamais tournée ni mise à l'échelle).
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 offset = vec3(0.0);
  vec3 dX = vec3(0.0);  // contribution des vagues à la dérivée de la surface selon x
  vec3 dZ = vec3(0.0);  // … et selon z
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec4 w = uWaves[i];
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    float f = k * (dot(w.xy, p.xz) - c * uTime);
    float a = w.z / k;
    float s = sin(f);
    float co = cos(f);
    offset += vec3(w.x * a * co, a * s, w.y * a * co);
    dX += vec3(-w.x * w.x * w.z * s, w.x * w.z * co, -w.x * w.y * w.z * s);
    dZ += vec3(-w.x * w.y * w.z * s, w.y * w.z * co, -w.y * w.y * w.z * s);
  }
  // Près de l'île, les vagues s'apaisent jusqu'à disparaître au rivage.
  float calm = islandCalm(p.xz);
  offset *= calm;
  vec3 tangent = vec3(1.0, 0.0, 0.0) + dX * calm;
  vec3 binormal = vec3(0.0, 0.0, 1.0) + dZ * calm;
  vec3 worldPos = p + offset;
  vWorldPos = worldPos;
  vNormal = normalize(cross(binormal, tangent));
  // Jacobien < 1 : la surface se comprime (crête qui se resserre) → écume.
  vJacobian = tangent.x * binormal.z - binormal.x * tangent.z;
  vHeight = offset.y;
  vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${SKY_GLSL}
${ISLAND_GLSL}
uniform vec3 uLagoon;
uniform float uTime;
uniform float uMaxHeight;
uniform float uRippleStrength;
uniform float uSeaFoam;
uniform vec2 uWindDir;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uScatter;
uniform vec3 uFoam;
uniform sampler2D uRipples;
uniform float uDetailDistance;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vHeight;
varying float vJacobian;
${WAKE_GLSL}

void main() {
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  #if defined(USE_FOG) && !defined(FOG_EXP2)
    // Eau noyée dans la brume : seule la couleur de la brume s'y voit, inutile de calculer le reste (en tempête et
    // dans le brouillard, c'est la plus grande partie de l'eau à l'écran).
    if (smoothstep(fogNear, fogFar, vFogDepth) > 0.998) {
      gl_FragColor = vec4(fogColor, 1.0);
      return;
    }
  #endif
  vec3 V = toCamera / dist;

  // Rides : deux couches de la même texture, à deux échelles, qui défilent dans des sens différents.
  vec4 r1 = texture2D(uRipples, vWorldPos.xz * 0.035 + uTime * vec2(0.012, 0.007));
  vec4 r2 = texture2D(uRipples, vWorldPos.xz * 0.09 + uTime * vec2(-0.009, 0.015));
  // Détails fins (rides, traces des bateaux, frémissement des bancs, dentelle d'écume) : seulement en deçà de
  // uDetailDistance. Au-delà de ~220 m, ils sont de toute façon effacés ou hors de la carte des sillages.
  bool detailed = dist < uDetailDistance;
  vec2 slope = vec2(0.0);
  float rippleFade = 0.0;
  vec3 wake = vec3(0.0);
  if (detailed) {
    slope = (r1.rg * 2.0 - 1.0) + (r2.rg * 2.0 - 1.0) * 0.6;
    // Au loin, les rides s'effacent (sinon elles forment des stries en vue rasante).
    rippleFade = 1.0 - smoothstep(30.0, 220.0, dist);
    // Traces des bateaux (écume, eau lissée) : derrière un bateau, les rides sont effacées.
    wake = wakeTrace(vWorldPos.xz);
  }
  float wakeCalm = clamp(wake.g, 0.0, 1.0);
  // Au-dessus d'un banc de poissons, l'eau frémit : rides fines, rapides et marquées, visibles d'assez loin.
  float shimmer = clamp(wake.b, 0.0, 1.0);
  if (shimmer > 0.0) {
    vec2 fine = texture2D(uRipples, vWorldPos.xz * 0.45 + uTime * vec2(0.11, -0.07)).rg * 2.0 - 1.0;
    slope += fine * shimmer * 2.5;
    rippleFade = max(rippleFade, shimmer * (1.0 - smoothstep(150.0, 400.0, dist)));
  }
  vec3 N = normalize(normalize(vNormal) - vec3(slope.x, 0.0, slope.y) * uRippleStrength * rippleFade * (1.0 - 0.6 * wakeCalm));

  // Fresnel : vue rasante = miroir du ciel, vue plongeante = couleur de l'eau.
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 reflection = skyColor(R);

  float h = clamp(vHeight / uMaxHeight * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, smoothstep(0.2, 1.0, h));
  body *= 0.6 + 0.4 * max(dot(N, uSunDir), 0.0);
  // Contre-jour : le soleil traverse les crêtes et les teinte en turquoise.
  vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-4, 0.0, 0.0));
  vec3 viewFlat = normalize(vec3(-V.x, 0.0, -V.z));
  float backLight = pow(max(dot(viewFlat, sunFlat), 0.0), 3.0);
  body += uScatter * (backLight * 0.8 + 0.2) * smoothstep(0.45, 1.0, h) * 0.6 * uSunlight;
  // Lagon : eau peu profonde et turquoise autour de l'île.
  // Rivage le plus proche : (distance, largeur de son lagon, largeur de son ressac).
  vec3 coast = islandShore(vWorldPos.xz);
  float shore = coast.x;
  body = mix(body, uLagoon * (0.75 + 0.25 * max(dot(N, uSunDir), 0.0)), (1.0 - smoothstep(0.0, coast.y, shore)) * 0.8);

  // Eau brassée par un bateau : un peu plus claire et laiteuse.
  body = mix(body, body * 1.06 + uScatter * 0.03, wakeCalm * 0.6);
  // Ciel couvert : l'eau s'assombrit ; la nuit encore plus (l'eau ne reçoit pas les lumières de la scène).
  body *= mix(0.6, 1.0, uSunlight) * uWaterLight;

  vec3 color = mix(body, reflection, fresnel * 0.9);
  // Reflet du soleil : un éclat net et un halo, rendus pétillants par les rides.
  float spec = max(dot(R, uSunDir), 0.0);
  color += uSunColor * (pow(spec, 900.0) * 5.0 + pow(spec, 90.0) * 0.2) * uSunlight;
  // La nuit, la lune trace son chemin de reflets sur l'eau.
  float moonSpec = max(dot(R, uMoonDir), 0.0);
  color += uMoonColor * (pow(moonSpec, 350.0) * 2.2 + pow(moonSpec, 40.0) * 0.07) * uNight * uClearSky;
  // Écume : de la couleur de l'écume, plus sombre la nuit.
  vec3 foam = uFoam * uFoamLight;

  // Écume : seulement au sommet des crêtes qui se resserrent, en petites touches découpées par le bruit.
  // Mer calme = très peu d'écume ; une mer forte (météo) en fera apparaître beaucoup plus.
  float noise = r1.a * 0.6 + r2.a * 0.4;
  // Par grosse tempête (uSeaFoam), cette écume de crête s'efface : une ligne sur chaque crête dessinerait un motif
  // répétitif. À la place, quelques taches éparses au sommet des plus hautes vagues seulement : chaque tache naît à
  // un endroit tiré au hasard dans sa case (~11 m) et change de place à chaque cycle, jamais deux fois au même endroit.
  float storm = uSeaFoam;
  float crest = smoothstep(0.85, 0.65, vJacobian) * smoothstep(0.7, 0.95, h);
  color = mix(color, foam, crest * smoothstep(0.55, 0.8, noise) * 0.85 * (1.0 - storm));
  // (Seulement en haut des vagues, le seul endroit où elles se voient : le reste de l'eau saute ce calcul.)
  if (storm > 0.0 && h > 0.62) {
    vec2 cellPos = vWorldPos.xz / 11.0;
    vec2 cell = floor(cellPos);
    float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float cycle = uTime * (0.08 + 0.06 * seed) + seed * 13.0;
    float n = floor(cycle);
    vec2 spot = vec2(fract(sin(dot(cell + n, vec2(12.9898, 78.233))) * 43758.5453), fract(sin(dot(cell - n, vec2(39.35, 11.13))) * 24634.6345));
    float radius = (0.15 + 0.15 * spot.x) * sin(3.1416 * fract(cycle));
    float d = length(fract(cellPos) - 0.2 - 0.6 * spot) + (noise - 0.5) * 0.12;
    float blot = 1.0 - smoothstep(radius * 0.5, radius, d);
    color = mix(color, foam, blot * smoothstep(0.62, 0.85, h) * step(0.3, seed) * storm * 0.75);
  }
  // Sillages, anneaux et vague d'étrave : écume découpée par le bruit, qui se défait en s'estompant.
  // Dense juste derrière le bateau, puis en dentelle qui se défait en pâlissant (jamais un aplat blanc).
  // Deux échelles, l'une tournée : le motif ne se répète pas en quadrillage, même par mer plate.
  if (detailed) {
    vec2 lacePos = vWorldPos.xz;
    float lace = texture2D(uRipples, lacePos * 0.17 + uTime * vec2(0.006, -0.004)).a * 0.4
      + texture2D(uRipples, mat2(0.8, -0.6, 0.6, 0.8) * lacePos * 0.29 + vec2(0.37, 0.11)).a * 0.35
      + noise * 0.25;
    float trailFoam = clamp((min(wake.r, 1.0) - (1.0 - lace) * 0.95) * 2.2, 0.0, 1.0);
    float hullF = clamp((hullFoam(vWorldPos.xz, vWorldPos.y, uTime) - (1.0 - lace) * 0.35) * 2.2, 0.0, 1.0);
    color = mix(color, foam, max(trailFoam * 0.65, hullF * 0.7));
  }
  // Ressac : un liseré d'écume qui ondule le long du rivage.
  float surf = 1.0 - smoothstep(0.0, coast.z * (0.6 + 0.8 * noise), shore);
  color = mix(color, foam, surf * 0.9);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Surface de l'océan : grille recentrée sous le joueur, déformée par les vagues dans le shader. */
export class Ocean {
  readonly mesh: THREE.Mesh;
  /** Cases de la grille par côté (réglage graphique). */
  private segments = OCEAN.segments;
  private readonly uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    ...skyUniforms,
    ...islandUniforms,
    ...wakeUniforms,
    ...seaStateUniforms,
    uLagoon: { value: new THREE.Color(OCEAN.lagoonColor) },
    uTime: { value: 0 },
    uWaves: { value: [] as THREE.Vector4[] },
    uMaxHeight: { value: 1 },
    uRippleStrength: { value: OCEAN.rippleStrength },
    uRipples: { value: createRippleTexture() },
    uDeep: { value: new THREE.Color(OCEAN.deepColor) },
    uShallow: { value: new THREE.Color(OCEAN.shallowColor) },
    uScatter: { value: new THREE.Color(OCEAN.scatterColor) },
    uFoam: { value: new THREE.Color(OCEAN.foamColor) },
    uDetailDistance: { value: GRAPHICS.detailDistance.detailed },
  };

  constructor(private readonly waves: Waves) {
    this.uniforms.uWaves.value = waves.list.map(() => new THREE.Vector4());
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertexShader(waves.list.length),
      fragmentShader,
      fog: true,
    });
    this.mesh = new THREE.Mesh(buildGrid(OCEAN.segments), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RENDER_ORDER.ocean;
  }

  /** Finesse de la grille (cases par côté) : elle est reconstruite. */
  setGrid(segments: number) {
    if (segments === this.segments) return;
    this.segments = segments;
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildGrid(segments);
  }

  /** Distance (m) au-delà de laquelle le shader saute les détails fins de l'eau. */
  setDetailDistance(distance: number) {
    this.uniforms.uDetailDistance.value = distance;
  }

  /** Synchronise le shader avec les vagues CPU et recentre la grille sous `focus`. */
  update(focus: THREE.Vector3) {
    this.uniforms.uTime.value = this.waves.time;
    this.waves.list.forEach((w, i) => {
      this.uniforms.uWaves.value[i].set(w.dirX, w.dirZ, w.steepness, w.wavelength);
    });
    this.uniforms.uMaxHeight.value = this.waves.maxHeight;

    // Déplacer la grille par pas entiers de cellule évite que les sommets « glissent » sous la caméra.
    const step = OCEAN.innerCell;
    this.mesh.position.set(Math.round(focus.x / step) * step, 0, Math.round(focus.z / step) * step);
  }
}

/**
 * Grille dont les cellules grandissent avec la distance : détaillée sous le joueur,
 * grossière au loin (cachée par la brume). Beaucoup moins de sommets qu'une grille uniforme.
 */
function buildGrid(n: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(2, 2, n, n);
  geometry.rotateX(-Math.PI / 2);
  // g(t) = c·t + (1 − c)·t³ : pente c au centre (cellule = innerCell), étirement cubique vers le bord.
  const c = (OCEAN.innerCell * n) / 2 / OCEAN.halfSize;
  const stretch = (t: number) => OCEAN.halfSize * (c * t + (1 - c) * t * t * t);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, stretch(pos.getX(i)));
    pos.setZ(i, stretch(pos.getZ(i)));
  }
  return geometry;
}
