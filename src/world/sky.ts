import * as THREE from 'three';
import { DAY_NIGHT, SKY } from '../config';
import { RENDER_ORDER } from '../utils/renderOrder';

export const sunDirection = new THREE.Vector3(...SKY.sunDirection).normalize();

/** Uniforms du ciel, partagés tels quels par le shader de l'océan (qui reflète ce même ciel). */
export const skyUniforms = {
  uSkyZenith: { value: new THREE.Color(SKY.zenithColor) },
  uSkyHorizon: { value: new THREE.Color(SKY.horizonColor) },
  uSunColor: { value: new THREE.Color(SKY.sunColor) },
  uSunDir: { value: sunDirection },
  /** Part du soleil qui perce les nuages : 1 = grand soleil, presque 0 sous l'averse (réglé par la météo). */
  uSunlight: { value: 1 },
  /** Lueur d'un éclair (0 = aucune), qui illumine les nuages et donc leur reflet dans l'eau. */
  uFlash: { value: 0 },
  /** Jour et nuit (réglés par la météo, qui y compose l'heure : world/skyLighting.ts). */
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uMoonColor: { value: new THREE.Color(DAY_NIGHT.moonColor) },
  /** Nuit (0 de jour, 1 en pleine nuit), aube et crépuscule (pic au lever et au coucher), ciel dégagé (nuages de la météo). */
  uNight: { value: 0 },
  uTwilight: { value: 0 },
  uClearSky: { value: 1 },
  /** Luminosité de l'eau et de l'écume (1 de jour), qui ne reçoivent pas les lumières de la scène. */
  uWaterLight: { value: 1 },
  uFoamLight: { value: 1 },
};

/** Couleur du ciel dans une direction : dégradé horizon → zénith, plus le halo du soleil. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunlight;
uniform float uFlash;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uNight;
uniform float uTwilight;
uniform float uClearSky;
uniform float uWaterLight;
uniform float uFoamLight;

vec3 skyColor(vec3 dir) {
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(max(dir.y, 0.0), 0.45));
  float sun = max(dot(dir, uSunDir), 0.0);
  c += uSunColor * (pow(sun, 8.0) * 0.12 + pow(sun, 64.0) * 0.3) * uSunlight;
  // Aube et crépuscule : lueur dorée sur l'horizon, du côté du soleil.
  c += uSunColor * pow(sun, 3.0) * pow(1.0 - abs(dir.y), 4.0) * 0.35 * uTwilight * uClearSky;
  // Halo de la lune, la nuit.
  c += uMoonColor * pow(max(dot(dir, uMoonDir), 0.0), 24.0) * 0.16 * uNight * uClearSky;
  return c + vec3(0.75, 0.8, 0.95) * uFlash * (0.3 + 0.7 * max(dir.y, 0.0));
}
`;

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 color = skyColor(dir);
  // Disque du soleil.
  color += uSunColor * smoothstep(0.9993, 0.9997, dot(dir, uSunDir)) * 2.0 * uSunlight;
  // La nuit : disque de la lune (encore deviné sous des nuages légers) et étoiles par ciel dégagé, effacées vers l'horizon.
  color += uMoonColor * smoothstep(0.99935, 0.99975, dot(dir, uMoonDir)) * 1.5 * uNight * mix(0.3, 1.0, uClearSky);
  float starsOn = uNight * uClearSky * uClearSky * smoothstep(0.03, 0.3, dir.y);
  if (starsOn > 0.0) {
    vec3 cell = floor(dir * 230.0);
    float seed = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    vec3 offset = vec3(fract(seed * 13.7), fract(seed * 71.3), fract(seed * 37.1)) * 0.5 + 0.25;
    float star = step(0.9955, seed) * (1.0 - smoothstep(0.08, 0.26, length(fract(dir * 230.0) - offset)));
    color += vec3(0.85, 0.9, 1.0) * star * (0.5 + 0.5 * fract(seed * 97.0)) * starsOn;
  }
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** Dôme de ciel centré sur la caméra. */
export class Sky {
  readonly mesh: THREE.Mesh;

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 16), material);
    this.mesh.renderOrder = RENDER_ORDER.sky;
    this.mesh.frustumCulled = false;
  }

  update(cameraPosition: THREE.Vector3) {
    this.mesh.position.copy(cameraPosition);
  }
}
