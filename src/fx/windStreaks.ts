import * as THREE from 'three';
import { WEATHER } from '../config';

/** Points le long d'un filet de vent (il ondule légèrement). */
const POINTS = 6;

// Chaque filet naît, file dans le sens du vent en ondulant, puis s'efface. Sa position de départ est tirée dans une
// boîte qui suit la caméra par enroulement (comme la pluie) ; tout le mouvement est calculé dans le shader.
const vertexShader = /* glsl */ `
attribute vec4 aStreak; // position de départ dans la boîte (0..1) et décalage de son cycle de vie (0..1)
attribute float aAlong; // position le long du filet (0 = queue, 1 = tête)
uniform float uTime;
uniform float uAmount;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uWind;     // direction où va le vent
uniform float uTravel;  // distance parcourue pendant une vie (m)
uniform float uLength;
varying float vAlpha;
void main() {
  // Moins il y a de vent, moins il y a de filets : ceux dont le seuil dépasse l'intensité restent invisibles.
  float shown = step(aStreak.w, uAmount);
  float phase = fract(aStreak.w * 7.31 + uTime);
  vec2 dir = uWind;
  vec2 side = vec2(-dir.y, dir.x);
  vec3 p = aStreak.xyz * uBox;
  p.xz += dir * phase * uTravel;
  p = uCenter + (fract((p - uCenter) / uBox + 0.5) - 0.5) * uBox;
  float s = aAlong - 0.5;
  float wiggle = sin(aAlong * 6.2832 + aStreak.w * 40.0 + uTime * 12.566) * 0.25;
  p.xz += dir * s * uLength + side * wiggle;
  p.y += wiggle * 0.4;
  // Apparition puis effacement au cours de la vie, et pointes plus fines que le milieu.
  vAlpha = shown * sin(3.1416 * phase) * (1.0 - abs(s) * 1.6);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.0) discard;
  gl_FragColor = vec4(vec3(1.0), uOpacity * vAlpha);
  #include <colorspace_fragment>
}
`;

const forward = new THREE.Vector3();

/** Filets de vent blancs qui filent dans l'air autour de la caméra. `amount` : 0 = aucun, 1 = grand vent. */
export class WindStreaks {
  readonly mesh: THREE.LineSegments;
  private readonly uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...WEATHER.streakBox) },
    uWind: { value: new THREE.Vector2(0, 1) },
    uTravel: { value: WEATHER.streakSpeed * WEATHER.streakLife },
    uLength: { value: WEATHER.streakLength },
    uOpacity: { value: WEATHER.streakOpacity },
  };

  constructor() {
    const count = WEATHER.streaks;
    const segments = POINTS - 1;
    const streaks = new Float32Array(count * segments * 2 * 4);
    const along = new Float32Array(count * segments * 2);
    let v = 0;
    for (let i = 0; i < count; i++) {
      const seed = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < segments; k++) {
        for (const end of [k, k + 1]) {
          streaks.set(seed, v * 4);
          along[v++] = end / segments;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    // La position est calculée dans le shader ; l'attribut ne sert qu'à donner le nombre de sommets.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v * 3), 3));
    geometry.setAttribute('aStreak', new THREE.BufferAttribute(streaks, 4));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Part des filets dessinés (0..1). */
  setDensity(density: number) {
    this.mesh.geometry.setDrawRange(0, Math.round(WEATHER.streaks * density) * (POINTS - 1) * 2);
  }

  /** `windDirection` : direction vers laquelle souffle le vent (comme Wind.direction). */
  update(dt: number, camera: THREE.Camera, amount: number, windDirection: number) {
    const u = this.uniforms;
    u.uAmount.value = amount;
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    // Le temps est compté en vies de filet, et ramené entre 0 et 1 : les nombres restent petits.
    u.uTime.value = (u.uTime.value + dt / WEATHER.streakLife) % 1;
    u.uWind.value.set(Math.sin(windDirection), Math.cos(windDirection));
    camera.getWorldDirection(forward);
    u.uCenter.value.copy(camera.position).addScaledVector(forward, WEATHER.streakBox[0] * 0.3);
  }
}
