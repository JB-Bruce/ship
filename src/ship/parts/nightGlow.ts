import * as THREE from 'three';
import { DAY_NIGHT } from '../../config';

const { lerp } = THREE.MathUtils;

/** Lampes des lanternes (une par couleur de fanal) : plus vives quand il fait sombre. */
const lamps: THREE.MeshStandardMaterial[] = [];

/** Fenêtres des châteaux, des tableaux arrière et des maisons du port : sombres le jour, éclairées la nuit. */
export const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b2118,
  emissive: DAY_NIGHT.windowColor,
  emissiveIntensity: 0,
  flatShading: true,
  roughness: 0.85,
});

/** Matériau d'une lampe de lanterne (partagé par tous les navires d'une livrée), allumé selon l'obscurité. */
export function lampMaterial(color: number, emissive: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: DAY_NIGHT.lanternGlow[0], flatShading: true, roughness: 0.85 });
  lamps.push(m);
  return m;
}

export function isLamp(material: THREE.Material): boolean {
  return lamps.includes(material as THREE.MeshStandardMaterial);
}

/** Allume lanternes et fenêtres : `dark` = 0 en plein jour, 1 dans la nuit noire (ou la tempête). */
export function setNightGlow(dark: number) {
  const lamp = lerp(DAY_NIGHT.lanternGlow[0], DAY_NIGHT.lanternGlow[1], dark);
  for (let i = 0; i < lamps.length; i++) lamps[i].emissiveIntensity = lamp;
  windowMaterial.emissiveIntensity = lerp(DAY_NIGHT.windowGlow[0], DAY_NIGHT.windowGlow[1], dark);
}

/** Nombre de sommets d'une boîte une fois fusionnée (GeometryBatch la rend non indexée). */
const BOX_VERTICES = 36;
const spotsCache = new WeakMap<THREE.BufferGeometry, THREE.Vector3[]>();

/**
 * Centres des lampes d'une géométrie fusionnée de lanternes (chaque lampe est une seule boîte : `addLantern`,
 * `addLampFixtures`), en cache par géométrie : les gabarits sont partagés.
 */
function lampSpots(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  let spots = spotsCache.get(geometry);
  if (!spots) {
    spots = [];
    const pos = geometry.attributes.position;
    for (let start = 0; start + BOX_VERTICES <= pos.count; start += BOX_VERTICES) {
      const c = new THREE.Vector3();
      for (let i = start; i < start + BOX_VERTICES; i++) c.x += pos.getX(i), c.y += pos.getY(i), c.z += pos.getZ(i);
      spots.push(c.divideScalar(BOX_VERTICES));
    }
    spotsCache.set(geometry, spots);
  }
  return spots;
}

/**
 * Lanterne : centre de sa lampe (repère de son modèle) et couleur de son halo (celle du fanal). Une lanterne suspendue
 * (parts/shipLamps.ts) bouge : `at` est mis à jour sur place, et `seed` (fixe) règle son scintillement ; `halo` : taille
 * de son halo (× celle d'un fanal, 1 par défaut ; plus pour la lanterne de hune, vue de loin).
 */
export interface LanternSpot {
  readonly at: THREE.Vector3;
  readonly color: THREE.Color;
  readonly seed?: number;
  readonly halo?: number;
}

/**
 * Ajoute les pièces fixes d'un gabarit à `parent` et renvoie ses lanternes (repère de `parent`), où brillent leurs
 * halos la nuit.
 */
export function addStatics(parent: THREE.Object3D, statics: readonly { geometry: THREE.BufferGeometry; material: THREE.Material }[]): LanternSpot[] {
  const lanterns: LanternSpot[] = [];
  for (const { geometry, material } of statics) {
    parent.add(new THREE.Mesh(geometry, material));
    if (!isLamp(material)) continue;
    const color = (material as THREE.MeshStandardMaterial).emissive;
    for (const at of lampSpots(geometry)) lanterns.push({ at, color });
  }
  return lanterns;
}
