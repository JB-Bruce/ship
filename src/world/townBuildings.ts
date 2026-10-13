import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { windowMaterial } from '../ship/parts/nightGlow';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Island } from './island';

/**
 * Repère du port d'une île : origine au rivage du fond de la crique, `v` vers le large, `u` le long du rivage. Un
 * objet tourné de `angle` a son +Z vers le large.
 */
export interface PortFrame {
  readonly angle: number;
  at(u: number, v: number): { x: number; z: number };
  place(u: number, v: number, y: number, rotY?: number, scale?: number | [number, number, number]): THREE.Matrix4;
  ground(u: number, v: number): number;
}

export function portFrame(island: Island): PortFrame {
  const A = island.def.bay.angle;
  const P = island.port;
  const at = (u: number, v: number) => ({ x: P.x + Math.cos(A) * u + Math.sin(A) * v, z: P.z - Math.sin(A) * u + Math.cos(A) * v });
  return {
    angle: A,
    at,
    place: (u, v, y, rotY = 0, scale = 1) => {
      const p = at(u, v);
      return tf(p.x, y, p.z, 0, A + rotY, 0, scale);
    },
    ground: (u, v) => {
      const p = at(u, v);
      return island.heightAt(p.x, p.z);
    },
  };
}

const materials = new Map<number, THREE.Material>();
/** Matériau d'une couleur (un seul par couleur, partagé par toutes les villes). */
export function tint(color: number): THREE.Material {
  let m = materials.get(color);
  if (!m) materials.set(color, (m = std(color, { roughness: 0.95 })));
  return m;
}

export const TOWN_COLORS = { stone: 0x8f8a80, darkStone: 0x6a655d, door: 0x2b2118, cornice: 0x77706a };

/** Un bâtiment de la ville. Centre (u, v), largeur le long du rivage, profondeur, hauteur des murs, étages. */
export interface TownBuilding {
  u: number;
  v: number;
  w: number;
  d: number;
  h: number;
  floors: number;
  wall: number;
  roof: number;
  /** Pavillon (quatre pans), deux pans parallèles à la façade, ou en long (pignon vers le large : église, magasin). */
  roofStyle: 'hip' | 'gable' | 'nave';
  rot?: number;
  /** Largeur de la porte (m) : un magasin a un grand portail. */
  door?: number;
  chimney?: boolean;
}

/**
 * Bâtiment posé sur un soubassement de pierre qui rattrape la pente (le sol pris au coin le plus haut), corniche,
 * fenêtres à chaque étage sur la façade et les côtés (éclairées la nuit), porte face au large, toit. Renvoie la
 * hauteur du sol du bâtiment.
 */
export function addTownBuilding(batch: GeometryBatch, f: PortFrame, b: TownBuilding): number {
  const rot = b.rot ?? 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // Décalage dans le repère du bâtiment (tourné de `rot`), en (u, v) du port.
  const local = (du: number, dv: number) => ({ u: b.u + du * c + dv * s, v: b.v - du * s + dv * c });
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => {
    const p = local((x * b.w) / 2, (z * b.d) / 2);
    return f.ground(p.u, p.v);
  });
  const floor = Math.max(...corners, f.ground(b.u, b.v)) + 0.15;
  const low = Math.min(...corners) - 0.6;
  const put = (du: number, dv: number, y: number, rotY = 0, scale: number | [number, number, number] = 1) => {
    const p = local(du, dv);
    return f.place(p.u, p.v, y, rot + rotY, scale);
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  // Soubassement, murs, corniche.
  batch.add(tint(TOWN_COLORS.darkStone), box(b.w + 0.3, floor - low, b.d + 0.3), put(0, 0, (floor + low) / 2));
  batch.add(tint(b.wall), box(b.w, b.h, b.d), put(0, 0, floor + b.h / 2));
  batch.add(tint(TOWN_COLORS.cornice), box(b.w + 0.35, 0.3, b.d + 0.35), put(0, 0, floor + b.h - 0.1));
  // Fenêtres : une rangée par étage, façade et côtés ; porte au milieu de la façade.
  const door = b.door ?? 1.2;
  const storey = b.h / b.floors;
  const across = Math.max(2, Math.round(b.w / 3.2));
  const deep = Math.max(1, Math.round(b.d / 3.4));
  for (let k = 0; k < b.floors; k++) {
    const y = floor + storey * (k + 0.55);
    for (let i = 0; i < across; i++) {
      const du = (i + 0.5 - across / 2) * (b.w / across);
      if (k === 0 && Math.abs(du) < door / 2 + 0.7) continue;
      batch.add(windowMaterial, box(0.8, 1.1, 0.1), put(du, b.d / 2 + 0.03, y));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < deep; i++) {
        const dv = (i + 0.5 - deep / 2) * (b.d / deep);
        batch.add(windowMaterial, box(0.1, 1.1, 0.8), put(side * (b.w / 2 + 0.03), dv, y));
      }
    }
  }
  const doorHeight = Math.min(storey * 0.8, door > 2 ? 3.6 : 2.2);
  batch.add(tint(TOWN_COLORS.door), box(door, doorHeight, 0.12), put(0, b.d / 2 + 0.04, floor + doorHeight / 2));
  // Toit.
  const top = floor + b.h;
  if (b.roofStyle === 'hip') {
    const rise = Math.min(b.w, b.d) * 0.42;
    const roof = new THREE.ConeGeometry(1, 1, 4);
    roof.rotateY(Math.PI / 4);
    const k = Math.SQRT1_2;
    batch.add(tint(b.roof), roof, put(0, 0, top + rise / 2, 0, [(b.w / 2 + 0.5) / k, rise, (b.d / 2 + 0.5) / k]));
  } else {
    const along = b.roofStyle === 'nave';
    const span = (along ? b.w : b.d) + 1;
    batch.add(tint(b.roof), gableRoof(along ? b.d + 0.8 : b.w + 0.8, span, span * 0.4), put(0, 0, top, along ? Math.PI / 2 : 0));
    if (along) {
      // Pignon de façade : le haut du mur sous le toit, vers le large.
      batch.add(tint(b.wall), gableRoof(0.3, b.w, b.w * 0.4 - 0.1), put(0, b.d / 2 - 0.15, top, Math.PI / 2));
    }
  }
  if (b.chimney) batch.add(tint(TOWN_COLORS.stone), box(0.8, 2, 0.8), put(b.w * 0.3, -b.d * 0.15, top + 1));
  return floor;
}

/** Toit à deux pans : faîtage le long de X (`length`), largeur `span` le long de Z, hauteur `rise` ; base en y = 0. */
export function gableRoof(length: number, span: number, rise: number): THREE.BufferGeometry {
  const x = length / 2;
  const z = span / 2;
  const v = [
    [-x, 0, z], [x, 0, z], [x, rise, 0], [-x, rise, 0], // pan avant
    [x, 0, -z], [-x, 0, -z], [-x, rise, 0], [x, rise, 0], // pan arrière
  ];
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(v[0], v[1], v[2], v[3]);
  quad(v[4], v[5], v[6], v[7]);
  // Pignons.
  positions.push(...[x, 0, z], ...[x, 0, -z], ...[x, rise, 0]);
  positions.push(...[-x, 0, -z], ...[-x, 0, z], ...[-x, rise, 0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
