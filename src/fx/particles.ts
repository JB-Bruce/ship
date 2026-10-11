import * as THREE from 'three';
import type { Waves } from '../ocean/waves';

/** Description d'une particule à émettre. Les effets réutilisent un seul objet (pas d'allocation). */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** Taille au départ puis à la fin de vie (la particule rétrécit ensuite jusqu'à disparaître). */
  size: number;
  sizeEnd: number;
  color: THREE.Color;
  gravity: number;
  /** Freinage par l'air (1/s). */
  drag: number;
  /** Étirement selon (x, y, z) : (1, 1, 1) = bouffée ronde, allongé = éclat de bois. */
  shapeX: number;
  shapeY: number;
  shapeZ: number;
  /** Vitesse de rotation (rad/s). */
  spin: number;
  /** Colle à la surface de l'eau (écume, sillage). */
  onWater: boolean;
  /** Particule d'eau : elle disparaît si elle entre dans une coque (voir le test passé à update). */
  water: boolean;
}

/** Test « cette particule est-elle dans une coque ? » fourni par les effets. */
export type HullTest = (x: number, y: number, z: number, onWater: boolean) => boolean;

export function createSpec(): ParticleSpec {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, sizeEnd: 1,
    color: new THREE.Color(), gravity: 0, drag: 0, shapeX: 1, shapeY: 1, shapeZ: 1, spin: 0, onWater: false, water: false,
  };
}

/** Part des particules demandées qui sont vraiment émises (réglage graphique, 0..1). */
export const particleBudget = { density: 1 };

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();
const color = new THREE.Color();

/**
 * Particules low-poly : un seul InstancedMesh (un appel de rendu pour toutes).
 * Pas de transparence : les particules rétrécissent au lieu de s'estomper, ce qui colle au style low-poly.
 */
export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rot: Float32Array;
  private readonly shape: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly sizeEnd: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly spin: Float32Array;
  private readonly onWater: Uint8Array;
  private readonly water: Uint8Array;

  constructor(
    material: THREE.Material,
    private readonly capacity: number,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const f3 = () => new Float32Array(capacity * 3);
    const f1 = () => new Float32Array(capacity);
    [this.pos, this.vel, this.rot, this.shape] = [f3(), f3(), f3(), f3()];
    [this.age, this.life, this.size, this.sizeEnd, this.gravity, this.drag, this.spin] = [f1(), f1(), f1(), f1(), f1(), f1(), f1()];
    this.onWater = new Uint8Array(capacity);
    this.water = new Uint8Array(capacity);
  }

  spawn(s: ParticleSpec) {
    if (this.count >= this.capacity || (particleBudget.density < 1 && Math.random() > particleBudget.density)) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos.set([s.x, s.y, s.z], i3);
    this.vel.set([s.vx, s.vy, s.vz], i3);
    this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i3);
    this.shape.set([s.shapeX, s.shapeY, s.shapeZ], i3);
    this.age[i] = 0;
    this.life[i] = s.life;
    this.size[i] = s.size;
    this.sizeEnd[i] = s.sizeEnd;
    this.gravity[i] = s.gravity;
    this.drag[i] = s.drag;
    this.spin[i] = s.spin;
    this.onWater[i] = s.onWater ? 1 : 0;
    this.water[i] = s.water ? 1 : 0;
    this.mesh.setColorAt(i, s.color);
  }

  update(dt: number, waves: Waves, insideHull?: HullTest) {
    const { pos, vel, rot } = this;
    for (let i = 0; i < this.count; ) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.removeAt(i);
        continue;
      }
      const i3 = i * 3;
      const keep = Math.exp(-this.drag[i] * dt);
      vel[i3] *= keep;
      vel[i3 + 1] = vel[i3 + 1] * keep - this.gravity[i] * dt;
      vel[i3 + 2] *= keep;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (this.onWater[i]) pos[i3 + 1] = waves.heightAt(pos[i3], pos[i3 + 2]) + 0.06;
      if (this.water[i] && insideHull?.(pos[i3], pos[i3 + 1], pos[i3 + 2], this.onWater[i] === 1)) {
        this.removeAt(i);
        continue;
      }
      const spin = this.spin[i] * dt;
      rot[i3] += spin;
      rot[i3 + 1] += spin * 0.7;

      // Taille interpolée, puis rétrécissement sur le dernier tiers de vie.
      const t = this.age[i] / this.life[i];
      let s = this.size[i] + (this.sizeEnd[i] - this.size[i]) * t;
      if (t > 0.65) s *= 1 - (t - 0.65) / 0.35;
      // Les particules posées sur l'eau restent à plat.
      if (this.onWater[i]) euler.set(0, rot[i3 + 1], 0);
      else euler.set(rot[i3], rot[i3 + 1], rot[i3 + 2]);
      matrix.compose(
        position.set(pos[i3], pos[i3 + 1], pos[i3 + 2]),
        quaternion.setFromEuler(euler),
        scale.set(this.shape[i3] * s, this.shape[i3 + 1] * s, this.shape[i3 + 2] * s),
      );
      this.mesh.setMatrixAt(i, matrix);
      i++;
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Retire la particule i en la remplaçant par la dernière (ordre sans importance). */
  private removeAt(i: number) {
    const last = --this.count;
    if (i === last) return;
    const [i3, l3] = [i * 3, last * 3];
    for (const arr of [this.pos, this.vel, this.rot, this.shape]) arr.copyWithin(i3, l3, l3 + 3);
    for (const arr of [this.age, this.life, this.size, this.sizeEnd, this.gravity, this.drag, this.spin]) arr[i] = arr[last];
    this.onWater[i] = this.onWater[last];
    this.water[i] = this.water[last];
    this.mesh.getColorAt(last, color);
    this.mesh.setColorAt(i, color);
  }
}
