import * as THREE from 'three';
import { LIVERIES, type IslandId } from '../config';
import { paletteFor, std } from '../ship/parts/common';
import { addStatics, windowMaterial, type LanternSpot } from '../ship/parts/nightGlow';
import { addBarrel, addCrate, addLantern, addRopeCoil } from '../ship/parts/props';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Island } from './island';
import { buildArsenalPort } from './arsenalPort';
import { addPalm, seeded } from './islandTerrain';

/** Hauteur du plancher des quais (m). */
const DOCK_Y = 1.3;

/**
 * Repère du port d'une île : origine au rivage du fond de la crique, `v` vers le large, `u` le long du rivage.
 * Les objets « orientés port » tournent de l'angle de la crique (leur +Z regarde le large).
 */
let island: Island;
let A = 0;
function at(u: number, v: number) {
  const P = island.port;
  return { x: P.x + Math.cos(A) * u + Math.sin(A) * v, z: P.z - Math.sin(A) * u + Math.cos(A) * v };
}
function place(u: number, v: number, y: number, rotY = 0, scale: number | [number, number, number] = 1) {
  const p = at(u, v);
  return tf(p.x, y, p.z, 0, A + rotY, 0, scale);
}
const ground = (u: number, v: number) => {
  const p = at(u, v);
  return island.heightAt(p.x, p.z);
};

interface House {
  u: number;
  v: number;
  w: number;
  d: number;
  h: number;
  wall: number;
  roof: number;
  rot: number;
}

/**
 * Village de chaque île. La Tortue : cabanes de bois et de chaux. Port-Sabre : maisons de pierre aux toits sombres.
 * Port-Dauphin : cabanes de pêcheurs autour du poste de garde de la Marine. (Port-Royal est bâti à part : arsenalPort.ts.)
 */
const HOUSES: Partial<Record<IslandId, House[]>> = {
  tortuga: [
  { u: 0, v: -22, w: 10, d: 7, h: 4.2, wall: 0xd8cfb8, roof: 0x8a3b2a, rot: 0 }, // taverne
  { u: -22, v: -14, w: 12, d: 6, h: 3.6, wall: 0x9a7048, roof: 0x5a4a3a, rot: 0.1 }, // entrepôt
  { u: 18, v: -16, w: 6, d: 5, h: 3, wall: 0x9a7048, roof: 0x7a6a3a, rot: 0.2 },
  { u: 28, v: -28, w: 5, d: 5, h: 3, wall: 0xd8cfb8, roof: 0x4a5a6a, rot: -0.3 },
  { u: -12, v: -34, w: 6, d: 5, h: 3.2, wall: 0x9a7048, roof: 0x8a3b2a, rot: 0.15 },
  { u: 10, v: -38, w: 5, d: 4.5, h: 3, wall: 0xb08a5a, roof: 0x7a6a3a, rot: -0.1 },
  { u: -30, v: -30, w: 5.5, d: 5, h: 3, wall: 0x9a7048, roof: 0x4a5a6a, rot: 0.4 },
  ],
  dauphin: [
    { u: 0, v: -22, w: 9, d: 7, h: 4.4, wall: 0x9a948a, roof: 0x3e4a5e, rot: 0 }, // poste de garde de la Marine (et sa cantine)
    { u: -17, v: -13, w: 6, d: 5, h: 3, wall: 0x9a7048, roof: 0x7a6a3a, rot: 0.2 }, // cabanes de pêcheurs
    { u: 16, v: -15, w: 6, d: 5, h: 3, wall: 0xd8cfb8, roof: 0x8a3b2a, rot: -0.15 },
    { u: -10, v: -32, w: 5, d: 4.5, h: 3, wall: 0xb08a5a, roof: 0x5a4a3a, rot: 0.3 },
    { u: 12, v: -31, w: 5.5, d: 5, h: 3, wall: 0x9a7048, roof: 0x4a5a6a, rot: -0.25 },
  ],
  sabre: [
    { u: 2, v: -22, w: 11, d: 7, h: 4.6, wall: 0x9a948a, roof: 0x5a2a22, rot: 0 }, // taverne des Frères du Sabre
    { u: -20, v: -16, w: 12, d: 6, h: 4, wall: 0x8a847a, roof: 0x3e3e46, rot: 0.08 }, // entrepôt des contrebandiers
    { u: 20, v: -18, w: 6, d: 5, h: 3.4, wall: 0xa49d90, roof: 0x5a2a22, rot: -0.15 },
    { u: -10, v: -33, w: 6, d: 5, h: 3.4, wall: 0x8a847a, roof: 0x3e3e46, rot: 0.2 },
    { u: 14, v: -34, w: 5.5, d: 5, h: 3.2, wall: 0x9a948a, roof: 0x6a4a2a, rot: -0.3 },
  ],
};
/** Palmiers plantés à la main dans chaque village : [u, v]. */
const VILLAGE_PALMS: Partial<Record<IslandId, [number, number][]>> = {
  tortuga: [[-6, -10], [12, -26], [-24, -24], [26, -10]],
  sabre: [[-4, -12], [26, -26]],
  dauphin: [[-6, -10], [22, -24], [-24, -26]],
};

/** Îles dont le port est un arsenal de la Marine (une ville de pierre) plutôt qu'un village. */
const ARSENALS: readonly IslandId[] = ['royale'];

/** Graine du tirage des palmiers de chaque village. */
const VILLAGE_SEED: Partial<Record<IslandId, number>> = { tortuga: 7, sabre: 11, dauphin: 17 };

/**
 * Le port d'une île : quais et pontons sur pilotis, village pirate ; ses lanternes (repère du monde) pour les halos de
 * nuit. Port-Royal, arsenal de la Marine, est une vraie ville (arsenalPort.ts).
 */
export function buildPort(of: Island): { group: THREE.Group; lanterns: LanternSpot[] } {
  if (ARSENALS.includes(of.id)) return buildArsenalPort(of);
  island = of;
  A = of.def.bay.angle;
  const batch = new GeometryBatch();
  const p = paletteFor(LIVERIES.player);
  const plank = std(0x8a6440);
  const pile = std(0x5b4128);
  const dark = p.dark;
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

  // Quais : un quai le long du rivage, une grande jetée et un ponton, sur pilotis.
  const decks: [number, number, number, number][] = [
    [0, 1.5, 46, 7],
    [0, 17, 5, 30],
    [16, 10, 3, 16],
  ];
  for (const [u, v, w, d] of decks) {
    batch.add(plank, box(w, 0.3, d), place(u, v, DOCK_Y - 0.15));
    // Joints des planches, en travers.
    for (let k = -d / 2 + 0.9; k < d / 2; k += 1.2) batch.add(dark, box(w, 0.01, 0.03), place(u, v + k, DOCK_Y + 0.005));
    for (let k = -d / 2 + 1; k <= d / 2; k += 5) {
      for (const side of [-1, 1]) batch.add(pile, new THREE.CylinderGeometry(0.2, 0.22, 5, 6), place(u + side * (w / 2 - 0.2), v + k, DOCK_Y - 2.5));
    }
  }
  for (const v of [8, 18, 28]) for (const side of [-1, 1]) batch.add(dark, new THREE.CylinderGeometry(0.18, 0.22, 0.6, 7), place(side * 2.1, v, DOCK_Y + 0.3));
  addLantern(batch, p, place(2.1, 31.5, DOCK_Y));
  addLantern(batch, p, place(-2.1, 31.5, DOCK_Y));
  addLantern(batch, p, place(-20, 4.5, DOCK_Y));
  addLantern(batch, p, place(20, 4.5, DOCK_Y));
  // Marchandises sur le quai.
  addBarrel(batch, p, place(-8, 0, DOCK_Y));
  addBarrel(batch, p, place(-7.4, 0.6, DOCK_Y));
  addBarrel(batch, p, place(-8.2, 1.2, DOCK_Y, 0.4));
  addCrate(batch, p, place(8, 0.5, DOCK_Y, 0.3));
  addCrate(batch, p, place(9, 1.5, DOCK_Y, -0.2));
  addCrate(batch, p, place(8.5, 1, DOCK_Y + 0.42, 0.1));
  addRopeCoil(batch, p, place(1.2, 26, DOCK_Y));
  addRopeCoil(batch, p, place(-12, 3, DOCK_Y));

  // Village : cabanes, taverne, entrepôt (les murs descendent sous terre pour ne jamais flotter sur une pente).
  for (const house of HOUSES[of.id] ?? []) addHouse(batch, house);
  const rand = seeded(VILLAGE_SEED[of.id] ?? 1);
  const palm = { trunk: std(0x8a6a45), leaf: std(0x3f9a3a), nut: std(0x5a3d20) };
  for (const [u, v] of VILLAGE_PALMS[of.id] ?? []) {
    const q = at(u, v);
    addPalm(batch, palm, q.x, ground(u, v) - 0.2, q.z, rand() * Math.PI * 2, rand);
  }
  for (const [u, v] of [[-4, -16], [5, -16], [-16, -26]]) addLantern(batch, p, place(u, v, ground(u, v)));


  const group = new THREE.Group();
  const lanterns = addStatics(group, batch.build());
  return { group, lanterns };
}

const wallMaterials = new Map<number, THREE.Material>();
const material = (color: number) => {
  let m = wallMaterials.get(color);
  if (!m) wallMaterials.set(color, (m = std(color)));
  return m;
};

function addHouse(batch: GeometryBatch, h: House) {
  const y = ground(h.u, h.v);
  const sunk = 2;
  const dark = material(0x2b2118);
  batch.add(material(h.wall), new THREE.BoxGeometry(h.w, h.h + sunk, h.d), place(h.u, h.v, y + (h.h - sunk) / 2, h.rot));
  // Toit en pyramide : un cône à 4 pans tourné de 45° pour que ses arêtes suivent les murs.
  const roofHeight = Math.min(h.w, h.d) * 0.45;
  const roof = new THREE.ConeGeometry(1, 1, 4);
  roof.rotateY(Math.PI / 4);
  const k = Math.SQRT1_2;
  batch.add(material(h.roof), roof, place(h.u, h.v, y + h.h + roofHeight / 2, h.rot, [(h.w / 2 + 0.5) / k, roofHeight, (h.d / 2 + 0.5) / k]));
  // Façade côté mer : porte et fenêtres (éclairées la nuit).
  const front = h.d / 2 + 0.05;
  const local = (du: number, dv: number) => {
    // Décalage dans le repère de la maison (tournée de h.rot).
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    return { u: h.u + du * c + dv * s, v: h.v - du * s + dv * c };
  };
  const door = local(0, front);
  batch.add(dark, new THREE.BoxGeometry(1, 1.9, 0.1), place(door.u, door.v, y + 0.95, h.rot));
  for (const side of [-1, 1]) {
    const win = local(side * h.w * 0.3, front);
    batch.add(windowMaterial, new THREE.BoxGeometry(0.8, 0.7, 0.1), place(win.u, win.v, y + h.h * 0.6, h.rot));
  }
  if (h.w >= 9) {
    // Enseigne de la taverne.
    const sign = local(h.w / 2 + 0.6, front + 0.6);
    batch.add(dark, new THREE.CylinderGeometry(0.08, 0.08, 3, 5), place(sign.u, sign.v, y + 1.5, h.rot));
    batch.add(material(0xb08a5a), new THREE.BoxGeometry(1.4, 0.8, 0.08), place(sign.u, sign.v, y + 2.6, h.rot));
  }
}
