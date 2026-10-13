import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import { land } from './island';

const DEG = Math.PI / 180;

/** Plan d'un fort bastionné. Angles par rapport à l'axe de chaque bastion, rayons depuis le centre (m). */
export interface FortLayout {
  bastions: number;
  /** Pointe d'un bastion, ses épaules et le départ des courtines. */
  tip: number;
  shoulder: { angle: number; radius: number };
  curtain: { angle: number; radius: number };
  /** Bastions sans canons (côté terre), qui portent une guérite. Le n° 0 pointe vers le large. */
  landward: readonly number[];
  /** Hauteur du terre-plein au-dessus du point le plus haut du terrain sous le fort (m). */
  wallHeight: number;
  /** Emplacements des canons, dans l'ordre de mise en service : [angle depuis l'axe côté mer, rayon]. */
  gunSlots: readonly (readonly [number, number])[];
  /** Tour de guet centrale : côté et hauteur (m). */
  tower: { size: number; height: number };
  /** Distance de la caserne au centre, côté terre (m). */
  barracks: number;
}

export const FORT_LAYOUTS = {
  /** Fort de la Tortue : 5 bastions, jusqu'à 5 canons (bastions des flancs, de pointe, puis courtines côté mer). */
  fort: {
    bastions: 5,
    tip: 12.5,
    shoulder: { angle: 11 * DEG, radius: 9.6 },
    curtain: { angle: 21 * DEG, radius: 8 },
    landward: [2, 3],
    wallHeight: 3.8,
    gunSlots: [[72 * DEG, 8.8], [-72 * DEG, 8.8], [0, 8.8], [36 * DEG, 6.7], [-36 * DEG, 6.7]],
    tower: { size: 4, height: 5 },
    barracks: 5.4,
  },
  /** Citadelle de Port-Sabre : 6 bastions, plus haute et plus large, jusqu'à 8 canons. */
  citadel: {
    bastions: 6,
    tip: 16,
    shoulder: { angle: 9 * DEG, radius: 12.4 },
    curtain: { angle: 18 * DEG, radius: 10.4 },
    landward: [3],
    wallHeight: 5.5,
    gunSlots: [
      [60 * DEG, 11.6], [-60 * DEG, 11.6], [0, 11.6], [30 * DEG, 8.9],
      [-30 * DEG, 8.9], [120 * DEG, 11.6], [-120 * DEG, 11.6], [90 * DEG, 8.9],
    ],
    tower: { size: 5.5, height: 7 },
    barracks: 7,
  },
  /** Fort-Royal (Marine) : 8 bastions, le plus grand et le plus haut, jusqu'à 11 canons (par paires autour de l'axe). */
  royal: {
    bastions: 8,
    tip: 21,
    shoulder: { angle: 7 * DEG, radius: 16.5 },
    curtain: { angle: 14 * DEG, radius: 14 },
    landward: [4],
    wallHeight: 7,
    gunSlots: [
      [0, 16.2], [45 * DEG, 16.2], [-45 * DEG, 16.2], [22.5 * DEG, 11.6], [-22.5 * DEG, 11.6], [90 * DEG, 16.2],
      [-90 * DEG, 16.2], [67.5 * DEG, 11.6], [-67.5 * DEG, 11.6], [135 * DEG, 16.2], [-135 * DEG, 16.2],
    ],
    tower: { size: 7, height: 9 },
    barracks: 9.5,
  },
} satisfies Record<string, FortLayout>;

/** Pied des murs, sous le point le plus bas du terrain (ou de la mer) sous le fort (m). */
const WALL_FOOT_DEPTH = 3;
/** Fruit des murs : le pied est plus large que le sommet (escarpe en talus). */
const TALUS = 1.08;
const PARAPET = { height: 0.75, thickness: 0.8 };
/** Plateforme de tir (barbette) sous chaque canon : le fût passe au-dessus du parapet. */
export const BARBETTE = { radius: 1.4, height: 0.5 };

export interface GunSlot {
  readonly position: THREE.Vector3;
  /** Cap de repos du canon : vers le large, dans l'axe de son emplacement. */
  readonly restYaw: number;
  readonly barbette: THREE.Mesh;
}

export interface FortModel {
  readonly group: THREE.Group;
  readonly slots: readonly GunSlot[];
  /** Pied du mât du pavillon, en haut de la tour de guet. */
  readonly flagBase: THREE.Vector3;
  /** Volume approximatif de l'enceinte (pour les boulets d'un siège) : centre, rayon, bas et haut (m). */
  readonly bounds: { x: number; z: number; radius: number; bottom: number; top: number };
  /** Cap du bastion principal (vers le large). */
  readonly facing: number;
}

/**
 * Fort bastionné à la façon des Caraïbes : enceinte en pierre à bastions en pointe, la pointe principale tournée
 * vers le large, parapet, guérites côté terre, tour de guet et caserne au centre, porte côté terre. Les canons
 * tirent en barbette par-dessus le parapet. Le même plan, agrandi, donne la citadelle de Port-Sabre et Fort-Royal.
 */
/** `facing` : cap du bastion principal (par défaut, vers le large le plus proche). */
export function buildFort(cx: number, cz: number, layout: FortLayout, facing?: number): FortModel {
  const away = { x: 0, z: 0 };
  land.gradient(cx, cz, away);
  const sea = facing ?? Math.atan2(away.x, away.z);
  const at = (angle: number, radius: number) => new THREE.Vector3(cx + Math.sin(angle) * radius, 0, cz + Math.cos(angle) * radius);
  const step = (Math.PI * 2) / layout.bastions;

  // Tracé de l'enceinte, en tournant autour du centre.
  const { tip, shoulder, curtain } = layout;
  const outline: THREE.Vector3[] = [];
  for (let i = 0; i < layout.bastions; i++) {
    const axis = sea + i * step;
    for (const [da, r] of [[-curtain.angle, curtain.radius], [-shoulder.angle, shoulder.radius], [0, tip], [shoulder.angle, shoulder.radius], [curtain.angle, curtain.radius]]) {
      outline.push(at(axis + da, r));
    }
  }
  // Le terre-plein passe au-dessus du terrain le plus haut sous le fort ; le pied des murs, sous le plus bas.
  const heights = [land.heightAt(cx, cz), ...outline.map((p) => land.heightAt(p.x, p.z))];
  const top = Math.max(...heights) + layout.wallHeight;
  const foot = Math.min(0, ...heights) - WALL_FOOT_DEPTH;
  const ground = land.heightAt(cx, cz);

  const stone = std(0x8f8a80, { roughness: 1 });
  const darkStone = std(0x6f6a62, { roughness: 1 });
  const floor = std(0x9d9587, { roughness: 1 });
  const wood = std(0x6b4a30);
  const roof = std(0x8a3a22);
  const shadow = std(0x2b2118);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  batch.add(stone, walls(outline, cx, cz, foot, top), identity);
  batch.add(floor, platform(outline, top), identity);

  // Parapet le long de chaque côté (un peu en retrait du bord), avec un bandeau sombre sur le dessus.
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const length = a.distanceTo(b) + PARAPET.thickness * 0.7;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const inward = new THREE.Vector3(cx - mid.x, 0, cz - mid.z).normalize().multiplyScalar(PARAPET.thickness / 2);
    batch.add(stone, new THREE.BoxGeometry(PARAPET.thickness, PARAPET.height, length), tf(mid.x + inward.x, top + PARAPET.height / 2, mid.z + inward.z, 0, yaw));
    batch.add(darkStone, new THREE.BoxGeometry(PARAPET.thickness + 0.12, 0.12, length), tf(mid.x + inward.x, top + PARAPET.height + 0.06, mid.z + inward.z, 0, yaw));
  }

  // Guérites aux pointes des bastions côté terre (ceux côté mer portent les canons) : une petite tour ronde coiffée d'un dôme.
  for (const i of layout.landward) {
    const axis = sea + i * step;
    const p = at(axis, tip - 0.7);
    batch.add(stone, new THREE.CylinderGeometry(0.75, 0.6, 2, 8), tf(p.x, top + 1, p.z));
    batch.add(darkStone, new THREE.SphereGeometry(0.85, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), tf(p.x, top + 2, p.z));
    batch.add(shadow, new THREE.BoxGeometry(0.5, 0.6, 0.1), tf(p.x, top + 1.3, p.z, 0, axis, 0));
  }

  // Tour de guet au centre, crénelée, avec le pavillon.
  const { size, height } = layout.tower;
  const towerTop = top + height;
  const half = size / 2 - 0.4;
  batch.add(stone, new THREE.BoxGeometry(size, height, size), tf(cx, top + height / 2, cz, 0, sea));
  const c = Math.cos(sea);
  const s = Math.sin(sea);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    batch.add(stone, new THREE.BoxGeometry(0.7, 0.7, 0.7), tf(cx + (dx * c + dz * s) * half, towerTop + 0.35, cz + (-dx * s + dz * c) * half));
  }
  const door = at(sea + Math.PI, size / 2 + 0.02);
  batch.add(shadow, new THREE.BoxGeometry(1.1, 2, 0.1), tf(door.x, top + 1, door.z, 0, sea));

  // Caserne côté terre : murs blanchis et toit à deux pans.
  const barracks = at(sea + Math.PI, layout.barracks);
  batch.add(std(0xd9cfb8), new THREE.BoxGeometry(6.5, 2.4, 2.6), tf(barracks.x, top + 1.2, barracks.z, 0, sea));
  const ridge = new THREE.CylinderGeometry(1, 1, 6.9, 3);
  // Prisme à 3 pans couché le long de la caserne, arête vers le haut.
  ridge.rotateZ(Math.PI / 2);
  ridge.rotateX(-Math.PI / 2);
  batch.add(roof, ridge, tf(barracks.x, top + 2.75, barracks.z, 0, sea, 0, [1, 0.75, 1.6]));

  // Porte côté terre, dans la courtine la plus opposée au large.
  const gateAngle = sea + Math.round((Math.PI - step / 2) / step) * step + step / 2;
  const gate = at(gateAngle, curtain.radius * Math.cos(step / 2 - curtain.angle) + 0.05);
  const gateY = land.heightAt(gate.x, gate.z);
  batch.add(shadow, new THREE.BoxGeometry(2.2, 2.6, 0.3), tf(gate.x, gateY + 1.3, gate.z, 0, gateAngle));
  batch.add(wood, new THREE.BoxGeometry(1.8, 2.3, 0.35), tf(gate.x, gateY + 1.15, gate.z, 0, gateAngle));

  const group = new THREE.Group();
  for (const { geometry, material } of batch.build()) group.add(new THREE.Mesh(geometry, material));

  // Barbettes (une par emplacement), montrées seulement quand le canon est en service.
  const barbetteGeometry = new THREE.CylinderGeometry(BARBETTE.radius, BARBETTE.radius + 0.15, BARBETTE.height, 10);
  const slots = layout.gunSlots.map(([da, r]) => {
    const restYaw = sea + da;
    const p = at(restYaw, r);
    const barbette = new THREE.Mesh(barbetteGeometry, darkStone);
    barbette.position.set(p.x, top + BARBETTE.height / 2, p.z);
    group.add(barbette);
    return { position: new THREE.Vector3(p.x, top + BARBETTE.height, p.z), restYaw, barbette };
  });
  const bounds = { x: cx, z: cz, radius: (tip + curtain.radius) / 2, bottom: Math.min(ground, 0) - 1, top: towerTop };
  return { group, slots, flagBase: new THREE.Vector3(cx, towerTop, cz), bounds, facing: sea };
}

/** Murs de l'enceinte, en talus : du pied (plus large, sous terre) jusqu'au terre-plein. Faces tournées vers l'extérieur. */
function walls(outline: readonly THREE.Vector3[], cx: number, cz: number, bottom: number, top: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const foot = (p: THREE.Vector3) => new THREE.Vector3(cx + (p.x - cx) * TALUS, bottom, cz + (p.z - cz) * TALUS);
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
function platform(outline: readonly THREE.Vector3[], top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, top, 0);
  return geometry;
}
