import * as THREE from 'three';
import type { Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { CannonMount, EnsignStaff } from '../shipModel';
import type { HullShape, Station } from './hullShape';
import { buildFlagTexture, type Palette } from './props';

/** Monture de canon pointant vers `angle` (0 = proue, +π/2 = bâbord, -π/2 = tribord). */
export function cannonMount(object: THREE.Object3D, angle: number, muzzle: THREE.Vector3, calibre: CannonMount['calibre'] = 'main'): CannonMount {
  const baseYaw = angle - Math.PI / 2;
  object.rotation.y = baseYaw;
  return { object, angle, baseYaw, yaw: 0, muzzle, fireDelay: 0, calibre };
}

/** Hampe de poupe, sur la hanche bâbord, un peu inclinée vers l'arrière (sous la bôme s'il y en a une). */
export function sternStaff(stern: Station, height: number): EnsignStaff {
  const x = stern.halfWidth * 0.55;
  return { base: new THREE.Vector3(x, stern.gunwale, stern.z + 0.3), top: new THREE.Vector3(x, stern.gunwale + height, stern.z + 0.3 - height * 0.3) };
}

/** Flèche au-dessus d'un mât (le drapeau de rang y flotte quand une bôme passe au-dessus de la poupe). */
export function mastheadStaff(z: number, top: number, height = 1.4): EnsignStaff {
  return { base: new THREE.Vector3(0, top, z), top: new THREE.Vector3(0, top + height, z) };
}

/** Matériau low-poly standard (facettes nettes). */
export const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

/**
 * N'écrit que la profondeur, jamais la couleur. Rendu après les bateaux et avant l'océan
 * (voir RENDER_ORDER), il masque l'eau à l'intérieur des coques.
 */
export const waterMaskMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
export const riggingMaterial = new THREE.LineBasicMaterial({ color: 0x3a2a1a });
const ironMaterial = std(0x3b3f45, { roughness: 0.45, metalness: 0.7 });

const palettes = new Map<Livery, Palette>();
const flagMaterials = new Map<Livery, THREE.Material>();

/** Matériaux d'un camp (partagés par tous ses bateaux, quel que soit le type). */
export function paletteFor(l: Livery): Palette {
  let p = palettes.get(l);
  if (!p) {
    p = {
      hull: std(l.hull),
      hullInside: std(l.hullInside, { side: THREE.BackSide }),
      trim: std(l.trim),
      wood: std(0x8a6440),
      floor: std(0x7a5a3a),
      dark: std(0x2b2118),
      metal: std(0x2a2a2e, { roughness: 0.5, metalness: 0.6 }),
      rope: std(0xb89a6a),
      skin: std(0xd9a37a),
      shirt: std(0xe8e2d0),
      shirtRed: std(0x9b2d20),
      pants: std(0x3a3a50),
      bandana: std(0xb3261e),
      glow: std(l.lantern ?? 0xffc860, { emissive: l.lantern ?? 0xffa030, emissiveIntensity: 1.2 }),
    };
    palettes.set(l, p);
  }
  return p;
}

export function flagMaterialFor(l: Livery): THREE.Material {
  let m = flagMaterials.get(l);
  if (!m) {
    m = std(0xffffff, { map: buildFlagTexture(l.flag), side: THREE.DoubleSide, roughness: 0.9 });
    flagMaterials.set(l, m);
  }
  return m;
}

/** Safran + mèche + barre franche, autour de l'axe du gouvernail (origine sur le tableau arrière). */
export function buildRudderGeometry(scale = 1): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  batch.add(key, new THREE.BoxGeometry(0.07, 1.1, 0.5), tf(0, -0.35, -0.25));
  batch.add(key, new THREE.BoxGeometry(0.08, 0.5, 0.1), tf(0, 0.2, -0.03));
  batch.add(key, new THREE.BoxGeometry(0.06, 0.06, 1.0), tf(0, 0.45, 0.45));
  const geometry = batch.build()[0].geometry;
  geometry.scale(scale, scale, scale);
  return geometry;
}

/**
 * Joints du bordé de pont : de fines lignes sombres tous les `spacing` mètres, sur la partie du pont
 * comprise entre `uFrom` et `uTo`, seulement là où le pont est assez large.
 */
export function addDeckSeams(
  batch: GeometryBatch,
  material: THREE.Material,
  hull: HullShape,
  y: number,
  uFrom: number,
  uTo: number,
  spacing = 0.47,
) {
  for (let x = spacing / 2; x < hull.halfWidth; x += spacing) {
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let u = uFrom; u <= uTo; u += 0.02) {
      const s = hull.stationAt(u);
      if (s.halfWidth * 0.95 > x + 0.05) {
        zMin = Math.min(zMin, s.z);
        zMax = Math.max(zMax, s.z);
      }
    }
    if (zMax <= zMin) continue;
    for (const side of [1, -1]) {
      batch.add(material, new THREE.BoxGeometry(0.02, 0.01, zMax - zMin), tf(side * x, y + 0.006, (zMin + zMax) / 2));
    }
  }
}

const armors = new WeakMap<HullShape, Map<number, THREE.BufferGeometry>>();

/**
 * Renfort de coque visible, ou null au niveau 0 (même rendu pour tous les camps).
 * Niveau 1 : bande de fer basse et plaque d'étrave. Niveau 2 : + bande haute et ferrures verticales.
 * Niveau 3 : + bande médiane et ferrures doublées. Niveau 4 : + deux bandes intermédiaires.
 */
export function armorFor(hull: HullShape, level: number): { geometry: THREE.BufferGeometry; material: THREE.Material } | null {
  if (level <= 0) return null;
  let byLevel = armors.get(hull);
  if (!byLevel) armors.set(hull, (byLevel = new Map()));
  let geometry = byLevel.get(level);
  if (!geometry) {
    const batch = new GeometryBatch();
    const identity = new THREE.Matrix4();
    const bow = hull.stationAt(1);
    const straps = level >= 3 ? [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6] : [-0.7, -0.35, 0, 0.35, 0.65];
    const bands = [0.25, ...(level >= 2 ? [0.85] : []), ...(level >= 3 ? [0.55] : []), ...(level >= 4 ? [0.4, 0.7] : [])];
    for (const side of [1, -1] as const) {
      for (const h of bands) batch.add(ironMaterial, hull.buildRail(side, h, 0.035, 0.04), identity);
      if (level < 2) continue;
      for (const u of straps) {
        const s = hull.stationAt(u);
        batch.add(ironMaterial, new THREE.BoxGeometry(0.05, s.gunwale * 0.75, 0.12), tf(side * (hull.halfWidthAt(s, s.gunwale * 0.55) + 0.03), s.gunwale * 0.55, s.z));
      }
    }
    const stemHeight = bow.gunwale - bow.keel + 0.4;
    batch.add(ironMaterial, new THREE.BoxGeometry(0.14, stemHeight, 0.1), tf(0, (bow.gunwale + bow.keel) / 2, bow.z - 0.02, -0.2));
    geometry = batch.build()[0].geometry;
    byLevel.set(level, geometry);
  }
  return { geometry, material: ironMaterial };
}

/** Pavillon qui ondule au vent (quelques sommets déplacés à chaque image). */
/** Force de vent au-delà de laquelle un pavillon ne claque plus plus vite. */
const FLAG_MAX_STRENGTH = 1.5;

export class WavingFlag {
  readonly mesh: THREE.Mesh;
  /** Force du vent 0..1 : plus il souffle, plus le pavillon claque vite et fort. */
  strength = 0.6;
  private readonly base: Float32Array;
  private time = Math.random() * 10;

  constructor(
    material: THREE.Material,
    private readonly length: number,
    height: number,
  ) {
    const geometry = new THREE.PlaneGeometry(length, height, 6, 2);
    // Du mât vers l'arrière (-Z), face visible côté bâbord.
    geometry.translate(length / 2, 0, 0);
    geometry.rotateY(Math.PI / 2);
    this.base = Float32Array.from(geometry.attributes.position.array);
    this.mesh = new THREE.Mesh(geometry, material);
  }

  /** Vent relatif au bateau (rad, 0 = vers la proue) : le pavillon flotte dans son sens. */
  setWind(relativeDirection: number, strength: number) {
    // Le pavillon s'étire naturellement vers l'arrière (-Z) : on le tourne vers où va le vent.
    this.mesh.rotation.y = relativeDirection - Math.PI;
    // Au-delà, le pavillon claquerait à une cadence irréaliste (vents de tempête).
    this.strength = Math.min(strength, FLAG_MAX_STRENGTH);
  }

  update(dt: number) {
    this.time += dt * (4 + 6 * this.strength);
    const amplitude = (0.04 + 0.07 * this.strength) * this.length;
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const along = -this.base[i * 3 + 2] / this.length; // 0 au mât, 1 au bout
      pos.setX(i, this.base[i * 3] + Math.sin(along * 5 - this.time) * amplitude * along);
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

/**
 * Foyers d'incendie possibles, dans le repère du bateau : [u (poupe -1 → proue 1), côté, hauteur y (m)].
 * Côté : fraction de la demi-largeur sur le pont (0 = axe) ; ±1 = sur le bordé extérieur (une brèche dans la coque).
 */
export function fireSpots(hull: HullShape, spots: readonly (readonly [number, number, number])[]): THREE.Vector3[] {
  return spots.map(([u, side, y]) => {
    const s = hull.stationAt(u);
    const w = hull.halfWidthAt(s, y);
    const x = Math.abs(side) >= 1 ? Math.sign(side) * w * 1.02 : side * w;
    return new THREE.Vector3(x, y, s.z);
  });
}
