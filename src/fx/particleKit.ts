import * as THREE from 'three';
import { createSpec, type ParticleSpec } from './particles';

/** Couleurs des particules. */
export const COLORS = {
  smoke: new THREE.Color(0x9a9a9a),
  darkSmoke: new THREE.Color(0x3c3836),
  flash: new THREE.Color(0xffd27a),
  fire: new THREE.Color(0xff7a1a),
  wood: new THREE.Color(0x6b4a2a),
  woodLight: new THREE.Color(0x9a7048),
  water: new THREE.Color(0xd8f2fb),
  foam: new THREE.Color(0xf4fbff),
  gold: new THREE.Color(0xffd447),
  sawdust: new THREE.Color(0xf0c890),
  earth: new THREE.Color(0x6a5034),
  dust: new THREE.Color(0xc9b48a),
};

export const rand = (min: number, max: number) => min + Math.random() * (max - min);

const spec = createSpec();

/** Réinitialise la spec partagée avant chaque émission. */
export function reset(x: number, y: number, z: number, color: THREE.Color): ParticleSpec {
  Object.assign(spec, { x, y, z, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, spin: 0, onWater: false, water: false });
  spec.shapeX = spec.shapeY = spec.shapeZ = 1;
  spec.color.copy(color);
  return spec;
}
