import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { cylinderBetween } from '../ship/parts/sails';
import { FLOOR_Y, LONGBOAT_HULL } from '../ship/longboat/longboatTemplate';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Landmass } from './landmass';

/** Bois délavé d'une épave (bordé dehors et dedans, plancher, mât et avirons). */
const WRECK = { outside: std(0x9a8566), inside: std(0x8a7558, { side: THREE.BackSide }), floor: std(0x8a7a62), spar: std(0x6a5a46) };
/** Chaloupe échouée : enfoncée dans le sable (m), couchée sur le flanc (rad), un peu de nez (rad). */
const STRANDED = { sink: 0.12, roll: 0.3, pitch: 0.06, mastStub: 1.6 };
const identity = new THREE.Matrix4();

/**
 * Une chaloupe échouée sur une plage, en (x, z), proue vers `heading` : la coque de la chaloupe en bois délavé, couchée
 * sur le flanc et à demi enfoncée dans le sable, un tronçon de mât brisé et deux avirons abandonnés à côté.
 */
export function buildStrandedBoat(land: Landmass, x: number, z: number, heading: number): THREE.Object3D {
  const batch = new GeometryBatch();
  const hull = LONGBOAT_HULL.buildHull();
  batch.add(WRECK.outside, hull, identity);
  batch.add(WRECK.inside, hull.clone(), identity);
  batch.add(WRECK.floor, LONGBOAT_HULL.buildFloor(FLOOR_Y, -0.97, 0.88, 0.9), identity);
  const mastFoot = LONGBOAT_HULL.stationAt(0.38).z;
  batch.add(WRECK.spar, cylinderBetween(new THREE.Vector3(0, FLOOR_Y, mastFoot), new THREE.Vector3(0.1, FLOOR_Y + STRANDED.mastStub, mastFoot + 0.05), 0.09, 0.07, 6), identity);
  const boat = new THREE.Group();
  for (const { geometry, material } of batch.build()) boat.add(new THREE.Mesh(geometry, material));
  boat.position.set(x, land.heightAt(x, z) - STRANDED.sink, z);
  boat.rotation.set(STRANDED.pitch, heading, STRANDED.roll, 'YXZ');

  // Deux avirons dans le sable, à côté de la coque.
  const oars = new GeometryBatch();
  for (const [dx, dz, yaw] of [[2.2, -0.8, 0.4], [2.6, 1.4, -0.3]] as const) {
    const ox = x + Math.cos(heading) * dx + Math.sin(heading) * dz;
    const oz = z - Math.sin(heading) * dx + Math.cos(heading) * dz;
    const y = land.heightAt(ox, oz) + 0.05;
    oars.add(WRECK.spar, new THREE.BoxGeometry(0.08, 0.06, 3.2), tf(ox, y, oz, 0, heading + yaw));
    oars.add(WRECK.spar, new THREE.BoxGeometry(0.22, 0.04, 0.7), tf(ox + Math.sin(heading + yaw) * 1.4, y, oz + Math.cos(heading + yaw) * 1.4, 0, heading + yaw));
  }
  const group = new THREE.Group();
  group.add(boat);
  for (const { geometry, material } of oars.build()) group.add(new THREE.Mesh(geometry, material));
  return group;
}
