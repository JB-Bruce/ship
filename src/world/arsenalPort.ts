import * as THREE from 'three';
import { LIVERIES } from '../config';
import { paletteFor } from '../ship/parts/common';
import { addStatics, type LanternSpot } from '../ship/parts/nightGlow';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../ship/parts/props';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import { addShipyard } from './arsenalYard';
import { land, type Island } from './island';
import { addTownBuilding, portFrame, tint, TOWN_COLORS, type PortFrame, type TownBuilding } from './townBuildings';

/** Dessus des quais de pierre (m), et pied de leur mur côté mer, sous l'eau. */
export const QUAY_TOP = 1.7;
const QUAY_FOOT = -2.5;
/** Quai le long du rivage de la crique : de … à … (rad, depuis l'axe de la crique), largeur (m) et saillie sur l'eau. */
const QUAY = { from: -0.32, to: 0.15, width: 9, out: 2, step: 3 };
/** Môle de pierre (le long de l'axe de la crique, décalé à bâbord en entrant) : u, v de départ et de fin, largeur. */
const MOLE = { u: -17, from: -2, to: 32, width: 7 };
const COLORS = { quay: 0x9a948a, coping: 0x6f6a62, paving: [0xa49c8e, 0x928a7d], water: 0x3f7f95, iron: 0x2a2a2e };

/**
 * Port-Royal, arsenal de la Marine : quai maçonné qui suit le rivage de la crique, môle de pierre et son fanal, ponton
 * de bois pour les chaloupes, cale de construction (arsenalYard.ts), place d'armes pavée et sa fontaine, palais du
 * gouverneur, église, magasins, douane, taverne, amirauté et rues de maisons à étages ; lanternes sur les quais et la
 * place (halos de nuit). Le terrain de la ville est aplani (IslandShapeDef.town).
 */
export function buildArsenalPort(island: Island): { group: THREE.Group; lanterns: LanternSpot[] } {
  const f = portFrame(island);
  const batch = new GeometryBatch();
  const p = paletteFor(LIVERIES.player);
  addQuay(batch, island, p);
  addMole(batch, f, p);
  addPontoon(batch, f);
  addShipyard(batch, island);
  addSquare(batch, f, p);
  for (const b of BUILDINGS) addTownBuilding(batch, f, b);
  addPalace(batch, f);
  addChurch(batch, f);
  addArsenalYardProps(batch, f, p);
  const group = new THREE.Group();
  const lanterns = addStatics(group, batch.build());
  return { group, lanterns };
}

/** Bâtiments de la ville (hors palais et église). Les maisons forment deux rues derrière le palais. */
const BUILDINGS: TownBuilding[] = [
  { u: 31, v: -15, w: 12, d: 18, h: 7, floors: 2, wall: 0xb8b0a0, roof: 0x3e4a5e, roofStyle: 'nave', door: 3.2 }, // magasin général
  { u: -36, v: -16, w: 24, d: 8, h: 5, floors: 1, wall: 0xc9b48a, roof: 0x8a3b2a, roofStyle: 'gable', door: 2.6 }, // corderie
  { u: -31, v: -32, w: 10, d: 9, h: 7.5, floors: 2, wall: 0xe8e2d4, roof: 0x3e4a5e, roofStyle: 'hip' }, // douane
  { u: 30, v: -34, w: 10, d: 9, h: 7, floors: 2, wall: 0xd9c9a8, roof: 0x8a3b2a, roofStyle: 'hip', chimney: true }, // taverne de l'Ancre Royale
  { u: 30, v: -52, w: 12, d: 10, h: 8, floors: 2, wall: 0xb8b0a0, roof: 0x3e4a5e, roofStyle: 'hip' }, // amirauté
  ...houses(-66, [-44, -31, -17, 17, 31, 44], 0),
  ...houses(-80, [-38, -24, -10, 10, 24, 38], 1),
];

/** Une rue de maisons à étages, couleurs et toits variés. */
function houses(v: number, us: readonly number[], seed: number): TownBuilding[] {
  const walls = [0xe8e2d4, 0xc9b48a, 0xb8b0a0, 0xd9c9a8];
  const roofs = [0x3e4a5e, 0x8a3b2a, 0x6a4a3a];
  return us.map((u, i) => ({
    u,
    v: v + ((i + seed) % 3) - 1,
    w: 9 + ((i * 2 + seed) % 3),
    d: 7,
    h: 6 + ((i + seed) % 2) * 1.5,
    floors: 2,
    wall: walls[(i + seed) % walls.length],
    roof: roofs[(i * 2 + seed) % roofs.length],
    roofStyle: (i + seed) % 2 === 0 ? 'gable' : 'hip',
    chimney: true,
  }));
}

/** Quai maçonné : un ruban de pierre qui suit le rivage (normale de la côte), mur côté mer, margelle, bittes, lanternes. */
function addQuay(batch: GeometryBatch, island: Island, p: Palette) {
  const bay = island.def.bay.angle;
  // Points du rivage espacés d'environ QUAY.step m (la côte de la crique est très inégalement répartie en angle).
  const coast: THREE.Vector3[] = [];
  let last: { x: number; z: number } | null = null;
  for (let t = QUAY.from; t <= QUAY.to; t += 0.002) {
    const c = island.pointAt(bay + t, 0);
    if (last && Math.hypot(c.x - last.x, c.z - last.z) < QUAY.step) continue;
    coast.push(new THREE.Vector3(c.x, 0, c.z));
    last = c;
  }
  const n = { x: 0, z: 0 };
  const outer: THREE.Vector3[] = [];
  const inner: THREE.Vector3[] = [];
  const lip: THREE.Vector3[] = [];
  for (const c of coast) {
    land.gradient(c.x, c.z, n);
    outer.push(new THREE.Vector3(c.x + n.x * QUAY.out, 0, c.z + n.z * QUAY.out));
    lip.push(new THREE.Vector3(c.x + n.x * (QUAY.out - 0.8), 0, c.z + n.z * (QUAY.out - 0.8)));
    inner.push(new THREE.Vector3(c.x - n.x * (QUAY.width - QUAY.out), 0, c.z - n.z * (QUAY.width - QUAY.out)));
  }
  const identity = new THREE.Matrix4();
  batch.add(tint(COLORS.quay), ribbon(outer, inner, QUAY_FOOT, QUAY_TOP), identity);
  batch.add(tint(COLORS.coping), ribbon(outer, lip, QUAY_TOP - 0.05, QUAY_TOP + 0.25), identity);
  // Bittes d'amarrage tous les trois points, une lanterne sur poteau tous les six.
  const iron = tint(COLORS.iron);
  for (let i = 1; i < coast.length - 1; i += 3) {
    const a = lip[i];
    const b = inner[i];
    batch.add(iron, new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), tf(a.x + (b.x - a.x) * 0.05, QUAY_TOP + 0.35, a.z + (b.z - a.z) * 0.05));
    if (i % 6 !== 4) continue;
    const q = new THREE.Vector3().lerpVectors(a, b, 0.75);
    addLampPost(batch, p, tf(q.x, QUAY_TOP, q.z));
  }
}

/** Môle de pierre qui s'avance dans la crique, margelles, bittes, et au bout une tour ronde portant le fanal. */
function addMole(batch: GeometryBatch, f: PortFrame, p: Palette) {
  const { u, from, to, width } = MOLE;
  const length = to - from;
  const mid = (from + to) / 2;
  batch.add(tint(COLORS.quay), new THREE.BoxGeometry(width, QUAY_TOP - QUAY_FOOT, length), f.place(u, mid, (QUAY_TOP + QUAY_FOOT) / 2));
  for (const side of [-1, 1]) {
    batch.add(tint(COLORS.coping), new THREE.BoxGeometry(0.8, 0.3, length), f.place(u + side * (width / 2 - 0.4), mid, QUAY_TOP + 0.1));
    for (let v = from + 6; v < to - 3; v += 8) batch.add(tint(COLORS.iron), new THREE.CylinderGeometry(0.2, 0.26, 0.7, 8), f.place(u + side * (width / 2 - 1.2), v, QUAY_TOP + 0.35));
  }
  // Musoir rond, tour du fanal et sa lanterne.
  batch.add(tint(COLORS.quay), new THREE.CylinderGeometry(4.6, 4.9, QUAY_TOP - QUAY_FOOT, 14), f.place(u, to, (QUAY_TOP + QUAY_FOOT) / 2));
  batch.add(tint(COLORS.coping), new THREE.CylinderGeometry(4.8, 4.8, 0.3, 14), f.place(u, to, QUAY_TOP + 0.1));
  batch.add(tint(0xe8e2d4), new THREE.CylinderGeometry(1.1, 1.4, 6, 10), f.place(u, to, QUAY_TOP + 3));
  batch.add(tint(COLORS.coping), new THREE.CylinderGeometry(1.5, 1.5, 0.35, 10), f.place(u, to, QUAY_TOP + 6.1));
  addLantern(batch, p, f.place(u, to, QUAY_TOP + 6.2, 0, 1.8));
  addLampPost(batch, p, f.place(u, from + 4, QUAY_TOP));
}

/** Ponton de bois sur pilotis pour les chaloupes, de l'autre côté de l'entrée. */
function addPontoon(batch: GeometryBatch, f: PortFrame) {
  const plank = tint(0x8a6440);
  const pile = tint(0x5b4128);
  const u = 15;
  const deckY = QUAY_TOP - 0.2;
  batch.add(plank, new THREE.BoxGeometry(3.2, 0.3, 16), f.place(u, 19, deckY - 0.15));
  for (let v = 12; v <= 26; v += 3.5) {
    for (const side of [-1, 1]) batch.add(pile, new THREE.CylinderGeometry(0.2, 0.22, 5, 6), f.place(u + side * 1.4, v, deckY - 2.5));
  }
}

/** Place d'armes pavée (un pavé par case, posé sur le terrain), fontaine au milieu, lanternes aux coins. */
function addSquare(batch: GeometryBatch, f: PortFrame, p: Palette) {
  const size = 4;
  for (let u = -20; u <= 20; u += size) {
    for (let v = -32; v <= -8; v += size) {
      const tone = COLORS.paving[(Math.round(u / size) + Math.round(v / size)) & 1];
      batch.add(tint(tone), new THREE.BoxGeometry(size - 0.05, 0.6, size - 0.05), f.place(u, v, f.ground(u, v) - 0.25));
    }
  }
  const y = f.ground(0, -20);
  batch.add(tint(TOWN_COLORS.stone), new THREE.CylinderGeometry(2.7, 2.9, 0.9, 14), f.place(0, -20, y + 0.3));
  batch.add(tint(COLORS.water), new THREE.CylinderGeometry(2.35, 2.35, 0.1, 14), f.place(0, -20, y + 0.7));
  batch.add(tint(TOWN_COLORS.stone), new THREE.CylinderGeometry(0.45, 0.6, 2.6, 8), f.place(0, -20, y + 1.8));
  batch.add(tint(TOWN_COLORS.darkStone), new THREE.ConeGeometry(0.5, 2.2, 4), f.place(0, -20, y + 4.2, Math.PI / 4));
  for (const [u, v] of [[-21, -7], [21, -7], [-21, -33], [21, -33]]) addLampPost(batch, p, f.place(u, v, f.ground(u, v)));
}

/** Palais du gouverneur, face à la place : deux étages, avant-corps à fronton, colonnes et perron. */
function addPalace(batch: GeometryBatch, f: PortFrame) {
  const floor = addTownBuilding(batch, f, { u: 0, v: -46, w: 20, d: 11, h: 9, floors: 2, wall: 0xe8e2d4, roof: 0x3e4a5e, roofStyle: 'hip', door: 1.8 });
  const front = -46 + 11 / 2;
  const white = tint(0xf2ede2);
  batch.add(tint(0xe8e2d4), new THREE.BoxGeometry(7, 10, 1.6), f.place(0, front + 0.8, floor + 5));
  batch.add(tint(TOWN_COLORS.cornice), new THREE.BoxGeometry(7.4, 0.35, 1.9), f.place(0, front + 0.8, floor + 9.9));
  batch.add(tint(0x3e4a5e), roofPediment(), f.place(0, front + 0.9, floor + 10));
  batch.add(tint(TOWN_COLORS.door), new THREE.BoxGeometry(1.8, 2.6, 0.12), f.place(0, front + 1.64, floor + 1.3));
  for (const x of [-2.6, -0.9, 0.9, 2.6]) batch.add(white, new THREE.CylinderGeometry(0.28, 0.32, 4.2, 8), f.place(x, front + 2.2, floor + 2.1));
  batch.add(white, new THREE.BoxGeometry(6.6, 0.4, 1.4), f.place(0, front + 2.2, floor + 4.4));
  for (let k = 0; k < 3; k++) batch.add(tint(TOWN_COLORS.stone), new THREE.BoxGeometry(7 - k * 0.6, 0.25, 2.8 - k * 0.6), f.place(0, front + 2.4 - k * 0.3, floor - 0.15 + k * 0.25));
}

/** Fronton triangulaire de l'avant-corps du palais (dans le plan de la façade). */
function roofPediment(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, 1.8, 3);
  // Pointe en haut, dans le plan de la façade.
  g.rotateX(-Math.PI / 2);
  g.scale(4.2, 1.6, 1);
  g.translate(0, 0.8, 0);
  return g;
}

/** Église : nef à pignon vers le large, clocher carré devant, sa flèche d'ardoise, son cadran. */
function addChurch(batch: GeometryBatch, f: PortFrame) {
  addTownBuilding(batch, f, { u: -30, v: -52, w: 9, d: 16, h: 8, floors: 1, wall: 0xd9d2c2, roof: 0x8a3b2a, roofStyle: 'nave', door: 1.8 });
  const y = f.ground(-30, -42) + 0.1;
  batch.add(tint(0xd9d2c2), new THREE.BoxGeometry(4.6, 18, 4.6), f.place(-30, -42, y + 9 - 2));
  batch.add(tint(TOWN_COLORS.cornice), new THREE.BoxGeometry(5, 0.4, 5), f.place(-30, -42, y + 16));
  for (const [du, dv] of [[0, 2.33], [0, -2.33], [2.33, 0], [-2.33, 0]]) {
    batch.add(tint(TOWN_COLORS.door), new THREE.BoxGeometry(dv ? 1.2 : 0.1, 2.2, dv ? 0.1 : 1.2), f.place(-30 + du, -42 + dv, y + 14.2));
  }
  batch.add(tint(0xf2ede2), new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), f.place(-30, -39.66, y + 11.5, 0, 1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  batch.add(tint(0x3e4a5e), new THREE.ConeGeometry(3.3, 8, 4), f.place(-30, -42, y + 20.2, Math.PI / 4));
  batch.add(tint(TOWN_COLORS.door), new THREE.BoxGeometry(1.4, 2.4, 0.1), f.place(-30, -39.66, y + 1.2));
}

/** Pièces d'artillerie, piles de boulets et marchandises sur le quai, grue près du môle. */
function addArsenalYardProps(batch: GeometryBatch, f: PortFrame, p: Palette) {
  const gun = buildCarriageGunGeometry();
  const iron = tint(COLORS.iron);
  for (const [u, v, r] of [[11, -3, 0.3], [14, -2, 0.1], [17, -1, -0.2]] as const) batch.add(iron, gun.clone(), f.place(u, v, Math.max(QUAY_TOP, f.ground(u, v)), r));
  for (const [u, v] of [[12, -6], [16.5, -5]]) {
    const y = Math.max(QUAY_TOP, f.ground(u, v));
    // Pile de boulets en pyramide.
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 3 - k; i++) for (let j = 0; j < 3 - k; j++) {
        batch.add(iron, new THREE.IcosahedronGeometry(0.16, 0), f.place(u + (i - (2 - k) / 2) * 0.32, v + (j - (2 - k) / 2) * 0.32, y + 0.16 + k * 0.26));
      }
    }
  }
  for (const [u, v] of [[-6, -4], [-5.3, -3.4], [8, -3], [8.6, -2.5]]) addBarrel(batch, p, f.place(u, v, Math.max(QUAY_TOP, f.ground(u, v))));
  for (const [u, v] of [[-9, -3], [10, -4]]) addCrate(batch, p, f.place(u, v, Math.max(QUAY_TOP, f.ground(u, v))));
  addRopeCoil(batch, p, f.place(-12, -2, QUAY_TOP));
  // Grue de bois : mât, flèche inclinée vers l'eau, câble.
  const wood = tint(0x6b4a30);
  const cy = Math.max(QUAY_TOP, f.ground(-8, -1));
  batch.add(wood, new THREE.BoxGeometry(0.7, 9, 0.7), f.place(-8, -1, cy + 4.5));
  batch.add(wood, new THREE.BoxGeometry(0.4, 0.4, 9), f.place(-8, 2.6, cy + 9.2).multiply(new THREE.Matrix4().makeRotationX(-0.35)));
  batch.add(tint(TOWN_COLORS.door), new THREE.CylinderGeometry(0.03, 0.03, 6, 4), f.place(-8, 6.8, cy + 7.6));
}

/** Lanterne sur un poteau de fer (quais, place) : `place` = pied du poteau. */
function addLampPost(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  batch.add(tint(COLORS.iron), new THREE.CylinderGeometry(0.09, 0.13, 3, 6), place.clone().multiply(tf(0, 1.5, 0)));
  addLantern(batch, p, place.clone().multiply(tf(0, 2.9, 0, 0, 0, 0, 1.4)));
}

/**
 * Ruban de pierre entre deux lignes de points (`outer` côté mer, `inner` côté terre), de `bottom` à `top` : dessus,
 * mur extérieur, mur intérieur et bouts. Faces tournées vers l'extérieur.
 */
function ribbon(outer: readonly THREE.Vector3[], inner: readonly THREE.Vector3[], bottom: number, top: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const at = (p: THREE.Vector3, y: number) => [p.x, y, p.z];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  // Quadrilatère a-b-c-d, retourné si sa normale ne regarde pas vers `want`.
  const quad = (a: number[], b: number[], c: number[], d: number[], want: THREE.Vector3) => {
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    n.crossVectors(e1, e2);
    if (n.dot(want) < 0) [b, d] = [d, b];
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const away = new THREE.Vector3();
  for (let i = 0; i < outer.length - 1; i++) {
    const [o0, o1, i0, i1] = [outer[i], outer[i + 1], inner[i], inner[i + 1]];
    quad(at(o0, top), at(o1, top), at(i1, top), at(i0, top), up);
    away.subVectors(o0, i0).setY(0);
    quad(at(o0, bottom), at(o1, bottom), at(o1, top), at(o0, top), away);
    quad(at(i0, bottom), at(i1, bottom), at(i1, top), at(i0, top), away.clone().negate());
  }
  for (const [k, sign] of [[0, -1], [outer.length - 1, 1]] as const) {
    const along = new THREE.Vector3().subVectors(outer[Math.min(k + 1, outer.length - 1)], outer[Math.max(k - 1, 0)]).multiplyScalar(sign);
    quad(at(outer[k], bottom), at(inner[k], bottom), at(inner[k], top), at(outer[k], top), along);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
