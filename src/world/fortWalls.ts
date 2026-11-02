import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { StarShape } from './fortLayouts';

/** Fruit des murs : le pied est plus large que le sommet (escarpe en talus). */
const TALUS = 1.08;
const PARAPET = { height: 0.75, thickness: 0.8 };
/** Cordon : saillie (part du rayon) et hauteur (m) du bandeau au sommet de l'escarpe. */
const CORDON = { overhang: 0.012, height: 0.5 };

export interface FortMaterials {
  stone: THREE.Material;
  darkStone: THREE.Material;
  floor: THREE.Material;
  wood: THREE.Material;
  roof: THREE.Material;
  slate: THREE.Material;
  whitewash: THREE.Material;
  shadow: THREE.Material;
}

let materials: FortMaterials | null = null;

/** Matériaux communs à tous les forts (créés une fois). */
export function fortMaterials(): FortMaterials {
  materials ??= {
    stone: std(0x8f8a80, { roughness: 1 }),
    darkStone: std(0x6f6a62, { roughness: 1 }),
    floor: std(0x9d9587, { roughness: 1 }),
    wood: std(0x6b4a30),
    roof: std(0x8a3a22),
    slate: std(0x3e4a5e),
    whitewash: std(0xd9cfb8),
    shadow: std(0x2b2118),
  };
  return materials;
}

/** Point à `radius` m du centre (cx, cz), dans la direction `angle` (cap). */
export function around(cx: number, cz: number, angle: number, radius: number): THREE.Vector3 {
  return new THREE.Vector3(cx + Math.sin(angle) * radius, 0, cz + Math.cos(angle) * radius);
}

/** Tracé d'une enceinte en étoile autour de (cx, cz), bastion n° 0 dans la direction `sea` : en tournant autour du centre. */
export function starOutline(cx: number, cz: number, sea: number, shape: StarShape): THREE.Vector3[] {
  const step = (Math.PI * 2) / shape.bastions;
  const { tip, shoulder, curtain } = shape;
  const outline: THREE.Vector3[] = [];
  for (let i = 0; i < shape.bastions; i++) {
    const axis = sea + i * step;
    for (const [da, r] of [[-curtain.angle, curtain.radius], [-shoulder.angle, shoulder.radius], [0, tip], [shoulder.angle, shoulder.radius], [curtain.angle, curtain.radius]]) {
      outline.push(around(cx, cz, axis + da, r));
    }
  }
  return outline;
}

/** Murs de l'enceinte, en talus : du pied (plus large, sous terre) jusqu'au terre-plein. Faces tournées vers l'extérieur. */
export function walls(outline: readonly THREE.Vector3[], cx: number, cz: number, bottom: number, top: number, talus = TALUS): THREE.BufferGeometry {
  const positions: number[] = [];
  const foot = (p: THREE.Vector3) => new THREE.Vector3(cx + (p.x - cx) * talus, bottom, cz + (p.z - cz) * talus);
  const high = (p: THREE.Vector3) => new THREE.Vector3(p.x, top, p.z);
  const normal = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  // Sens de parcours du tracé (aire signée) : il donne, pour chaque côté, la normale qui sort du fort.
  let area = 0;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    area += p.x * q.z - q.x * p.z;
  });
  const turn = Math.sign(area);
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outX: number, outZ: number) => {
    normal.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const [p, q, r] = normal.x * outX + normal.z * outZ >= 0 ? [a, b, c] : [a, c, b];
    positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const outX = (b.z - a.z) * turn;
    const outZ = -(b.x - a.x) * turn;
    triangle(foot(a), foot(b), high(b), outX, outZ);
    triangle(foot(a), high(b), high(a), outX, outZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Terre-plein : le sommet de l'enceinte, dallé. */
export function platform(outline: readonly THREE.Vector3[], top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, top, 0);
  return geometry;
}

/**
 * Enceinte complète au-dessus de `bottom` : murs en talus, terre-plein à `top`, parapet le long de chaque côté (un peu
 * en retrait du bord, bandeau sombre sur le dessus) et, en option, le cordon de pierre au sommet de l'escarpe.
 */
export function addRampart(batch: GeometryBatch, m: FortMaterials, outline: readonly THREE.Vector3[], cx: number, cz: number, bottom: number, top: number, cordon: boolean) {
  const identity = new THREE.Matrix4();
  batch.add(m.stone, walls(outline, cx, cz, bottom, top), identity);
  batch.add(m.floor, platform(outline, top), identity);
  if (cordon) {
    const wide = outline.map((p) => new THREE.Vector3(cx + (p.x - cx) * (1 + CORDON.overhang), 0, cz + (p.z - cz) * (1 + CORDON.overhang)));
    batch.add(m.darkStone, walls(wide, cx, cz, top - CORDON.height - 0.15, top - 0.15, 1), identity);
  }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const length = a.distanceTo(b) + PARAPET.thickness * 0.7;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const inward = new THREE.Vector3(cx - mid.x, 0, cz - mid.z).normalize().multiplyScalar(PARAPET.thickness / 2);
    batch.add(m.stone, new THREE.BoxGeometry(PARAPET.thickness, PARAPET.height, length), tf(mid.x + inward.x, top + PARAPET.height / 2, mid.z + inward.z, 0, yaw));
    batch.add(m.darkStone, new THREE.BoxGeometry(PARAPET.thickness + 0.12, 0.12, length), tf(mid.x + inward.x, top + PARAPET.height + 0.06, mid.z + inward.z, 0, yaw));
  }
}

/** Guérite à la pointe d'un bastion (axe `axis`) : petite tour ronde coiffée d'un dôme, fente de guet vers le dehors. */
export function addSentry(batch: GeometryBatch, m: FortMaterials, p: THREE.Vector3, top: number, axis: number, scale = 1) {
  batch.add(m.stone, new THREE.CylinderGeometry(0.75 * scale, 0.6 * scale, 2 * scale, 8), tf(p.x, top + scale, p.z));
  batch.add(m.darkStone, new THREE.SphereGeometry(0.85 * scale, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), tf(p.x, top + 2 * scale, p.z));
  const out = 0.68 * scale;
  batch.add(m.shadow, new THREE.BoxGeometry(0.4 * scale, 0.6 * scale, 0.1), tf(p.x + Math.sin(axis) * out, top + 1.3 * scale, p.z + Math.cos(axis) * out, 0, axis, 0));
}
