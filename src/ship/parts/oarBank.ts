import * as THREE from 'three';
import { OARS } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { HullShape } from './hullShape';
import type { Palette } from './props';

/** Avirons d'un type (chébec, galéasse) : hauteur des sabords d'aviron (m), longueur hors bord et en dedans, pale. */
export interface OarSpec {
  y: number;
  outboard: number;
  inboard: number;
  blade: { length: number; width: number };
}

/** Aviron le long de +X : manche depuis `-inboard` (dedans) jusqu'à la pale, au bout de `outboard`. */
export function buildOarGeometry(spec: OarSpec): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  const { blade } = spec;
  const shaft = spec.inboard + spec.outboard - blade.length / 2;
  batch.add(key, new THREE.CylinderGeometry(0.04, 0.05, shaft, 5), tf(shaft / 2 - spec.inboard, 0, 0, 0, 0, -Math.PI / 2));
  batch.add(key, new THREE.BoxGeometry(blade.length, blade.width, 0.04), tf(spec.outboard - blade.length / 2, 0, 0));
  return batch.build()[0].geometry;
}

// Objets réutilisés à chaque image pour poser les avirons (pas d'allocation dans la boucle).
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YZX');
const scale = new THREE.Vector3(1, 1, 1);

/**
 * Avirons d'un navire : un lot par navire (bâbord puis tribord). Ils sortent de leurs sabords (s'allongent) et nagent en
 * cadence, la pale dans l'eau en allant vers l'arrière, levée au retour ; rentrés, le lot est caché.
 */
export class OarBank {
  readonly mesh: THREE.InstancedMesh;
  /** Sabords (repère du bateau), dans l'ordre des instances, et bord (+1 bâbord, -1 tribord). */
  private readonly ports: { x: number; z: number; side: number }[] = [];
  /** Inclinaison des avirons au repos de la nage : de leur sabord jusqu'à l'eau (rad). */
  private readonly droop: number;
  /** Rames sorties (0..1) et phase de la nage (rad). */
  private out = 0;
  private stroke = 0;

  /** `zs` : z des sabords d'aviron (de l'arrière vers l'avant), sur les deux bords de `hull`. */
  constructor(
    hull: HullShape,
    zs: readonly number[],
    private readonly spec: OarSpec,
    geometry: THREE.BufferGeometry,
    palette: Palette,
  ) {
    for (const side of [1, -1]) {
      for (const z of zs) {
        const s = hull.stationAt(z / hull.halfLength);
        this.ports.push({ x: side * hull.halfWidthAt(s, spec.y), z, side });
      }
    }
    this.droop = -Math.asin((spec.y + 0.15) / spec.outboard);
    this.mesh = new THREE.InstancedMesh(geometry, palette.wood, this.ports.length);
    // Les instances bougent sans cesse : la sphère englobante calculée une fois serait fausse.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** 0 = rentrés, 1 = sortis. */
  setOut(out: number) {
    this.out = out;
  }

  update(dt: number) {
    const out = this.out;
    this.mesh.visible = out > 0.02;
    if (!this.mesh.visible) return;
    this.stroke = (this.stroke + dt * OARS.strokeRate * Math.PI * 2) % (Math.PI * 2);
    // Balayage : la pale va vers l'arrière quand le sinus croît (cosinus positif), et c'est là qu'elle est dans l'eau.
    const sweep = OARS.sweep * Math.sin(this.stroke) * out;
    const tilt = this.droop + (OARS.lift * (1 - Math.cos(this.stroke))) / 2;
    scale.x = out;
    for (let i = 0; i < this.ports.length; i++) {
      const { x, z, side } = this.ports[i];
      position.set(x, this.spec.y, z);
      euler.set(0, side > 0 ? sweep : Math.PI - sweep, tilt);
      matrix.compose(position, rotation.setFromEuler(euler), scale);
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.dispose();
  }
}
