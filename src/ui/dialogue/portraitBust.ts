import * as THREE from 'three';
import type { CharacterLook } from '../../story/dialogueTypes';

/** Couleurs fixes du visage et des accessoires. */
const PARTS = { eye: 0x1c140e, lip: 0x7a3a2c, scar: 0x8a4a3a, patch: 0x141010, gold: 0xd9a514, wrinkle: 0x7a5238 };

const mat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Une pièce du buste : géométrie, couleur, place, échelle et rotation. */
function part(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, scale?: [number, number, number], rotation?: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.position.set(x, y, z);
  if (scale) mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  return mesh;
}

/** Un buste low-poly construit d'après l'allure d'un personnage ; `mouth` et `eyes` s'animent. */
export interface Bust {
  group: THREE.Group;
  head: THREE.Group;
  mouth: THREE.Mesh;
  eyes: THREE.Mesh[];
}

/**
 * Buste d'un personnage, dans le style low-poly du jeu : épaules et manteau, cou, tête facettée, nez, yeux, sourcils,
 * bouche, barbe, cheveux, couvre-chef (tricorne ou foulard), et ses marques (cicatrice, bandeau, boucle d'oreille, rides).
 */
export function buildBust(look: CharacterLook): Bust {
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = 1.08;
  // Épaules, revers du manteau, col de chemise, cou.
  group.add(part(new THREE.CylinderGeometry(0.5, 0.8, 0.72, 7), look.coat, 0, 0.36, 0));
  group.add(part(new THREE.BoxGeometry(0.12, 0.5, 0.06), new THREE.Color(look.coat).multiplyScalar(0.7).getHex(), -0.17, 0.42, 0.5, undefined, [0.25, 0, 0.35]));
  group.add(part(new THREE.BoxGeometry(0.12, 0.5, 0.06), new THREE.Color(look.coat).multiplyScalar(0.7).getHex(), 0.17, 0.42, 0.5, undefined, [0.25, 0, -0.35]));
  group.add(part(new THREE.CylinderGeometry(0.2, 0.28, 0.18, 7), look.collar, 0, 0.74, 0.03));
  group.add(part(new THREE.CylinderGeometry(0.14, 0.16, 0.26, 6), look.skin, 0, 0.84, 0));
  // Tête, oreilles, nez.
  head.add(part(new THREE.IcosahedronGeometry(0.38, 1), look.skin, 0, 0, 0, [look.slim ? 0.82 : 0.92, 1.12, 0.98]));
  for (const side of [-1, 1]) head.add(part(new THREE.BoxGeometry(0.06, 0.13, 0.08), look.skin, side * 0.35, 0, -0.02));
  head.add(part(new THREE.ConeGeometry(0.065, 0.2, 4), look.skin, 0, -0.02, 0.39, undefined, [Math.PI / 2, 0, 0]));
  // Yeux et sourcils.
  const eyes = [-1, 1].map((side) => part(new THREE.SphereGeometry(0.04, 6, 4), PARTS.eye, side * 0.13, 0.07, 0.31));
  head.add(...eyes);
  for (const side of [-1, 1])
    head.add(part(new THREE.BoxGeometry(look.old ? 0.15 : 0.12, look.old ? 0.045 : 0.03, 0.04), look.hair, side * 0.13, 0.15, 0.32, undefined, [0, 0, -side * 0.12]));
  const mouth = part(new THREE.BoxGeometry(0.14, 0.03, 0.03), PARTS.lip, 0, -0.17, 0.35);
  head.add(mouth);
  // Barbe et moustache, ou un peu de barbe de quelques jours.
  if (look.beard === 'full') {
    head.add(part(new THREE.IcosahedronGeometry(0.3, 1), look.hair, 0, -0.24, 0.12, [1, 0.85, 0.75]));
    head.add(part(new THREE.BoxGeometry(0.24, 0.05, 0.06), look.hair, 0, -0.12, 0.36));
  } else if (look.beard === 'stubble') {
    head.add(part(new THREE.IcosahedronGeometry(0.3, 1), new THREE.Color(look.skin).lerp(new THREE.Color(look.hair), 0.35).getHex(), 0, -0.2, 0.08, [1.02, 0.6, 0.8]));
  }
  // Cheveux : calotte, et longs cheveux noués dans le dos.
  if (look.hairStyle !== 'none') head.add(part(new THREE.IcosahedronGeometry(0.4, 1), look.hair, 0, 0.12, -0.05, [0.97, 0.75, 0.98]));
  if (look.hairStyle === 'long') {
    head.add(part(new THREE.BoxGeometry(0.32, 0.62, 0.12), look.hair, 0, -0.32, -0.3, undefined, [0.18, 0, 0]));
    // Mèches qui tombent de chaque côté du visage, jusqu'aux épaules.
    for (const side of [-1, 1]) head.add(part(new THREE.BoxGeometry(0.08, 0.46, 0.14), look.hair, side * 0.3, -0.24, 0.06, undefined, [0, 0, side * 0.06]));
  }
  // Couvre-chef.
  if (look.hat === 'tricorne') {
    head.add(part(new THREE.CylinderGeometry(0.66, 0.66, 0.06, 3), look.hatColor, 0, 0.32, -0.02, undefined, [0, Math.PI / 2, 0]));
    head.add(part(new THREE.CylinderGeometry(0.3, 0.37, 0.24, 8), look.hatColor, 0, 0.44, -0.04));
    head.add(part(new THREE.TorusGeometry(0.37, 0.018, 4, 16), PARTS.gold, 0, 0.33, -0.04, undefined, [Math.PI / 2, 0, 0]));
  } else if (look.hat === 'bandana') {
    head.add(part(new THREE.SphereGeometry(0.4, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2.15), look.hatColor, 0, 0.08, -0.02, [0.97, 1.05, 1]));
    head.add(part(new THREE.BoxGeometry(0.12, 0.12, 0.1), look.hatColor, 0.12, 0.08, -0.4, undefined, [0.4, 0, 0.6]));
    head.add(part(new THREE.BoxGeometry(0.08, 0.26, 0.04), look.hatColor, 0.16, -0.08, -0.42, undefined, [0.2, 0, 0.3]));
  }
  // Marques.
  if (look.scar) head.add(part(new THREE.BoxGeometry(0.02, 0.2, 0.02), PARTS.scar, -0.2, 0.0, 0.29, undefined, [0, 0.4, 0.5]));
  if (look.eyePatch) {
    head.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8), PARTS.patch, 0.13, 0.07, 0.34, undefined, [Math.PI / 2, 0, 0]));
    head.add(part(new THREE.TorusGeometry(0.4, 0.012, 3, 18), PARTS.patch, 0, 0.1, 0, [0.95, 1, 1], [0.15, 0, 0.35]));
  }
  if (look.earring) head.add(part(new THREE.TorusGeometry(0.035, 0.01, 4, 10), PARTS.gold, -0.36, -0.1, 0.0, undefined, [0, Math.PI / 2, 0]));
  if (look.old) for (const y of [0.21, 0.25]) head.add(part(new THREE.BoxGeometry(0.2, 0.012, 0.02), PARTS.wrinkle, 0, y, 0.31));
  group.add(head);
  return { group, head, mouth, eyes };
}
