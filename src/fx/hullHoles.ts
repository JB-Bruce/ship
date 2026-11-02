import * as THREE from 'three';
import { FEEDBACK } from '../config';
import type { Ship } from '../ship/ship';
import { waterMaskMaterial } from '../ship/parts/common';

const H = FEEDBACK.holes;

/** Un trou de boulet : un cœur noir déchiqueté et une couronne d'éclats de bois clair, dans le plan XY (normale +Z). */
function holeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const dark = new THREE.Color(0x140d08);
  const light = new THREE.Color(0xa47a4c);
  const n = 9;
  const ring = (k: number, r: number) => [Math.cos((k / n) * Math.PI * 2) * r, Math.sin((k / n) * Math.PI * 2) * r];
  // Rayons irréguliers, fixes (même dessin pour tous les trous, tournés et mis à l'échelle au hasard).
  const inner = [0.42, 0.5, 0.38, 0.47, 0.52, 0.4, 0.46, 0.36, 0.5];
  const outer = [0.72, 0.6, 0.8, 0.58, 0.75, 0.66, 0.84, 0.62, 0.7];
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
  };
  for (let k = 0; k < n; k++) {
    const [ax, ay] = ring(k, inner[k]);
    const [bx, by] = ring(k + 1, inner[(k + 1) % n]);
    push(0, 0, 0.004, dark);
    push(ax, ay, 0.004, dark);
    push(bx, by, 0.004, dark);
    // Éclats : une pointe claire entre deux rayons du cœur.
    const [cx, cy] = ring(k + 0.5, outer[k]);
    push(ax, ay, 0, light);
    push(cx, cy, 0, light);
    push(bx, by, 0, light);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const geometry = holeGeometry();
const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const local = new THREE.Vector3();
const normal = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const twist = new THREE.Quaternion();
const scale = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const inverse = new THREE.Matrix4();
const hits: THREE.Intersection[] = [];

interface ShipHoles {
  mesh: THREE.InstancedMesh;
  /** Matrices des trous posés, du plus ancien au plus récent. */
  holes: THREE.Matrix4[];
}

/**
 * Trous de boulets sur les coques : là où un boulet frappe un navire proche de la caméra, on cherche le bordé (rayon
 * lancé de l'extérieur vers le point d'impact) et on y pose un trou, dans le repère du navire (il suit la coque). Au
 * plus FEEDBACK.holes.max par navire ; ils se referment à mesure que la vie remonte (réparation), les plus anciens
 * d'abord. Un `InstancedMesh` par navire touché, rangé dans son modèle (l'équipage ne le voit pas : les instances
 * sont ignorées par la grille du pont).
 */
export class HullHoles {
  private readonly ships = new Map<Ship, ShipHoles>();

  /** Un boulet a touché `ship` en `point` (monde), venant de la direction `from` (vecteur vitesse du boulet). */
  add(ship: Ship, point: THREE.Vector3, velocity: THREE.Vector3, camera: THREE.Camera) {
    if (!ship.alive || point.distanceTo(camera.position) > H.range) return;
    const root = ship.model.root;
    root.updateMatrixWorld();
    // Le rayon part d'en dehors du navire, à l'opposé du boulet, et revient vers le point d'impact.
    dir.copy(velocity).setY(0).normalize();
    if (dir.lengthSq() < 0.5) return;
    origin.copy(point).addScaledVector(dir, -ship.stats.width * 1.5);
    raycaster.set(origin, dir);
    raycaster.far = ship.stats.width * 2;
    hits.length = 0;
    raycaster.intersectObject(root, true, hits);
    const hit = hits.find((h) => this.solid(h.object));
    if (!hit?.face) return;
    // Repère du navire : position du trou, normale du bordé.
    inverse.copy(root.matrixWorld).invert();
    local.copy(hit.point).applyMatrix4(inverse);
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(inverse);
    if (normal.dot(dir.clone().transformDirection(inverse)) > 0) normal.negate();
    quat.setFromUnitVectors(Z, normal);
    twist.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    quat.multiply(twist);
    // Un trou plus petit sur une petite coque (référence : un navire de 20 m).
    const size = Math.min(1, Math.max(0.5, ship.stats.length / H.refLength));
    scale.setScalar((H.size[0] + Math.random() * (H.size[1] - H.size[0])) * size);
    const entry = this.ships.get(ship) ?? this.create(ship);
    entry.holes.push(new THREE.Matrix4().compose(local.addScaledVector(normal, 0.01), quat, scale));
    if (entry.holes.length > H.max) entry.holes.shift();
    this.write(entry);
  }

  /** Les trous se referment quand la vie remonte ; ceux d'un navire qui a quitté le monde sont oubliés. */
  update(ships: readonly Ship[]) {
    for (const [ship, entry] of this.ships) {
      if (!ships.includes(ship)) {
        entry.mesh.removeFromParent();
        entry.mesh.dispose();
        this.ships.delete(ship);
        continue;
      }
      if (!ship.alive) continue;
      const keep = Math.ceil(H.max * Math.min(1, ship.damageLevel / H.fullAt));
      if (entry.holes.length <= keep) continue;
      entry.holes.splice(0, entry.holes.length - keep);
      this.write(entry);
    }
  }

  private create(ship: Ship): ShipHoles {
    const mesh = new THREE.InstancedMesh(geometry, material, H.max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    ship.model.root.add(mesh);
    const entry = { mesh, holes: [] };
    this.ships.set(ship, entry);
    return entry;
  }

  private write(entry: ShipHoles) {
    entry.holes.forEach((m, i) => entry.mesh.setMatrixAt(i, matrix.copy(m)));
    entry.mesh.count = entry.holes.length;
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Une pièce pleine du navire (pas une voile, un pavillon, le masque d'eau, ni un trou déjà posé). */
  private solid(object: THREE.Object3D): boolean {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || !mesh.visible) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return !materials.some((m) => m === waterMaskMaterial || m.userData.sail || m.userData.flag || !m.visible);
  }
}
