import * as THREE from 'three';

const flat = (color: number, side: THREE.Side = THREE.FrontSide) => new THREE.MeshLambertMaterial({ color, flatShading: true, side });
const MATERIALS = { hull: flat(0x3d2a1a), plank: flat(0x6b4a2a), mast: flat(0x4a3420), sail: flat(0xcfc3a4, THREE.DoubleSide), barrel: flat(0x7a5530), hoop: flat(0x2a2420) };

function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

/**
 * Une épave qui flotte encore : un morceau de coque à demi noyé et penché, un tronçon de mât brisé avec un lambeau de
 * voile, et autour des planches et des tonneaux. Modèle simple et partagé (géométries et matériaux communs).
 */
export function buildWreck(): THREE.Group {
  const g = new THREE.Group();
  // La coque éventrée : une demi-coque en auge (bordé seulement), penchée et à demi noyée, ses couples qui dépassent.
  const hull = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 9, 1, true, -Math.PI / 2, Math.PI), MATERIALS.hull);
  shell.material = new THREE.MeshLambertMaterial({ color: 0x3d2a1a, flatShading: true, side: THREE.DoubleSide });
  shell.rotation.x = Math.PI / 2;
  hull.add(shell);
  for (let k = 0; k < 5; k++) {
    const z = -2.6 + k * 1.3;
    for (const side of [-1, 1]) hull.add(part(new THREE.BoxGeometry(0.14, 1.1 + ((k * 7 + side * 3) % 4) * 0.25, 0.16), MATERIALS.plank, side * 1.55, 0.35, z, 0, 0, side * -0.25));
  }
  hull.add(part(new THREE.BoxGeometry(2.6, 0.1, 2.4), MATERIALS.plank, 0, -0.15, 1.6, 0.06, 0, 0.04));
  hull.position.y = -0.2;
  hull.rotation.set(0.18, 0, 0.55);
  g.add(hull);
  // Le tronçon de mât brisé et son lambeau de voile.
  g.add(part(new THREE.CylinderGeometry(0.12, 0.16, 4.6, 6), MATERIALS.mast, -0.5, 1.6, 0.6, 0.45, 0, 0.8));
  g.add(part(new THREE.PlaneGeometry(1.7, 1.2, 2, 2), MATERIALS.sail, -1.3, 2.2, 1.1, 0.3, 0.6, 0.6));
  for (const [x, z, r] of [[2.6, 2, 0.4], [-2.9, -1.8, 1.2], [1.2, -4.2, 2.2]] as const) {
    const barrel = part(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 8), MATERIALS.barrel, x, 0, z, Math.PI / 2, r, 0);
    barrel.add(part(new THREE.TorusGeometry(0.33, 0.03, 3, 10), MATERIALS.hoop, 0, 0.25, 0, Math.PI / 2));
    g.add(barrel);
  }
  for (const [x, z, r] of [[-2, 3.4, 0.7], [3.2, -1, 2.1], [-3.4, 0.6, 1.4], [0.6, 4.6, 0.2]] as const) {
    g.add(part(new THREE.BoxGeometry(0.28, 0.08, 2.2), MATERIALS.plank, x, 0.02, z, 0, r, 0));
  }
  g.scale.setScalar(1.3);
  return g;
}
