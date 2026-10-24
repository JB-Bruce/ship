import * as THREE from 'three';
import type { Ship } from '../../ship/ship';

/** Parties du navire qu'on clique au Chantier. */
export type ShipPart = 'sails' | 'emblem' | 'cannons' | 'hull' | 'hold';

/** Où poser le point cliquable de chaque partie, dans le repère du navire (null : il n'en a pas, ex. pas de voile). */
export type ShipAnchors = Record<ShipPart, THREE.Vector3 | null>;

/** Au-dessus de l'eau pour le point de la coque, et pont des barques sans plan de pont (m). */
const HULL_HEIGHT = 0.6;
const OPEN_DECK = 0.8;
/** Les points de la coque (vers l'avant) et de la cale (vers l'arrière) s'écartent du milieu (part de la demi-longueur). */
const HULL_FORWARD = 0.45;
const HOLD_BACK = 0.35;
/** Un canon de flanc a un sinus de son angle de tir au moins égal à ceci. */
const FLANK = 0.7;

const box = new THREE.Box3();
const size = new THREE.Vector3();
const inverse = new THREE.Matrix4();

/**
 * Points d'ancrage du Chantier, lus dans le modèle tel qu'il est (ils suivent ses reconstructions : allongement,
 * voilure) : centre de la plus grande voile et de celle qui porte l'emblème, un canon du flanc bâbord, le flanc de la
 * coque vers l'avant, le pont au-dessus de la cale vers l'arrière (les points s'écartent ainsi sur les petits navires).
 */
export function shipAnchors(ship: Ship): ShipAnchors {
  const model = ship.model;
  const root = model.root;
  root.updateMatrixWorld(true);
  inverse.copy(root.matrixWorld).invert();
  let sail: THREE.Vector3 | null = null;
  let emblem: THREE.Vector3 | null = null;
  let biggest = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const material = mesh.material as THREE.Material | undefined;
    if (!mesh.isMesh || !o.visible || !material || Array.isArray(material) || !material.userData.sail) return;
    box.setFromObject(mesh);
    box.getSize(size);
    const center = box.getCenter(new THREE.Vector3()).applyMatrix4(inverse);
    const area = size.x * size.y + size.z * size.y;
    if (area > biggest) {
      biggest = area;
      sail = center;
    }
    if (material.userData.emblemSail) emblem = center;
  });
  const mount = model.cannons.find((m) => Math.sin(m.angle) > FLANK) ?? model.cannons[0];
  const cannons = mount ? mount.object.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse) : null;
  const w = model.waterline;
  const deck = model.deckPlan?.helm.y ?? OPEN_DECK;
  return {
    sails: sail,
    emblem: emblem ?? sail,
    cannons,
    hull: new THREE.Vector3(w.maxWidth, HULL_HEIGHT, w.center + w.half * HULL_FORWARD),
    hold: new THREE.Vector3(0, deck, w.center - w.half * HOLD_BACK),
  };
}
