import * as THREE from 'three';
import { WEATHER } from '../config';

/** Couleur des gouttes de jour. */
const DROP_COLOR = new THREE.Color(WEATHER.dropColor);

// Chaque goutte est un trait : sa position au repos est tirée au hasard dans une boîte, et le shader la fait tomber.
// Les gouttes restent fixes dans le monde (on les traverse en avançant) : la boîte, elle, suit la caméra
// par enroulement. Aucun calcul par goutte côté CPU.
const vertexShader = /* glsl */ `
attribute vec4 aDrop; // position au repos dans la boîte (0..1) et seuil d'apparition (0..1)
attribute float aTip; // 0 = bas du trait, 1 = haut
uniform float uFall;
uniform vec2 uDrift;   // dérive horizontale cumulée par le vent pendant la chute
uniform float uAmount;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uSlant;
uniform float uLength;
void main() {
  // Moins il pleut, moins il y a de gouttes : celles dont le seuil dépasse l'intensité sont jetées hors de l'écran.
  if (aDrop.w > uAmount) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // La goutte tombe en biais, dans l'axe de son trait : vers le bas et dans le sens du vent.
  vec3 p = aDrop.xyz * uBox - vec3(uDrift.x, uFall, uDrift.y);
  p = uCenter + (fract((p - uCenter) / uBox + 0.5) - 0.5) * uBox;
  // Le haut du trait est du côté d'où vient le vent : la pluie tombe en biais.
  p += vec3(uSlant.x, 1.0, uSlant.y) * aTip * uLength;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
}
`;

const forward = new THREE.Vector3();
/** Reste positif de la division : garde une valeur dans [0, m[. */
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** Rideau de pluie autour de la caméra. `amount` : 0 = aucune goutte, 1 = averse complète. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private readonly uniforms = {
    uFall: { value: 0 },
    uDrift: { value: new THREE.Vector2() },
    uAmount: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...WEATHER.dropBox) },
    uSlant: { value: new THREE.Vector2() },
    uLength: { value: WEATHER.dropLength },
    uColor: { value: new THREE.Color(WEATHER.dropColor) },
    uOpacity: { value: WEATHER.dropOpacity },
  };

  constructor() {
    const count = WEATHER.drops;
    const drops = new Float32Array(count * 8);
    const tips = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const seed = [Math.random(), Math.random(), Math.random(), Math.random()];
      drops.set(seed, i * 8);
      drops.set(seed, i * 8 + 4);
      tips[i * 2 + 1] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    // La position est calculée dans le shader ; l'attribut ne sert qu'à donner le nombre de sommets.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    geometry.setAttribute('aDrop', new THREE.BufferAttribute(drops, 4));
    geometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
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

  /** Part des gouttes dessinées (0..1) : leurs positions sont tirées au hasard, une partie reste bien répartie. */
  setDensity(density: number) {
    this.mesh.geometry.setDrawRange(0, Math.round(WEATHER.drops * density) * 2);
  }

  /**
   * `windDirection` / `windStrength` : comme dans Wind (direction vers laquelle il souffle, force 0..1). `light` : part de
   * la couleur de jour (les gouttes ne reçoivent pas les lumières de la scène : plus sombres la nuit).
   */
  update(dt: number, camera: THREE.Camera, amount: number, windDirection: number, windStrength: number, light: number) {
    const u = this.uniforms;
    u.uAmount.value = amount;
    u.uColor.value.copy(DROP_COLOR).multiplyScalar(light);
    this.mesh.visible = amount > 0;
    if (!this.mesh.visible) return;
    // Inclinaison : le haut du trait du côté d'où vient le vent ; la goutte avance dans le sens inverse.
    const slant = -WEATHER.dropSlant * windStrength;
    u.uSlant.value.set(Math.sin(windDirection) * slant, Math.cos(windDirection) * slant);
    // Chute et dérive sont ramenées à une taille de boîte : le motif est identique (l'enroulement a la même période),
    // et les nombres restent petits.
    const [boxX, boxY, boxZ] = WEATHER.dropBox;
    const fall = dt * WEATHER.fallSpeed;
    u.uFall.value = (u.uFall.value + fall) % boxY;
    u.uDrift.value.set(wrap(u.uDrift.value.x + u.uSlant.value.x * fall, boxX), wrap(u.uDrift.value.y + u.uSlant.value.y * fall, boxZ));
    // La boîte est centrée un peu devant la caméra, là où l'on regarde.
    camera.getWorldDirection(forward);
    u.uCenter.value.copy(camera.position).addScaledVector(forward, WEATHER.dropBox[0] * 0.35);
  }
}
