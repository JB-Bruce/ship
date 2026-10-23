import * as THREE from 'three';
import { CURSED } from '../config';
import { windowMaterial } from './parts/nightGlow';
import type { TornSail } from './parts/tornSail';

/** Copies délavées des matériaux, par matériau d'origine (partagées par tous les navires maudits). */
const ghosts = new Map<THREE.Material, THREE.Material>();
/** Fenêtres d'un navire maudit : une lueur verte à peine visible, jour et nuit. */
const ghostWindow = new THREE.MeshStandardMaterial({ color: 0x1a221d, emissive: CURSED.windowGlow, flatShading: true, roughness: 0.85 });
const GREY = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

/** Un matériau à délaver : sans lumière propre (lanternes, fenêtres) ni toile (les voiles prennent la livrée). */
function isPlain(m: THREE.Material): m is THREE.MeshStandardMaterial {
  const s = m as THREE.MeshStandardMaterial;
  return !!s.isMeshStandardMaterial && !s.userData.sail && !s.userData.flag && s.emissive.getHex() === 0;
}

function ghostOf(base: THREE.MeshStandardMaterial): THREE.Material {
  let m = ghosts.get(base);
  if (!m) {
    const copy = base.clone();
    const g = CURSED.ghost;
    copy.color.getHSL(hsl);
    GREY.setHSL(hsl.h, hsl.s * g.saturation, g.lightness);
    copy.color.lerp(GREY, g.mix);
    copy.userData.ghostFrom = base;
    ghosts.set(base, (m = copy));
  }
  return m;
}

/**
 * Apparence d'un navire maudit : tout le bois, la peinture et le métal délavés vers un gris pâle, voiles en lambeaux
 * (`CURSED.sailTear`) ; les fanaux d'un vert sourd viennent de sa livrée. À poser après chaque reconstruction du modèle.
 */
export function applyGhostLook(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const swap = (m: THREE.Material) => {
      // Voiles en lambeaux, bien plus trouées que celles d'un navire abîmé.
      const torn = m.userData.tornSail as TornSail | undefined;
      if (torn) torn.shredded = CURSED.sailTear;
      if (m === windowMaterial) return ghostWindow;
      return isPlain(m) && !m.userData.ghostFrom ? ghostOf(m) : m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
