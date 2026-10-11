import * as THREE from 'three';
import { SKY } from '../config';
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
};

/** Couleur du ciel dans une direction : dégradé horizon → zénith, plus le halo du soleil. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunlight;
uniform float uFlash;

vec3 skyColor(vec3 dir) {
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(max(dir.y, 0.0), 0.45));
  float sun = max(dot(dir, uSunDir), 0.0);
  c += uSunColor * (pow(sun, 8.0) * 0.12 + pow(sun, 64.0) * 0.3) * uSunlight;
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
