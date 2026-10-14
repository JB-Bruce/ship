import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addStairs } from '../parts/deckFittings';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addBarrel, addCrate, addLantern, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, buildSquareSail, cylinderBetween } from '../parts/sails';
import {
  BOWSPRIT,
  CARAVEL_HULL as hull,
  CHASE_PORT,
  DECK_Y,
  FORECASTLE,
  MAIN_COURSE,
  MAIN_MAST,
  MIZZEN_MAST,
  MIZZEN_SAIL,
  QUARTERDECK,
  SPRITSAIL,
  WHEEL,
} from './caravelLayout';

/** Le canon de chasse : un gros fût seul (pointe vers +X, pivot au sabord), à cette échelle d'un fût de batterie. */
export const CHASE_GUN_SCALE = 1.35;
/** Fanal de poupe : échelle de la lanterne posée sur le plat-bord du tableau arrière. */
const STERN_LANTERN_SCALE = 0.8;
/** Préceintes (lisses du bordé) : hauteurs (m). */
const WALES = [1.3, 0.5] as const;
/** Couronnement : lisse qui ferme le haut du tableau arrière, où est posée la lanterne de poupe (m). */
const TAFFRAIL = { height: 0.16, depth: 0.24 };
/** Fenêtres de la chambre, sous le château arrière (entre le pont principal et le pont du château). */
const CABIN_WINDOW_Y = (DECK_Y + QUARTERDECK.y) / 2 + 0.05;

export interface CaravelTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  mainCourse: THREE.BufferGeometry;
  mainYard: THREE.BufferGeometry;
  spritsail: THREE.BufferGeometry;
  spritYard: THREE.BufferGeometry;
  /** Voile latine dans le repère de sa vergue (voir buildLateenSail), sa vergue, et l'inclinaison de ce repère. */
  lateen: THREE.BufferGeometry;
  lateenYard: THREE.BufferGeometry;
  lateenPitch: number;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  /** Roue de gouvernail (elle tourne autour de Z). */
  wheel: THREE.BufferGeometry;
  cannon: THREE.BufferGeometry;
  chaseGun: THREE.BufferGeometry;
  gunport: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

const templates = new Map<Livery, CaravelTemplate>();

export function caravelTemplateFor(livery: Livery): CaravelTemplate {
  let template = templates.get(livery);
  if (!template) {
    template = buildTemplate(livery);
    templates.set(livery, template);
  }
  return template;
}

function buildTemplate(livery: Livery): CaravelTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const at = (u: number) => hull.stationAt(u);

  // Coque, ponts planchés (principal, château arrière, gaillard d'avant) et lisses.
  const shell = hull.buildHull();
  batch.add(p.hull, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, -0.99, 0.97, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(QUARTERDECK.y, QUARTERDECK.from, QUARTERDECK.to, 0.97), identity);
  batch.add(p.floor, hull.buildFloor(FORECASTLE.y, FORECASTLE.from, FORECASTLE.to, 0.95), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, QUARTERDECK.to, FORECASTLE.from);
  addDeckSeams(batch, p.dark, hull, QUARTERDECK.y, QUARTERDECK.from, QUARTERDECK.to);
  addDeckSeams(batch, p.dark, hull, FORECASTLE.y, FORECASTLE.from, FORECASTLE.to);
  for (const side of [1, -1] as const) {
    batch.add(p.trim, hull.buildRail(side, 1, 0, 0.08), identity);
    batch.add(p.trim, hull.buildRail(side, WALES[0], 0.03, 0.06, true), identity);
    batch.add(p.trim, hull.buildRail(side, WALES[1], 0.02, 0.05, true), identity);
  }
  // Couronnement : la lisse du plat-bord ferme le haut du tableau arrière ; les préceintes en font le tour.
  const stern = at(-1);
  batch.add(p.trim, box(2 * stern.halfWidth + 0.16, TAFFRAIL.height, TAFFRAIL.depth), tf(0, stern.gunwale, stern.z + TAFFRAIL.depth / 2 - 0.08));
  for (const y of WALES) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y) + 0.08, 0.11, 0.08), tf(0, y, stern.z - 0.04));

  // Cloisons du château arrière (porte, fenêtres) et du gaillard d'avant (porte basse vers le canon de chasse).
  const castle = at(QUARTERDECK.to);
  const castleHeight = QUARTERDECK.y - DECK_Y;
  batch.add(p.wood, box(2 * castle.halfWidth * 0.98, castleHeight, 0.12), tf(0, DECK_Y + castleHeight / 2, castle.z));
  batch.add(p.dark, box(0.7, 1.2, 0.04), tf(0, DECK_Y + 0.6, castle.z + 0.07));
  for (const x of [-1.05, 1.05]) batch.add(p.window, box(0.36, 0.3, 0.04), tf(x, DECK_Y + 1.05, castle.z + 0.07));
  const fore = at(FORECASTLE.from);
  const foreHeight = FORECASTLE.y - DECK_Y;
  batch.add(p.wood, box(2 * fore.halfWidth * 0.96, foreHeight, 0.12), tf(0, DECK_Y + foreHeight / 2, fore.z));
  batch.add(p.dark, box(0.6, 0.85, 0.04), tf(0, DECK_Y + 0.42, fore.z - 0.07));
  // Escaliers du pont principal vers le château et vers le gaillard.
  for (const side of [1, -1]) {
    addStairs(batch, p, tf(side * 1.2, DECK_Y, castle.z), castleHeight, 5);
    addStairs(batch, p, tf(side * 1.05, DECK_Y, fore.z, 0, Math.PI), foreHeight, 3);
  }

  // Fenêtres de la chambre, sous le pont du château : tableau arrière (entre deux moulures) et flancs du château.
  for (const x of [-0.9, -0.3, 0.3, 0.9]) batch.add(p.window, box(0.36, 0.42, 0.05), tf(x, CABIN_WINDOW_Y, stern.z - 0.03));
  for (const y of [CABIN_WINDOW_Y - 0.36, CABIN_WINDOW_Y + 0.36]) batch.add(p.trim, box(2 * hull.halfWidthAt(stern, y) - 0.2, 0.08, 0.06), tf(0, y, stern.z - 0.04));
  for (const side of [1, -1]) {
    for (const u of [-0.88, -0.72, -0.58]) {
      const s = at(u);
      batch.add(p.window, box(0.05, 0.34, 0.38), tf(side * (hull.halfWidthAt(s, CABIN_WINDOW_Y) + 0.03), CABIN_WINDOW_Y, s.z));
    }
  }
  addChasePort(batch, p);
  // Colonne de la roue de gouvernail.
  batch.add(p.wood, box(0.14, WHEEL.y - QUARTERDECK.y, 0.14), tf(0, (WHEEL.y + QUARTERDECK.y) / 2, WHEEL.z - 0.12));

  // Mâts : grand mât (hune, chouque, hampe du pavillon) et artimon sur le château ; beaupré.
  batch.add(p.wood, new THREE.CylinderGeometry(0.16, 0.24, MAIN_MAST.top - DECK_Y, 8), tf(0, (MAIN_MAST.top + DECK_Y) / 2, MAIN_MAST.z));
  batch.add(p.wood, new THREE.CylinderGeometry(0.7, 0.62, 0.5, 10), tf(0, MAIN_MAST.topPlatform, MAIN_MAST.z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), tf(0, MAIN_MAST.top + 0.05, MAIN_MAST.z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.2, 4), tf(0, MAIN_MAST.top + 0.6, MAIN_MAST.z));
  const mizzenHeight = MIZZEN_MAST.top - MIZZEN_MAST.base;
  batch.add(p.wood, new THREE.CylinderGeometry(0.11, 0.16, mizzenHeight, 8), tf(0, MIZZEN_MAST.base + mizzenHeight / 2, MIZZEN_MAST.z));
  batch.add(p.dark, new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), tf(0, MIZZEN_MAST.top + 0.05, MIZZEN_MAST.z));
  batch.add(p.wood, cylinderBetween(BOWSPRIT.base, BOWSPRIT.tip, 0.15, 0.08), identity);
  batch.add(p.trim, box(0.12, 3.3, 0.16), tf(0, 1.4, at(1).z - 0.05, -0.25));

  // Cargaison et accastillage, au centre : les flancs du pont principal restent libres pour les canons.
  batch.add(p.dark, box(1.1, 0.12, 0.9), tf(0, DECK_Y + 0.06, at(-0.2).z));
  batch.add(p.trim, box(1.2, 0.08, 1), tf(0, DECK_Y + 0.02, at(-0.2).z));
  addBarrel(batch, p, tf(0.55, FORECASTLE.y, at(0.55).z));
  addBarrel(batch, p, tf(-0.55, FORECASTLE.y, at(0.55).z, 0, 0.7));
  addCrate(batch, p, tf(0.5, QUARTERDECK.y, at(-0.6).z, 0, 0.3));
  addRopeCoil(batch, p, tf(-0.45, DECK_Y, MAIN_MAST.z - 0.8));
  addRopeCoil(batch, p, tf(0.5, QUARTERDECK.y, MIZZEN_MAST.z + 0.7));
  // Lanterne de poupe, debout sur le couronnement.
  addLantern(batch, p, tf(0, stern.gunwale + TAFFRAIL.height / 2, stern.z + TAFFRAIL.depth / 2 - 0.08, 0, 0, 0, STERN_LANTERN_SCALE));

  const lateen = buildLateenSail(MIZZEN_SAIL);
  const chaseGun = buildBatteryGun();
  chaseGun.scale(CHASE_GUN_SCALE, CHASE_GUN_SCALE, CHASE_GUN_SCALE);
  return {
    palette: p,
    statics: batch.build(),
    mainCourse: buildSquareSail(MAIN_COURSE.width, MAIN_COURSE.height, 0.6),
    mainYard: yard(MAIN_COURSE.width + 0.5, 0.08),
    spritsail: buildSquareSail(SPRITSAIL.width, SPRITSAIL.height, 0.3),
    spritYard: yard(SPRITSAIL.width + 0.3, 0.05),
    lateen: lateen.sail,
    lateenYard: cylinderBetween(new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(0, 0, lateen.yardLength + 0.3), 0.09, 0.05),
    lateenPitch: lateen.pitch,
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(1.7),
    wheel: buildWheel(),
    cannon: buildCarriageGunGeometry(),
    chaseGun,
    gunport: new THREE.BoxGeometry(0.05, 0.42, 0.5),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/**
 * Sabord de chasse : un coffre aux couleurs de la coque posé sur l'étrave (il remonte vers l'arrière jusqu'à ce que le
 * bordé ait sa largeur), une ouverture sombre et son cadre sur la face avant, bien en avant de l'étrave.
 */
function addChasePort(batch: GeometryBatch, p: Palette) {
  const { y, width, height, frame, front } = CHASE_PORT;
  const half = width / 2 + frame;
  const fullHeight = height + 2 * frame;
  // De l'étrave vers l'arrière, jusqu'à ce que le bordé, à la hauteur du sabord, soit aussi large que le coffre.
  let u = 1;
  while (u > 0.8 && hull.halfWidthAt(hull.stationAt(u), y) < half) u -= 0.005;
  const back = hull.stationAt(u).z;
  batch.add(p.hull, new THREE.BoxGeometry(2 * half, fullHeight, front - back), tf(0, y, (front + back) / 2));
  batch.add(p.dark, new THREE.BoxGeometry(width, height, 0.03), tf(0, y, front + 0.005));
  for (const s of [1, -1]) {
    batch.add(p.trim, new THREE.BoxGeometry(2 * half, frame, 0.05), tf(0, y + s * (height + frame) / 2, front + 0.01));
    batch.add(p.trim, new THREE.BoxGeometry(frame, height, 0.05), tf(s * (width + frame) / 2, y, front + 0.01));
  }
}

/** Vergue horizontale (le long de X). */
function yard(length: number, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/** Haubans des deux mâts, étai du grand mât vers le beaupré, étai d'artimon vers le grand mât, sous-barbe. */
function buildRigging(): THREE.BufferGeometry {
  const mainTop = new THREE.Vector3(0, MAIN_MAST.topPlatform, MAIN_MAST.z);
  const mizzenTop = new THREE.Vector3(0, MIZZEN_MAST.top - 0.3, MIZZEN_MAST.z);
  const points: THREE.Vector3[] = [
    mainTop, BOWSPRIT.tip,
    mizzenTop, new THREE.Vector3(0, MAIN_MAST.topPlatform - 2.5, MAIN_MAST.z),
    BOWSPRIT.tip, new THREE.Vector3(0, 0.6, hull.stationAt(1).z - 0.1),
  ];
  // Pieds des haubans : à ces distances (m) du pied de chaque mât, sur le plat-bord.
  const shrouds: [THREE.Vector3, number[]][] = [
    [mainTop, [-0.5, -1.2, -1.9, -2.6]],
    [mizzenTop, [-0.5, -1.2]],
  ];
  for (const side of [1, -1]) {
    for (const [from, offsets] of shrouds) {
      for (const dz of offsets) {
        const s = hull.stationAt((from.z + dz) / hull.halfLength);
        points.push(from, new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale), s.gunwale, s.z));
      }
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
