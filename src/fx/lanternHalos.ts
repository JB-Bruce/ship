import * as THREE from 'three';
import { CRIT, DAY_NIGHT } from '../config';
import type { LanternSpot } from '../ship/parts/nightGlow';
import type { Ship } from '../ship/ship';

const vertexShader = /* glsl */ `
/** Centre du halo, et sa taille (× uSize : 1 pour un fanal, plus pour un incendie). */
attribute vec4 aCenter;
attribute vec3 aColor;
uniform float uSize;
uniform float uGrowth;
uniform float uFadeFar;
uniform float uStrength;
varying vec2 vOffset;
varying vec3 vColor;
varying float vStrength;
void main() {
  vec4 mv = viewMatrix * vec4(aCenter.xyz, 1.0);
  float depth = -mv.z;
  // Un peu vers la caméra : la lampe ne coupe pas son propre halo.
  mv.xyz += normalize(-mv.xyz) * 0.3;
  // Le halo grandit avec la distance : un fanal reste lisible de loin.
  mv.xy += position.xy * uSize * aCenter.w * (1.0 + depth * uGrowth);
  vOffset = position.xy * 2.0;
  vColor = aColor;
  vStrength = uStrength * (1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, depth));
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform float uFalloff;
varying vec2 vOffset;
varying vec3 vColor;
varying float vStrength;
void main() {
  // Lueur en cloche, calculée directement dans l'espace de l'écran : convertir la décroissance en sRGB relèverait
  // sa queue et dessinerait un rond net. Elle s'éteint tout à fait avant le bord du carré.
  float d2 = dot(vOffset, vOffset);
  float glow = exp(-d2 * uFalloff) * (1.0 - smoothstep(0.5, 1.0, d2));
  gl_FragColor = vec4(linearToOutputTexel(vec4(vColor, 1.0)).rgb * glow * vStrength, 1.0);
}
`;

const world = new THREE.Vector3();
const FIRE_COLOR = new THREE.Color(0xff7a28);

/**
 * Halos des fanaux (navires et ports) quand il fait sombre : un carré face à la caméra par lanterne, en un seul
 * appel de rendu (sans brume : il s'efface selon sa propre distance). Là où des halos se recouvrent, seul le plus vif
 * compte (mélange « max ») : ils ne s'accumulent jamais. La lumière elle-même (ce qu'elle éclaire, ses reflets sur
 * l'eau) est dans fx/lampLights.ts. Ajouté à la scène dès le départ (précompilé), caché le jour.
 */
export class LanternHalos {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly centers: THREE.InstancedBufferAttribute;
  private readonly colors: THREE.InstancedBufferAttribute;
  private readonly uniforms = {
    uSize: { value: DAY_NIGHT.haloSize },
    uGrowth: { value: DAY_NIGHT.haloGrowth },
    uFadeFar: { value: DAY_NIGHT.haloRange },
    uStrength: { value: 0 },
    uFalloff: { value: DAY_NIGHT.haloFalloff },
  };
  private count = 0;
  private fadeFar = 0;

  constructor(private readonly ports: readonly LanternSpot[]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.attributes.position);
    const max = DAY_NIGHT.maxHalos;
    this.centers = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aCenter', this.centers);
    this.geometry.setAttribute('aColor', this.colors);
    this.geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      // Le plus vif l'emporte : trois fanaux côte à côte ne s'additionnent pas en une tache aveuglante.
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * `dark` : obscurité (0 en plein jour) ; `night` : nuit (de jour, par mauvais temps, les halos restent discrets) ;
   * `fogFar` : au-delà, rien n'est visible. Les navires sont posés directement dans la scène.
   */
  update(camera: THREE.Camera, ships: readonly Ship[], dark: number, night: number, fogFar: number) {
    this.mesh.visible = dark > 0.01;
    if (!this.mesh.visible) return;
    this.uniforms.uStrength.value = dark * DAY_NIGHT.haloIntensity * THREE.MathUtils.lerp(DAY_NIGHT.haloDaylight, 1, night);
    this.fadeFar = this.uniforms.uFadeFar.value = Math.min(DAY_NIGHT.haloRange, fogFar);
    this.count = 0;
    for (const spot of this.ports) this.push(spot.at, spot.color, camera, 1);
    for (const ship of ships) {
      const { root, lanterns, fireSpots } = ship.model;
      const burning = ship.crits.fire > 0 && fireSpots.length > 0;
      if (ship.sunk || !root.visible || (lanterns.length === 0 && !burning)) continue;
      if (ship.position.distanceTo(camera.position) > this.fadeFar + ship.stats.length) continue;
      root.updateMatrix();
      for (const spot of lanterns) this.push(world.copy(spot.at).applyMatrix4(root.matrix), spot.color, camera, 1);
      // Un incendie à bord : une grande lueur orange autour du foyer.
      if (burning) this.push(world.copy(fireSpots[ship.crits.fireSpot % fireSpots.length]).applyMatrix4(root.matrix), FIRE_COLOR, camera, CRIT.fireGlow);
    }
    this.geometry.instanceCount = this.count;
    this.centers.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  private push(at: THREE.Vector3, color: THREE.Color, camera: THREE.Camera, size: number) {
    if (this.count >= DAY_NIGHT.maxHalos || at.distanceTo(camera.position) > this.fadeFar) return;
    this.centers.setXYZW(this.count, at.x, at.y, at.z, size);
    this.colors.setXYZ(this.count, color.r, color.g, color.b);
    this.count++;
  }
}
