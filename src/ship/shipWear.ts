import * as THREE from 'three';
import { RANK_LOOKS } from '../config';

/** Copies assombries des matériaux de coque, par matériau d'origine et par rang (partagées par tous les navires). */
const worn = new Map<THREE.Material, THREE.Material[]>();

/** Un matériau de bois ou de peinture de la coque : sans texture, ni métal, ni lumière, ni toile. */
function isHullMaterial(m: THREE.Material): m is THREE.MeshStandardMaterial {
  if (!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return false;
  const s = m as THREE.MeshStandardMaterial;
  if (s.map || s.userData.sail || s.metalness > 0.3) return false;
  return s.emissive.getHex() === 0;
}

function wornMaterial(base: THREE.MeshStandardMaterial, stars: number): THREE.Material {
  let list = worn.get(base);
  if (!list) worn.set(base, (list = []));
  let m = list[stars];
  if (!m) {
    const copy = base.clone();
    // Bois patiné par les campagnes : plus sombre et un peu terni.
    const hsl = { h: 0, s: 0, l: 0 };
    copy.color.getHSL(hsl);
    copy.color.setHSL(hsl.h, hsl.s * (1 - RANK_LOOKS.hullFade[stars]), hsl.l * (1 - RANK_LOOKS.hullDarken[stars]));
    copy.userData.wornFrom = base;
    list[stars] = m = copy;
  }
  return m;
}

/**
 * Ancienneté d'un navire de la flotte (rang en étoiles, 0 = recrue) : voiles patinées (jaunies, tachées, rapiécées :
 * `uWear` des voiles trouées) et coque usée (bois plus sombre). Reposée après chaque reconstruction du modèle.
 */
export function applyWear(root: THREE.Object3D, stars: number) {
  const sail = RANK_LOOKS.sailWear[stars] ?? 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      if (m.userData.wear) {
        m.userData.wear.value = sail;
        return m;
      }
      const base = (m.userData.wornFrom as THREE.Material | undefined) ?? m;
      if (!isHullMaterial(base)) return m;
      return stars > 0 ? wornMaterial(base, stars) : base;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
