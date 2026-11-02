import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KRAKEN } from '../../config';

/** Rapport du rayon d'un tronçon à celui du précédent : les tronçons s'emboîtent en un cône continu. */
export const TAPER = (KRAKEN.radius[1] / KRAKEN.radius[0]) ** (1 / (KRAKEN.segments - 1));
/** Rayon du tronçon `i` (0 = pied). */
export const radiusAt = (i: number) => KRAKEN.radius[0] * TAPER ** i;
/** Un tronçon dépasse un peu sur le suivant : pas de fente aux coudes. */
const OVERLAP = 1.12;

const SKIN = new THREE.Color(KRAKEN.skin.top);
const BELLY = new THREE.Color(KRAKEN.skin.belly);
const SUCKER = new THREE.Color(KRAKEN.skin.sucker);

function paint(geometry: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) color(pos.getX(i), pos.getY(i), pos.getZ(i)).toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Un tronçon de tentacule, de rayon 1 au pied (y = 0) et TAPER au bout (y = OVERLAP) : peau sombre sur le dos, ventre
 * clair (+Z) portant deux ventouses.
 */
function buildSegment(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(TAPER, 1, OVERLAP, 8, 1, true).toNonIndexed();
  body.translate(0, OVERLAP / 2, 0);
  paint(body, (_x, _y, z) => (z > 0.35 ? BELLY : SKIN));
  const suckers = [0.3, 0.78].map((y) => {
    const disc = new THREE.CylinderGeometry(0.34, 0.4, 0.16, 7).toNonIndexed();
    disc.rotateX(Math.PI / 2);
    disc.translate(0, y, 0.88 - y * 0.08);
    return paint(disc, () => SUCKER);
  });
  const geometry = mergeGeometries([body, ...suckers])!;
  geometry.computeVertexNormals();
  return geometry;
}

const matrix = new THREE.Matrix4();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();
const fallback = new THREE.Vector3();

/**
 * Tous les tronçons de toutes les tentacules du Kraken (et des morceaux tranchés qui coulent) : un seul InstancedMesh,
 * rempli à chaque image (`begin`, `chain`…, `end`). La couleur d'instance teinte la chair blessée.
 */
export class TentacleMesh {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;

  constructor(capacity: number) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(buildSegment(), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin() {
    this.count = 0;
  }

  /**
   * Une chaîne de tronçons le long de `points` (du pied à la pointe), à partir du tronçon `first` (pour le rayon) ;
   * `belly` : direction vers laquelle se tourne le ventre (vers ce qu'elle enserre), `color` : teinte de la chair.
   */
  chain(points: readonly THREE.Vector3[], from: number, to: number, first: number, belly: THREE.Vector3, color: THREE.Color) {
    for (let i = from; i < to && this.count < this.mesh.instanceMatrix.count; i++) {
      const a = points[i];
      const b = points[i + 1];
      axisY.subVectors(b, a);
      const length = axisY.length();
      if (length < 1e-4) continue;
      axisY.divideScalar(length);
      // Le ventre vers `belly`, ramené perpendiculaire au tronçon (sinon une direction quelconque).
      axisZ.copy(belly).addScaledVector(axisY, -belly.dot(axisY));
      if (axisZ.lengthSq() < 1e-6) axisZ.copy(fallback.set(axisY.y, -axisY.x, 0)).addScaledVector(axisY, -fallback.dot(axisY));
      axisZ.normalize();
      axisX.crossVectors(axisY, axisZ);
      const r = radiusAt(first + i - from);
      matrix.makeBasis(axisX.multiplyScalar(r), axisY.multiplyScalar(length), axisZ.multiplyScalar(r));
      matrix.setPosition(a);
      this.mesh.setMatrixAt(this.count, matrix);
      this.mesh.setColorAt(this.count, color);
      this.count++;
    }
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
