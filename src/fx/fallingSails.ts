import * as THREE from 'three';
import { CRIT } from '../config';
import type { Waves } from '../ocean/waves';

interface FallingSail {
  readonly mesh: THREE.Mesh;
  readonly velocity: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly spin: number;
  /** 'fall' : tombe en tournoyant ; 'float' : flotte à la surface ; 'sink' : s'enfonce. */
  phase: 'fall' | 'float' | 'sink';
  time: number;
}

const F = CRIT.sailFall;

/**
 * Voiles abattues par un coup critique au gréement : une copie de la voile (même géométrie, même matériau) quitte le
 * navire, tombe en tournoyant, flotte un moment sur l'eau puis coule. La voile du navire, elle, reste cachée jusqu'à
 * la réparation (ShipCrits).
 */
export class FallingSails {
  private readonly list: FallingSail[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** `sail` : la voile qui vient d'être cachée sur le navire (sa place dans le monde sert de départ). */
  drop(sail: THREE.Object3D) {
    if (!(sail instanceof THREE.Mesh)) return;
    if (this.list.length >= F.max) this.remove(0);
    sail.updateWorldMatrix(true, false);
    const mesh = new THREE.Mesh(sail.geometry, sail.material);
    sail.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.scene.add(mesh);
    const r = () => Math.random() * 2 - 1;
    this.list.push({
      mesh,
      velocity: new THREE.Vector3(r() * F.drift, 0, r() * F.drift),
      axis: new THREE.Vector3(r(), r(), r()).normalize(),
      spin: (0.5 + Math.random() * 0.5) * F.spin * (Math.random() < 0.5 ? -1 : 1),
      phase: 'fall',
      time: 0,
    });
  }

  update(dt: number, waves: Waves) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      const p = f.mesh.position;
      const water = waves.heightAt(p.x, p.z);
      f.time += dt;
      if (f.phase === 'fall') {
        f.velocity.y -= F.gravity * dt;
        p.addScaledVector(f.velocity, dt);
        f.mesh.rotateOnWorldAxis(f.axis, f.spin * dt);
        if (p.y <= water + F.floatHeight) {
          f.phase = 'float';
          f.time = 0;
        }
      } else if (f.phase === 'float') {
        // Elle épouse la houle et dérive doucement.
        p.y += (water + F.floatHeight - p.y) * Math.min(1, dt * 3);
        p.x += f.velocity.x * dt * 0.2;
        p.z += f.velocity.z * dt * 0.2;
        if (f.time > F.float) {
          f.phase = 'sink';
          f.time = 0;
        }
      } else {
        p.y -= F.sinkSpeed * dt;
        if (f.time > F.sink) this.remove(i);
      }
    }
  }

  private remove(i: number) {
    this.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }
}
