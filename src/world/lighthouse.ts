import * as THREE from 'three';
import { LIGHTHOUSE } from '../config';
import { std } from '../ship/parts/common';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import { tortuga } from './island';
import { LIGHTHOUSE_SPOT } from './landmarks';
import { skyUniforms } from './sky';

/** Faisceau : cône ouvert, pointe à la lanterne (y = 0), qui s'étend vers +X. Plus clair près de la lanterne. */
const BEAM_VERTEX = /* glsl */ `
varying float vAlong;
void main() {
  vAlong = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vAlong;
void main() {
  gl_FragColor = vec4(uColor, pow(vAlong, 1.8) * uIntensity);
}
`;

const toCamera = new THREE.Vector3();

/** Halo rond et doux, pour la lanterne vue de loin. */
function haloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 244, 200, 1)');
  gradient.addColorStop(0.25, 'rgba(255, 220, 140, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 200, 100, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Phare blanc et rouge sur la pointe est de la crique. Par temps sombre (brouillard, pluie, orage, tempête), sa
 * lanterne s'allume : halo visible de loin et deux faisceaux qui balaient l'horizon, à travers la brume.
 * L'amélioration « Phare » de l'île le fait grandir (tour plus haute, faisceaux plus longs).
 */
export class Lighthouse {
  readonly group = new THREE.Group();
  private readonly tower = new THREE.Group();
  private readonly lamp = std(0xfff0a0, { emissive: 0xffd060, emissiveIntensity: 1.6 });
  private readonly beams = new THREE.Group();
  private readonly beamUniforms = { uColor: { value: new THREE.Color(LIGHTHOUSE.color) }, uIntensity: { value: 0 } };
  private readonly halo: THREE.Sprite;
  private readonly ground: number;
  private level = -1;
  private angle = Math.random() * Math.PI * 2;

  constructor() {
    const spot = LIGHTHOUSE_SPOT;
    this.ground = tortuga.heightAt(spot.x, spot.z);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: LIGHTHOUSE.color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }),
    );
    const material = new THREE.ShaderMaterial({
      uniforms: this.beamUniforms,
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const side of [0, Math.PI]) {
      const beam = new THREE.Mesh(new THREE.BufferGeometry(), material);
      beam.rotation.y = side;
      this.beams.add(beam);
    }
    this.group.add(this.tower, this.beams, this.halo);
    this.setLevel(0);
  }

  /** Niveau de l'amélioration « Phare » : 0 (de base) à 2. Reconstruit la tour et les faisceaux. */
  setLevel(level: number) {
    if (level === this.level) return;
    this.level = level;
    const bands = LIGHTHOUSE.bands[level];
    const spot = LIGHTHOUSE_SPOT;
    const y = this.ground;
    const white = std(0xece6da);
    const red = std(0xb3261e);
    const stone = std(0x8f8a80);
    const batch = new GeometryBatch();
    batch.add(stone, new THREE.CylinderGeometry(3.4, 3.8, 3, 8), tf(spot.x, y + 0.5, spot.z));
    for (let i = 0; i < bands; i++) {
      const r0 = THREE.MathUtils.lerp(2.8, 1.9, i / bands);
      const r1 = THREE.MathUtils.lerp(2.8, 1.9, (i + 1) / bands);
      batch.add(i % 2 ? red : white, new THREE.CylinderGeometry(r1, r0, 3, 10), tf(spot.x, y + 2 + 3 * i + 1.5, spot.z));
    }
    const top = y + 2 + 3 * bands;
    batch.add(stone, new THREE.CylinderGeometry(2.5, 2.5, 0.35, 10), tf(spot.x, top + 0.18, spot.z));
    batch.add(this.lamp, new THREE.CylinderGeometry(1.3, 1.3, 1.9, 8), tf(spot.x, top + 1.3, spot.z));
    batch.add(red, new THREE.ConeGeometry(1.7, 1.5, 8), tf(spot.x, top + 3, spot.z));
    for (const child of this.tower.children) (child as THREE.Mesh).geometry.dispose();
    this.tower.clear();
    for (const { geometry, material } of batch.build()) this.tower.add(new THREE.Mesh(geometry, material));

    // Faisceaux : un cône couché depuis la lanterne, un peu incliné vers la mer.
    const length = LIGHTHOUSE.beamLength[level];
    const cone = new THREE.CylinderGeometry(0.4, LIGHTHOUSE.beamWidth * length, length, 16, 1, true);
    cone.translate(0, -length / 2, 0);
    cone.rotateZ(Math.PI / 2 + LIGHTHOUSE.beamTilt);
    for (const beam of this.beams.children) {
      (beam as THREE.Mesh).geometry.dispose();
      (beam as THREE.Mesh).geometry = cone;
    }
    this.beams.position.set(spot.x, top + 1.3, spot.z);
    this.halo.position.set(spot.x, top + 1.3, spot.z);
    this.halo.scale.setScalar(LIGHTHOUSE.haloSize[level]);
  }

  /** Les faisceaux tournent ; la lumière suit l'obscurité du temps, et le halo s'avive quand un faisceau te balaie. */
  update(dt: number, camera: THREE.Camera) {
    const dark = THREE.MathUtils.clamp((LIGHTHOUSE.darkFrom - skyUniforms.uSunlight.value) / LIGHTHOUSE.darkRange, 0, 1);
    this.angle = (this.angle + LIGHTHOUSE.turnSpeed * dt) % (Math.PI * 2);
    this.beams.rotation.y = this.angle;
    this.beams.visible = dark > 0.01;
    this.beamUniforms.uIntensity.value = LIGHTHOUSE.beamIntensity * dark;
    this.lamp.emissiveIntensity = 0.8 + 2.2 * dark;
    // Direction d'un faisceau (+X tourné de `angle`) comparée à la direction de la caméra : deux passages par tour.
    toCamera.subVectors(camera.position, this.halo.position).setY(0).normalize();
    const facing = Math.abs(Math.cos(this.angle) * toCamera.x - Math.sin(this.angle) * toCamera.z);
    const sweep = Math.pow(facing, 24);
    (this.halo.material as THREE.SpriteMaterial).opacity = dark * (0.55 + 0.45 * sweep);
    this.halo.visible = dark > 0.01;
  }
}
