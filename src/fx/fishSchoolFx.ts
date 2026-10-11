import * as THREE from 'three';
import { FISHING } from '../config';
import type { Waves } from '../ocean/waves';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { FishSchool } from '../world/fishSchools';

/** Un poisson qui saute : il attend sous l'eau, puis décrit une petite parabole. */
interface Jump {
  wait: number;
  t: number;
  duration: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  length: number;
  height: number;
}

const MAX_SCHOOLS = FISHING.schools[1];
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const scale = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

function fishGeometry(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.OctahedronGeometry(0.5), tf(0, 0, 0, 0, 0, 0, [0.07, 0.11, 0.28]));
  batch.add(key, new THREE.ConeGeometry(0.09, 0.14, 3), tf(0, 0, -0.17, -Math.PI / 2, 0, 0, [0.3, 1, 1]));
  return batch.build()[0].geometry;
}

/** Mouette : un corps et deux ailes en V (le battement est un écrasement vertical de l'instance). */
function gullGeometry(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.BoxGeometry(0.16, 0.14, 0.55), tf(0, 0, 0));
  batch.add(key, new THREE.BoxGeometry(0.12, 0.08, 0.12), tf(0, 0.06, 0.3));
  for (const side of [1, -1]) batch.add(key, new THREE.BoxGeometry(0.75, 0.03, 0.24), tf(side * 0.42, 0.12, 0, 0, 0, side * 0.32));
  return batch.build()[0].geometry;
}

/**
 * Ce qui trahit un banc de loin : de petits poissons argentés qui bondissent hors de l'eau et des mouettes qui
 * tournent au-dessus. Une InstancedMesh par espèce pour tous les bancs. (Le remous est peint dans les traces d'eau.)
 */
export class FishSchoolFx {
  readonly group = new THREE.Group();
  private readonly fish: THREE.InstancedMesh;
  private readonly gulls: THREE.InstancedMesh;
  private readonly jumps = new WeakMap<FishSchool, Jump[]>();
  private time = 0;

  constructor() {
    const silver = new THREE.MeshStandardMaterial({ color: 0xb9c6cf, flatShading: true, roughness: 0.35, metalness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f0ea, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    this.fish = new THREE.InstancedMesh(fishGeometry(), silver, MAX_SCHOOLS * FISHING.jumpers);
    this.gulls = new THREE.InstancedMesh(gullGeometry(), white, MAX_SCHOOLS * FISHING.gulls);
    for (const mesh of [this.fish, this.gulls]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  update(dt: number, schools: readonly FishSchool[], waves: Waves) {
    this.time += dt;
    for (let i = 0; i < MAX_SCHOOLS; i++) {
      const school = schools[i];
      for (let j = 0; j < FISHING.jumpers; j++) {
        const index = i * FISHING.jumpers + j;
        this.fish.setMatrixAt(index, school ? this.jumpMatrix(school, j, dt, waves) : HIDDEN);
      }
      for (let j = 0; j < FISHING.gulls; j++) {
        const index = i * FISHING.gulls + j;
        this.gulls.setMatrixAt(index, school ? this.gullMatrix(school, j) : HIDDEN);
      }
    }
    this.fish.instanceMatrix.needsUpdate = true;
    this.gulls.instanceMatrix.needsUpdate = true;
  }

  private jumpMatrix(school: FishSchool, j: number, dt: number, waves: Waves): THREE.Matrix4 {
    let jumps = this.jumps.get(school);
    if (!jumps) {
      jumps = Array.from({ length: FISHING.jumpers }, () => this.newJump(school, rand(0, 3)));
      this.jumps.set(school, jumps);
    }
    const jump = jumps[j];
    if (jump.wait > 0) {
      jump.wait -= dt;
      return HIDDEN;
    }
    jump.t += dt;
    const s = jump.t / jump.duration;
    if (s >= 1) {
      // Un banc qui plonge ne saute plus.
      jumps[j] = this.newJump(school, school.diving ? Infinity : rand(0.3, 2.2));
      return HIDDEN;
    }
    const x = jump.x + jump.dirX * jump.length * s;
    const z = jump.z + jump.dirZ * jump.length * s;
    position.set(x, waves.heightAt(x, z) - 0.25 + jump.height * 4 * s * (1 - s), z);
    // Le poisson suit sa trajectoire : nez en l'air à la montée, vers l'eau à la descente.
    euler.set(-Math.atan2(jump.height * 4 * (1 - 2 * s), jump.length), Math.atan2(jump.dirX, jump.dirZ), 0);
    return matrix.compose(position, quaternion.setFromEuler(euler), scale.setScalar(school.fade));
  }

  private newJump(school: FishSchool, wait: number): Jump {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * FISHING.radius * 0.8;
    const dir = Math.random() * Math.PI * 2;
    return {
      wait,
      t: 0,
      duration: rand(0.55, 0.85),
      x: school.x + Math.sin(a) * r,
      z: school.z + Math.cos(a) * r,
      dirX: Math.sin(dir),
      dirZ: Math.cos(dir),
      length: rand(1.2, 2.2),
      height: rand(0.6, 1.3),
    };
  }

  /** Mouettes en ronde au-dessus du banc ; elles s'élèvent et s'en vont quand le banc plonge. */
  private gullMatrix(school: FishSchool, j: number): THREE.Matrix4 {
    const k = school.seed * 13.7 + j * 2.399;
    const direction = j % 2 === 0 ? 1 : -1;
    const speed = 0.35 + 0.15 * Math.sin(k);
    const radius = 7 + 6 * (0.5 + 0.5 * Math.sin(k * 1.7));
    const angle = k + direction * speed * this.time;
    const [low, high] = FISHING.gullHeight;
    const y = low + (high - low) * (0.5 + 0.5 * Math.sin(k * 3.1 + this.time * 0.4)) + (1 - school.fade) * 25;
    position.set(school.x + Math.sin(angle) * radius, y, school.z + Math.cos(angle) * radius);
    // Cap tangent au cercle, penchée vers l'intérieur du virage.
    euler.set(0, angle + direction * Math.PI / 2, direction * 0.35);
    // Battements par séries, puis vol plané.
    const flapping = Math.sin(this.time * 0.7 + k) > -0.2;
    const flap = flapping ? Math.cos(this.time * 9 + k * 5) : 0.85;
    return matrix.compose(position, quaternion.setFromEuler(euler), scale.set(1, flap, 1));
  }
}
