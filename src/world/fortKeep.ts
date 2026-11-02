import * as THREE from 'three';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { FortLayout } from './fortLayouts';
import type { FortMaterials } from './fortWalls';

/** Merlons du crénelage : côté (m). */
const MERLON = 0.7;
/** Les tourelles d'un donjon dépassent sa terrasse de … (m), et leur toit d'ardoise est … fois plus haut que leur rayon. */
const TURRET_RISE = 2.4;
const TURRET_ROOF = 2.2;

/**
 * Tour de guet au centre du fort, sur `base`, carrée et crénelée, tournée selon `sea`, porte côté terre ; avec des
 * tourelles (`tower.turrets`), un donjon : tourelles rondes aux quatre coins, coiffées d'ardoise, meurtrières sur
 * chaque face. Renvoie la hauteur de sa terrasse (pied du mât du pavillon).
 */
export function addTower(batch: GeometryBatch, m: FortMaterials, cx: number, cz: number, base: number, sea: number, tower: FortLayout['tower']): number {
  const { size, height, turrets } = tower;
  const top = base + height;
  const c = Math.cos(sea);
  const s = Math.sin(sea);
  // Coin (dx, dz) du carré, en unités de demi-côté, tourné vers le large.
  const corner = (dx: number, dz: number, half: number) => ({ x: cx + (dx * c + dz * s) * half, z: cz + (-dx * s + dz * c) * half });
  batch.add(m.stone, new THREE.BoxGeometry(size, height, size), tf(cx, base + height / 2, cz, 0, sea));
  const inset = size / 2 - 0.4;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (turrets && dx !== 0 && dz !== 0) continue;
    const p = corner(dx, dz, inset);
    batch.add(m.stone, new THREE.BoxGeometry(MERLON, MERLON, MERLON), tf(p.x, top + MERLON / 2, p.z));
  }
  const door = corner(0, -1, size / 2 + 0.02);
  batch.add(m.shadow, new THREE.BoxGeometry(1.1, 2, 0.1), tf(door.x, base + 1, door.z, 0, sea));
  if (!turrets) return top;

  // Bandeau sous le crénelage, meurtrières sur chaque face.
  batch.add(m.darkStone, new THREE.BoxGeometry(size + 0.2, 0.35, size + 0.2), tf(cx, top - 0.3, cz, 0, sea));
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const p = corner(dx, dz, size / 2 + 0.03);
    const yaw = Math.atan2(p.x - cx, p.z - cz);
    for (const y of [0.45, 0.75]) batch.add(m.shadow, new THREE.BoxGeometry(0.35, 1.1, 0.08), tf(p.x, base + height * y, p.z, 0, yaw));
  }
  // Tourelles d'angle : plus hautes que la terrasse, toit conique d'ardoise.
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = corner(dx, dz, size / 2);
    const h = height + TURRET_RISE;
    batch.add(m.stone, new THREE.CylinderGeometry(turrets, turrets * 1.1, h, 10), tf(p.x, base + h / 2, p.z));
    batch.add(m.darkStone, new THREE.CylinderGeometry(turrets * 1.12, turrets * 1.12, 0.3, 10), tf(p.x, base + h - 0.15, p.z));
    batch.add(m.slate, new THREE.ConeGeometry(turrets * 1.25, turrets * TURRET_ROOF, 10), tf(p.x, base + h + turrets, p.z));
  }
  return top;
}
