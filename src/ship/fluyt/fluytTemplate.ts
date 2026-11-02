import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { fluytLamps } from './fluytLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, sideTf, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import type { Station } from '../parts/hullShape';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, buildSquareSail, cylinderBetween } from '../parts/sails';
import { addBow, addCastles, addStern, HULL_WOOD } from './fluytDecor';
import { BATTERY_Y, DECK_Y, WALES, type FluytLayout, type Mast } from './fluytLayout';

/** Haut du pavois peint aux couleurs du camp, sous la lisse de plat-bord (m). */
const BULWARK_BAND = 0.45;
/** Porte-haubans : planches qui débordent du bordé sous le plat-bord, où les haubans s'écartent (largeur, m). */
const CHANNEL = { below: 0.3, width: 0.4 };
/** Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière. */
const SHROUD_FEET = [-0.45, -1, -1.55];

export interface FluytTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues, dans l'ordre de FluytLayout.squareSails. */
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  spritsail: THREE.BufferGeometry;
  /** Voile latine d'artimon dans le repère de sa vergue (voir buildLateenSail), sa vergue, et l'inclinaison de ce repère. */
  lateen: THREE.BufferGeometry;
  lateenYard: THREE.BufferGeometry;
  lateenPitch: number;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord de la batterie (pointe vers +X). */
  batteryGun: THREE.BufferGeometry;
  deckGun: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, allongée) et par livrée. */
const templates = new Map<FluytLayout, Map<Livery, FluytTemplate>>();

export function fluytTemplateFor(layout: FluytLayout, livery: Livery): FluytTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: FluytLayout, livery: Livery): FluytTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const { hull, quarterdeck: qd, poop, forecastle: fc, at } = L;

  // Coque en bois clair ; ponts planchés (principal, gaillard d'arrière, dunette, gaillard d'avant).
  const shell = hull.buildHull();
  batch.add(HULL_WOOD, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, qd.to, fc.from);
  for (const deck of [qd, poop, fc]) {
    batch.add(p.floor, hull.buildFloor(deck.y, deck.from, deck.to, 0.96), identity);
    addDeckSeams(batch, p.dark, hull, deck.y, deck.from, deck.to);
  }

  // Couleurs du camp : préceintes qui suivent la tonture en banane, haut du pavois ; lisse de plat-bord.
  for (const w of WALES) {
    const low = (_s: Station, u: number) => w.y + w.sheer * L.sheer(u) - w.height / 2;
    batch.add(p.hull, hull.buildBand(low, (s, u) => low(s, u) + w.height, 0.02), identity);
  }
  batch.add(p.hull, hull.buildBand((s) => s.gunwale - BULWARK_BAND, (s) => s.gunwale, 0.012), identity);
  for (const side of [1, -1] as const) batch.add(p.trim, hull.buildRail(side, 1, 0, 0.08), identity);

  // Sabords : batterie couverte dans le bordé (ils suivent la tonture), canons des gaillards dans le pavois.
  for (const side of [1, -1] as const) {
    for (const u of L.batteryPorts) batch.add(p.dark, box(0.06, 0.5, 0.54), sideTf(hull, L.station(u), BATTERY_Y + L.sheer(u), side, 0.03));
    for (const { u, y } of L.deckSlots) batch.add(p.dark, box(0.05, 0.4, 0.46), sideTf(hull, L.station(u), y + 0.4, side, 0.02));
  }
  addCastles(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);
  addMasts(batch, p, L);

  // Pont principal : grandes écoutilles de la cale, cabestan, cargaison ; colonne de la roue sur le gaillard d'arrière.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, 'grating');
  const capstan = at(-0.32).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.3, 0.36, 0.75, 8), tf(0, DECK_Y + 0.38, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), tf(0, DECK_Y + 0.78, capstan));
  batch.add(p.wood, box(0.14, L.wheel.y - qd.y, 0.14), tf(0, (L.wheel.y + qd.y) / 2, L.wheel.z - 0.12));
  addCrate(batch, p, tf(0.9, DECK_Y, at(0.42).z, 0, 0.15));
  addCrate(batch, p, tf(0.85, DECK_Y + 0.42, at(0.42).z, 0, -0.1));
  addCrate(batch, p, tf(-0.9, DECK_Y, at(0.15).z, 0, 0.3));
  addBarrel(batch, p, tf(-0.95, DECK_Y, at(-0.12).z));
  addBarrel(batch, p, tf(-0.6, DECK_Y, at(-0.15).z, 0, 0.7));
  addBarrel(batch, p, tf(0.9, DECK_Y, at(-0.24).z, 0, 1.2));
  addBarrel(batch, p, tf(0.6, fc.y, at(0.8).z));
  addRopeCoil(batch, p, tf(-0.55, DECK_Y, L.foreMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.55, DECK_Y, L.mainMast.z - 0.8));
  addRopeCoil(batch, p, tf(-0.5, qd.y, L.mizzenMast.z + 0.9));

  const yard = (width: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, width + 0.5, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  const lateen = buildLateenSail(L.mizzenSail);
  addLampFixtures(batch, p, fluytLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.55)),
    yards: L.squareSails.map((s) => yard(s.width, s.width > 5 ? 0.08 : 0.06)),
    spritsail: buildSquareSail(L.spritsail.width, L.spritsail.height, 0.3),
    lateen: lateen.sail,
    lateenYard: cylinderBetween(new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(0, 0, lateen.yardLength + 0.3), 0.09, 0.05),
    lateenPitch: lateen.pitch,
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.2),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Mâts (hune, chouque), hampe du pavillon au grand mât, porte-haubans de chaque mât. */
function addMasts(batch: GeometryBatch, p: Palette, L: FluytLayout) {
  const { hull } = L;
  for (const mast of [L.foreMast, L.mainMast, L.mizzenMast]) {
    const radius = mast === L.mizzenMast ? 0.18 : 0.25;
    const platform = mast === L.mizzenMast ? 0.55 : 0.75;
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    batch.add(p.wood, new THREE.CylinderGeometry(platform, platform * 0.9, 0.1, 10), tf(0, mast.topPlatform, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
    const mid = hull.stationAt((mast.z + (SHROUD_FEET[0] + SHROUD_FEET[2]) / 2) / hull.halfLength);
    const length = SHROUD_FEET[0] - SHROUD_FEET[2] + 0.6;
    const y = mid.gunwale - CHANNEL.below;
    for (const side of [1, -1]) batch.add(p.wood, new THREE.BoxGeometry(CHANNEL.width, 0.08, length), tf(side * (hull.halfWidthAt(mid, y) + CHANNEL.width / 2), y, mid.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.035, 0.035, 1.3, 4), tf(0, L.mainMast.top + 0.65, L.mainMast.z));
}

/** Haubans des trois mâts (sur les porte-haubans), étais (artimon → grand mât → misaine → beaupré), sous-barbe. */
function buildRigging(L: FluytLayout): THREE.BufferGeometry {
  const { hull } = L;
  const head = (m: Mast) => new THREE.Vector3(0, m.top - 0.4, m.z);
  const [fore, main, mizzen] = [head(L.foreMast), head(L.mainMast), head(L.mizzenMast)];
  const points: THREE.Vector3[] = [
    fore, L.bowsprit.tip,
    main, new THREE.Vector3(0, L.foreMast.topPlatform + 0.3, L.foreMast.z),
    mizzen, new THREE.Vector3(0, L.mainMast.topPlatform - 1, L.mainMast.z),
    L.bowsprit.tip, new THREE.Vector3(0, 1.2, hull.stationAt(1).z - 0.1),
  ];
  for (const side of [1, -1]) {
    for (const mast of [L.foreMast, L.mainMast, L.mizzenMast]) {
      const top = new THREE.Vector3(side * 0.5, mast.topPlatform, mast.z);
      for (const dz of SHROUD_FEET) {
        const s = hull.stationAt((mast.z + dz) / hull.halfLength);
        const y = s.gunwale - CHANNEL.below;
        points.push(top, new THREE.Vector3(side * (hull.halfWidthAt(s, y) + CHANNEL.width * 0.9), y, s.z));
      }
      // Haubans de hune : de la tête du mât au bord de la hune.
      points.push(head(mast), new THREE.Vector3(side * 0.7, mast.topPlatform, mast.z - 0.2));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
