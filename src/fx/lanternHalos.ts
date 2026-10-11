import * as THREE from 'three';
import { DAY_NIGHT } from '../config';
import type { LanternSpot } from '../ship/parts/nightGlow';
import type { Ship } from '../ship/ship';

const vertexShader = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aColor;
uniform float uSize;
uniform float uGrowth;
uniform float uFadeFar;
uniform float uStrength;
varying vec2 vOffset;
varying vec3 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(aCenter, 1.0);
  float depth = -mv.z;
  // Un peu vers la caméra : la lampe ne coupe pas son propre halo.
  mv.xyz += normalize(-mv.xyz) * 0.3;
  // Le halo grandit avec la distance : un fanal reste lisible de loin.
  mv.xy += position.xy * uSize * (1.0 + depth * uGrowth);
  vOffset = position.xy * 2.0;
  vColor = aColor * uStrength * (1.0 - smoothstep(uFadeFar * 0.6, uFadeFar, depth));
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vOffset;
varying vec3 vColor;
void main() {
  float glow = pow(max(1.0 - length(vOffset), 0.0), 2.2);
  gl_FragColor = vec4(vColor * glow, 1.0);
  #include <colorspace_fragment>
}
`;

const world = new THREE.Vector3();

/**
 * Halos des fanaux (navires et ports) quand il fait sombre : un carré face à la caméra par lanterne, en un seul
 * appel de rendu (additif, sans brume : il s'efface selon sa propre distance). Ajouté à la scène dès le départ
 * (précompilé), caché le jour.
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
  };
  private count = 0;
  private fadeFar = 0;

  constructor(private readonly ports: readonly LanternSpot[]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.attributes.position);
    const max = DAY_NIGHT.maxHalos;
    this.centers = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
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
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** `dark` : obscurité (0 en plein jour) ; `fogFar` : au-delà, rien n'est visible. Les navires sont posés directement dans la scène. */
  update(camera: THREE.Camera, ships: readonly Ship[], dark: number, fogFar: number) {
    this.mesh.visible = dark > 0.01;
    if (!this.mesh.visible) return;
    this.uniforms.uStrength.value = dark * DAY_NIGHT.haloIntensity;
    this.fadeFar = this.uniforms.uFadeFar.value = Math.min(DAY_NIGHT.haloRange, fogFar);
    this.count = 0;
    for (const spot of this.ports) this.push(spot.at, spot.color, camera);
    for (const ship of ships) {
      const { root, lanterns } = ship.model;
      if (ship.sunk || !root.visible || lanterns.length === 0) continue;
      if (ship.position.distanceTo(camera.position) > this.fadeFar + ship.stats.length) continue;
      root.updateMatrix();
      for (const spot of lanterns) this.push(world.copy(spot.at).applyMatrix4(root.matrix), spot.color, camera);
    }
    this.geometry.instanceCount = this.count;
    this.centers.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  private push(at: THREE.Vector3, color: THREE.Color, camera: THREE.Camera) {
    if (this.count >= DAY_NIGHT.maxHalos || at.distanceTo(camera.position) > this.fadeFar) return;
    this.centers.setXYZ(this.count, at.x, at.y, at.z);
    this.colors.setXYZ(this.count, color.r, color.g, color.b);
    this.count++;
  }
}
