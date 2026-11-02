import * as THREE from 'three';
import { STORY_QUEST } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';

const R = STORY_QUEST.relic;

/**
 * Un objet de l'histoire qui flotte, à repêcher en passant tout près (le médaillon des fanaux verts) : un disque doré
 * dans un anneau, qui danse sur la vague et tourne doucement. `update` dit quand le navire piloté l'a pris.
 */
export class FloatingRelic {
  readonly group = new THREE.Group();
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly waves: Waves,
    readonly x: number,
    readonly z: number,
  ) {
    const gold = new THREE.MeshLambertMaterial({ color: 0xd9a514, emissive: 0x3a2a04, flatShading: true });
    const green = new THREE.MeshLambertMaterial({ color: 0x5aa070, emissive: 0x1c4a2a, flatShading: true });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R.size * 0.5, R.size * 0.5, 0.12, 10), gold);
    disc.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R.size * 0.62, 0.07, 4, 14), gold);
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(R.size * 0.18), green);
    stone.position.z = 0.08;
    const float = new THREE.Mesh(new THREE.CylinderGeometry(R.size * 0.9, R.size, 0.3, 7), new THREE.MeshLambertMaterial({ color: 0x6a4626, flatShading: true }));
    float.position.y = -R.size * 0.75;
    this.group.add(disc, ring, stone, float);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** Renvoie vrai quand `leader` passe assez près : l'objet est pris (et retiré de la scène). */
  update(dt: number, leader: Ship): boolean {
    this.time += dt;
    const g = this.group;
    g.position.y = this.waves.heightAt(this.x, this.z) + R.size * 0.7 + Math.sin(this.time * 2) * R.bob;
    g.rotation.y += R.spin * dt;
    if (!leader.alive || Math.hypot(leader.position.x - this.x, leader.position.z - this.z) > R.reach + leader.stats.length / 2) return false;
    this.remove();
    return true;
  }

  remove() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
