import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Landmass } from './landmass';

/** Pierre blonde des murs, pierre sombre des chaînages et des marches, tuiles, bois noirci, croix des tombes. */
const M = {
  stone: std(0xb9ab8e, { roughness: 1 }),
  dark: std(0x8c806b, { roughness: 1 }),
  tile: std(0xa0553a),
  wood: std(0x4a3a2c),
  cross: std(0x9a8f80, { roughness: 1 }),
};
/** Chapelle : largeur, longueur, épaisseur et hauteur des murs (m) ; les murs s'enfoncent de `footing` m dans le sol. */
const CHAPEL = { width: 9, length: 16, wall: 0.8, height: 6.5, footing: 2.5 };
/** Tour sans cloche : côté, hauteur du fût, du beffroi ajouré et de sa flèche (m). */
const TOWER = { side: 4.2, shaft: 11, belfry: 3.4, spire: 3 };
/** Hauteur de chaque tronçon d'un long pan de mur écroulé (part de la hauteur), de l'avant vers l'arrière. */
const SIDE_WALL = [1, 0.85, 0.55, 0.35, 0.7, 0.95, 1, 0.8];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Repère d'un bâtiment posé sur une terre : origine au sol, +z vers sa façade. */
class Footprint {
  readonly ground: number;
  private readonly sin: number;
  private readonly cos: number;

  constructor(
    readonly land: Landmass,
    readonly x: number,
    readonly z: number,
    readonly facing: number,
    reach: number,
  ) {
    this.sin = Math.sin(facing);
    this.cos = Math.cos(facing);
    // Le sol le plus bas sous l'emprise : rien ne flotte au-dessus d'une pente.
    let low = Infinity;
    for (const [dx, dz] of [[0, 0], [reach, reach], [-reach, reach], [reach, -reach], [-reach, -reach]]) low = Math.min(low, land.heightAt(this.wx(dx, dz), this.wz(dx, dz)));
    this.ground = low;
  }

  wx = (dx: number, dz: number) => this.x + dx * this.cos + dz * this.sin;
  wz = (dx: number, dz: number) => this.z - dx * this.sin + dz * this.cos;

  /** Matrice d'une pièce posée en (dx, y, dz) du repère, tournée de `yaw` en plus et inclinée (`pitch`, `roll`). */
  at(dx: number, y: number, dz: number, yaw = 0, pitch = 0, roll = 0): THREE.Matrix4 {
    return tf(this.wx(dx, dz), this.ground + y, this.wz(dx, dz), pitch, this.facing + yaw, roll);
  }
}

/** Chapelle sans toit : murs écroulés par endroits, façade à fronton percée d'une porte, chevet, restes de charpente. */
function addChapel(batch: GeometryBatch, f: Footprint) {
  const { width, length, wall, height, footing } = CHAPEL;
  const half = length / 2;
  const segment = length / SIDE_WALL.length;
  for (const side of [1, -1]) {
    SIDE_WALL.forEach((k, i) => {
      // Les deux pans ne s'écroulent pas aux mêmes endroits.
      const h = height * (side > 0 ? k : SIDE_WALL[SIDE_WALL.length - 1 - i]);
      const z = half - segment * (i + 0.5);
      batch.add(M.stone, box(wall, h + footing, segment + 0.02), f.at(side * (width / 2), (h - footing) / 2, z));
    });
    // Contreforts sombres.
    for (const z of [half - 0.4, 0, -half + 0.4]) batch.add(M.dark, box(1.1, height * 0.55 + footing, 1.2), f.at(side * (width / 2 + 0.7), (height * 0.55 - footing) / 2, z));
  }
  // Façade : deux pans de part et d'autre de la porte, linteau, fronton triangulaire.
  const door = 2.4;
  const pier = (width - door) / 2;
  for (const side of [1, -1]) batch.add(M.stone, box(pier, height + footing, wall), f.at(side * (door / 2 + pier / 2), (height - footing) / 2, half));
  batch.add(M.dark, box(door + 0.6, 0.7, wall + 0.1), f.at(0, 3.6, half));
  batch.add(M.stone, box(door, height - 3.95, wall), f.at(0, 3.95 + (height - 3.95) / 2, half));
  const triangle = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, 2.6)]);
  const gable = new THREE.ExtrudeGeometry(triangle, { depth: wall, bevelEnabled: false });
  gable.translate(0, 0, -wall / 2);
  batch.add(M.stone, gable, f.at(0, height, half));
  // Petite croix de pierre au sommet du fronton, penchée.
  batch.add(M.dark, box(0.25, 1.4, 0.25), f.at(0, height + 3.2, half, 0, 0, 0.15));
  batch.add(M.dark, box(0.9, 0.22, 0.25), f.at(-0.08, height + 3.4, half, 0, 0, 0.15));
  // Chevet : mur du fond, à moitié tombé.
  batch.add(M.stone, box(width, height * 0.6 + footing, wall), f.at(0, (height * 0.6 - footing) / 2, -half));
  // Sol dallé, marches du seuil, autel renversé.
  batch.add(M.dark, box(width - wall, 0.3, length - wall), f.at(0, 0.15, 0));
  batch.add(M.dark, box(door + 1.4, 0.3, 1.2), f.at(0, 0.15, half + 0.9));
  batch.add(M.stone, box(2.6, 1.1, 1.2), f.at(0.4, 0.55, -half + 2, 0.4, 0, 0.12));
  // Charpente : quelques chevrons encore debout au fond, et un pan de tuiles.
  for (const z of [-half + 1.2, -half + 3.2, -half + 5.2]) {
    for (const side of [1, -1]) batch.add(M.wood, box(0.25, 0.25, width * 0.62), f.at(side * width * 0.24, height + 1.2, z, side * Math.PI / 2, 0, side * 0.62));
  }
  batch.add(M.tile, box(width * 0.6, 0.18, 5.5), f.at(width * 0.26, height + 1.25, -half + 3.2, 0, 0, -0.62));
  // Éboulis : blocs tombés des murs, dedans et dehors.
  const blocks: [number, number, number][] = [[3.8, 3.5, 0.3], [-3.6, -1.5, 1.1], [5.6, 1, 0.7], [-5.8, 4.5, 2.1], [1.5, -5, 1.6], [-2, 2, 0.4], [6, -4, 2.6]];
  for (const [dx, dz, turn] of blocks) batch.add(M.stone, box(0.9, 0.6, 0.7), f.at(dx, 0.25, dz, turn, turn * 0.3, turn * 0.2));
}

/** Tour sans cloche : fût de pierre, beffroi ajouré aux quatre arches vides, flèche, la poutre où pendait la cloche. */
function addTower(batch: GeometryBatch, f: Footprint) {
  const { side, shaft, belfry, spire } = TOWER;
  batch.add(M.stone, box(side, shaft + CHAPEL.footing, side), f.at(0, (shaft - CHAPEL.footing) / 2, 0));
  batch.add(M.dark, box(side + 0.5, 0.5, side + 0.5), f.at(0, shaft, 0));
  // Quatre piliers d'angle : les arches du beffroi sont vides.
  const p = side / 2 - 0.45;
  for (const [x, z] of [[p, p], [-p, p], [p, -p], [-p, -p]]) batch.add(M.stone, box(0.9, belfry, 0.9), f.at(x, shaft + 0.25 + belfry / 2, z));
  batch.add(M.dark, box(side + 0.5, 0.45, side + 0.5), f.at(0, shaft + belfry + 0.45, 0));
  const roof = new THREE.ConeGeometry(side * 0.75, spire, 4);
  roof.rotateY(Math.PI / 4);
  batch.add(M.tile, roof, f.at(0, shaft + belfry + 0.7 + spire / 2, 0));
  // La poutre de la cloche, et sa ferrure : il n'y pend plus rien.
  batch.add(M.wood, box(side - 0.4, 0.3, 0.3), f.at(0, shaft + belfry - 0.5, 0));
  batch.add(M.dark, box(0.12, 0.6, 0.12), f.at(0, shaft + belfry - 0.95, 0));
  // Porte basse.
  batch.add(M.wood, box(1.2, 2.2, 0.1), f.at(0, 1.1, side / 2 + 0.02));
}

/** Petit cimetière : croix de pierre et de bois penchées, deux dalles. */
function addGraves(batch: GeometryBatch, f: Footprint) {
  const rows: [number, number, number][] = [[-3, -1.5, 0.12], [-1, -1.8, -0.2], [1, -1.4, 0.05], [3, -1.7, 0.25], [-2, 1.4, -0.1], [0, 1.6, 0.3], [2.2, 1.3, -0.25]];
  rows.forEach(([dx, dz, lean], i) => {
    const material = i % 3 === 0 ? M.wood : M.cross;
    batch.add(material, box(0.18, 1.5, 0.14), f.at(dx, 0.5, dz, 0, lean * 0.4, lean));
    batch.add(material, box(0.7, 0.16, 0.14), f.at(dx + lean * 0.4, 0.95, dz, 0, lean * 0.4, lean));
  });
  batch.add(M.dark, box(0.9, 0.2, 1.9), f.at(-0.2, 0.1, 3.4, 0.2));
  batch.add(M.dark, box(0.9, 0.2, 1.9), f.at(1.6, 0.1, 3.6, -0.1));
}

/** Puits de pierre et son portique de bois. */
function addWell(batch: GeometryBatch, f: Footprint) {
  const ring = new THREE.CylinderGeometry(1, 1.1, 1, 10, 1, true);
  batch.add(M.stone, ring, f.at(0, 0.5, 0));
  batch.add(M.dark, new THREE.CylinderGeometry(0.95, 0.95, 0.1, 10), f.at(0, 0.3, 0));
  for (const x of [1, -1]) batch.add(M.wood, box(0.16, 2.2, 0.16), f.at(x, 1.1, 0));
  batch.add(M.wood, box(2.3, 0.16, 0.16), f.at(0, 2.15, 0));
}

/** Les ruines de la mission de San Telmo : chapelle, tour sans cloche, cimetière et puits, posés sur leur terre. */
export function buildMissionRuins(land: Landmass, spots: {
  chapel: { x: number; z: number; facing: number };
  tower: { x: number; z: number };
  graves: { x: number; z: number };
  well: { x: number; z: number };
}): THREE.Group {
  const batch = new GeometryBatch();
  const { chapel, tower, graves, well } = spots;
  addChapel(batch, new Footprint(land, chapel.x, chapel.z, chapel.facing, CHAPEL.length / 2));
  addTower(batch, new Footprint(land, tower.x, tower.z, chapel.facing, TOWER.side / 2));
  addGraves(batch, new Footprint(land, graves.x, graves.z, chapel.facing, 3));
  addWell(batch, new Footprint(land, well.x, well.z, chapel.facing, 1));
  const group = new THREE.Group();
  for (const { geometry, material } of batch.build()) group.add(new THREE.Mesh(geometry, material));
  return group;
}
