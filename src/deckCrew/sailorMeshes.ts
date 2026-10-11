import * as THREE from 'three';
import { std } from '../ship/parts/common';

/** Parties d'un marin : chacune est dessinée en un seul lot pour tous les marins du monde. */
export type SailorPart = 'torso' | 'head' | 'arm' | 'hand' | 'leg' | 'tricorn' | 'bandana';

/** Instances de chaque partie par marin. */
const PER_SAILOR: Record<SailorPart, number> = { torso: 1, head: 1, arm: 2, hand: 2, leg: 2, tricorn: 1, bandana: 1 };

const SKIN = 0xd9a37a;
const PANTS = 0x3a3a50;
const DARK = 0x2b2118;
const BANDANA = 0xb3261e;

/** Peint une géométrie d'une couleur unie (attribut `color`, en espace linéaire). */
function painted(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const array = new Float32Array(total * 3);
    let offset = 0;
    for (const g of parts) {
      array.set(g.attributes[name].array as Float32Array, offset);
      offset += g.attributes[name].count * 3;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, 3));
  }
  return out;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) =>
  painted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

/**
 * Géométries, dans le repère de leur articulation : torse et ceinture depuis la hanche, tête centrée, bras et main
 * pendant de l'épaule, jambe et botte pendant de la hanche, coiffes posées sur la tête. Les couleurs fixes sont peintes
 * dans la géométrie ; la chemise (torse, bras) vient de la couleur de chaque instance (blanc dans la géométrie).
 */
function buildGeometries(): Record<SailorPart, THREE.BufferGeometry> {
  return {
    torso: merged([box(0.34, 0.44, 0.2, 0, 0.26, -0.02, 0xffffff), box(0.35, 0.06, 0.21, 0, 0.06, -0.02, DARK)]),
    head: painted(new THREE.IcosahedronGeometry(0.13, 1), SKIN),
    arm: box(0.09, 0.38, 0.1, 0, -0.19, 0, 0xffffff),
    hand: box(0.08, 0.08, 0.08, 0, -0.42, 0, SKIN),
    leg: merged([box(0.13, 0.55, 0.13, 0, -0.275, 0, PANTS), box(0.14, 0.1, 0.2, 0, -0.55, 0.03, DARK)]),
    tricorn: merged([
      painted(new THREE.ConeGeometry(0.22, 0.1, 3).translate(0, 0.14, 0), DARK),
      painted(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 6).translate(0, 0.18, 0), DARK),
    ]),
    bandana: merged([
      painted(new THREE.CylinderGeometry(0.135, 0.135, 0.09, 6).translate(0, 0.06, 0), BANDANA),
      box(0.08, 0.08, 0.1, 0, 0.04, -0.15, BANDANA),
    ]),
  };
}

/**
 * Tous les marins animés du monde, en un lot de dessin par partie (7 au total). Chaque image : begin(), une place par
 * partie de chaque marin dessiné (put), puis end(). Pas de tri spatial : les lots ne sont jamais écartés par la caméra.
 */
export class SailorMeshes {
  readonly group = new THREE.Group();
  private readonly meshes = {} as Record<SailorPart, THREE.InstancedMesh>;
  private readonly counts = { torso: 0, head: 0, arm: 0, hand: 0, leg: 0, tricorn: 0, bandana: 0 } as Record<SailorPart, number>;

  constructor(maxSailors: number) {
    const geometries = buildGeometries();
    const material = std(0xffffff, { vertexColors: true });
    for (const part of Object.keys(geometries) as SailorPart[]) {
      const mesh = new THREE.InstancedMesh(geometries[part], material, maxSailors * PER_SAILOR[part]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      // Couleur par instance : la chemise pour le torse et les bras, blanc (sans effet) ailleurs.
      for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setColorAt(i, WHITE);
      this.meshes[part] = mesh;
      this.group.add(mesh);
    }
  }

  begin() {
    for (const part in this.counts) this.counts[part as SailorPart] = 0;
  }

  /** Place une partie (matrice monde) ; `color` = chemise (torse, bras). Ignorée si le lot est plein. */
  put(part: SailorPart, matrix: THREE.Matrix4, color?: THREE.Color) {
    const mesh = this.meshes[part];
    const i = this.counts[part];
    if (i >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(i, matrix);
    if (color) mesh.setColorAt(i, color);
    this.counts[part] = i + 1;
  }

  end() {
    for (const part in this.counts) {
      const mesh = this.meshes[part as SailorPart];
      mesh.count = this.counts[part as SailorPart];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

const WHITE = new THREE.Color(0xffffff);
