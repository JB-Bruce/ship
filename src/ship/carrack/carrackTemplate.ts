import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, sideTf, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import type { Station } from '../parts/hullShape';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, buildSquareSail, cylinderBetween } from '../parts/sails';
import { addBow, addCastles, addPavises, addRiders, addStern, DARK_OAK, HULL_OAK } from './carrackDecor';
import { BATTERY_Y, DECK_Y, WALES, type CarrackLayout, type Mast } from './carrackLayout';

/** Porte-haubans : planches qui débordent du bordé sous le plat-bord (dessous du plat-bord, largeur, m). */
const CHANNEL = { below: 0.45, width: 0.5 };
/** Pieds des haubans : à ces distances (m) du pied de chaque mât, vers l'arrière. */
const SHROUD_FEET = [-0.5, -1.15, -1.8, -2.45];
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Taille des pièces couvertes des châteaux, par rapport à un fût de batterie. */
export const CASTLE_GUN_SCALE = 0.8;

export interface CarrackTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues, dans l'ordre de CarrackLayout.squareSails. */
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  spritsail: THREE.BufferGeometry;
  /** Voiles latines (dans le repère de leur vergue, voir buildLateenSail), leurs vergues et l'inclinaison de ce repère. */
  lateens: { sail: THREE.BufferGeometry; yard: THREE.BufferGeometry; pitch: number }[];
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord (pointe vers +X) : batterie et chasse, et plus petit pour les pièces couvertes des châteaux. */
  batteryGun: THREE.BufferGeometry;
  castleGun: THREE.BufferGeometry;
  /** Pièce sur affût, à découvert sur un château. */
  deckGun: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, allongée) et par livrée. */
const templates = new Map<CarrackLayout, Map<Livery, CarrackTemplate>>();

export function carrackTemplateFor(layout: CarrackLayout, livery: Livery): CarrackTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: CarrackLayout, livery: Livery): CarrackTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const { hull, halfDeck, quarterdeck, poop, forecastle, at } = L;

  // Coque en chêne ; ponts planchés (milieu, demi-pont, gaillard d'arrière, dunette, haut du château avant).
  const shell = hull.buildHull();
  batch.add(HULL_OAK, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, halfDeck.to, forecastle.from);
  for (const deck of [halfDeck, quarterdeck, poop, forecastle]) {
    batch.add(p.floor, hull.buildFloor(deck.y, deck.from, deck.to, 0.96), identity);
    addDeckSeams(batch, p.dark, hull, deck.y, deck.from, deck.to);
  }

  // Préceintes en bois sombre qui remontent vers les châteaux, lisse de plat-bord, lisses verticales, pavois peints.
  for (const w of WALES) {
    const low = (_s: Station, u: number) => w.y + w.sheer * L.sheer(u) - w.height / 2;
    batch.add(DARK_OAK, hull.buildBand(low, (s, u) => low(s, u) + w.height, 0.025), identity);
  }
  for (const side of [1, -1] as const) batch.add(p.trim, hull.buildRail(side, 1, 0, 0.09), identity);
  addRiders(batch, L);
  addPavises(batch, p, L);

  // Sabords : batterie basse dans le bordé (ils suivent la tonture), pièces des châteaux dans leurs flancs.
  for (const side of [1, -1] as const) {
    for (const u of L.batteryPorts) batch.add(p.dark, box(0.07, 0.56, 0.6), sideTf(hull, L.station(u), BATTERY_Y + L.sheer(u), side, 0.035));
    for (const { u, y } of L.castleSlots) batch.add(p.dark, box(0.05, 0.42, 0.48), sideTf(hull, L.station(u), y + 0.4, side, 0.03));
  }
  addCastles(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);
  addMasts(batch, p, L);

  // Milieu : écoutilles de la cale, cabestan, cargaison ; colonne de la roue sur le gaillard d'arrière.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, 'grating');
  const capstan = at(0.42).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.34, 0.4, 0.8, 8), tf(0, DECK_Y + 0.4, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.48, 0.48, 0.08, 8), tf(0, DECK_Y + 0.82, capstan));
  batch.add(p.wood, box(0.16, L.wheel.y - quarterdeck.y, 0.16), tf(0, (L.wheel.y + quarterdeck.y) / 2, L.wheel.z - 0.12));
  addCrate(batch, p, tf(1.3, DECK_Y, at(0.18).z, 0, 0.2));
  addCrate(batch, p, tf(1.25, DECK_Y + 0.42, at(0.18).z, 0, -0.1));
  addCrate(batch, p, tf(-1.4, DECK_Y, at(-0.02).z, 0, 0.4));
  addBarrel(batch, p, tf(-1.5, DECK_Y, at(0.24).z));
  addBarrel(batch, p, tf(-1.1, DECK_Y, at(0.26).z, 0, 0.7));
  addBarrel(batch, p, tf(0.9, halfDeck.y, at(-0.42).z, 0, 1.1));
  addBarrel(batch, p, tf(-0.9, forecastle.y, at(0.76).z));
  addRopeCoil(batch, p, tf(-0.7, DECK_Y, L.mainMast.z - 0.9));
  addRopeCoil(batch, p, tf(0.7, forecastle.y, L.foreMast.z - 0.9));
  addRopeCoil(batch, p, tf(-0.6, poop.y, L.bonaventureMast.z + 0.9));

  const yard = (width: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, width + 0.6, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.6)),
    yards: L.squareSails.map((s) => yard(s.width, s.width > 6 ? 0.1 : 0.07)),
    spritsail: buildSquareSail(L.spritsail.width, L.spritsail.height, 0.35),
    lateens: L.lateens.map(({ sail }) => {
      const lateen = buildLateenSail(sail);
      const yardGeometry = cylinderBetween(new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, lateen.yardLength + 0.4), 0.1, 0.06);
      return { sail: lateen.sail, yard: yardGeometry, pitch: lateen.pitch };
    }),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.6),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    castleGun: buildBatteryGun().scale(CASTLE_GUN_SCALE, CASTLE_GUN_SCALE, CASTLE_GUN_SCALE),
    deckGun: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Mâts (grosses hunes rondes, chouques), hampe du pavillon au grand mât, porte-haubans. */
function addMasts(batch: GeometryBatch, p: Palette, L: CarrackLayout) {
  const { hull } = L;
  const masts: [Mast, number, number][] = [
    [L.foreMast, 0.26, 0.9],
    [L.mainMast, 0.34, 1.15],
    [L.mizzenMast, 0.2, 0.65],
    [L.bonaventureMast, 0.16, 0.5],
  ];
  for (const [mast, radius, platform] of masts) {
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    // Hune ronde, en forme de panier.
    batch.add(p.wood, new THREE.CylinderGeometry(platform, platform * 0.7, 0.55, 12, 1, true), tf(0, mast.topPlatform + 0.27, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(platform * 0.7, platform * 0.7, 0.06, 12), tf(0, mast.topPlatform, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
    const mid = hull.stationAt((mast.z + (SHROUD_FEET[0] + SHROUD_FEET[SHROUD_FEET.length - 1]) / 2) / hull.halfLength);
    const length = SHROUD_FEET[0] - SHROUD_FEET[SHROUD_FEET.length - 1] + 0.6;
    const y = mid.gunwale - CHANNEL.below;
    for (const side of [1, -1]) batch.add(p.wood, box(CHANNEL.width, 0.09, length), tf(side * (hull.halfWidthAt(mid, y) + CHANNEL.width / 2), y, mid.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), tf(0, L.mainMast.top + 0.7, L.mainMast.z));
}

/** Haubans des quatre mâts (sur les porte-haubans), étais (contre-artimon → artimon → grand mât → misaine → beaupré), sous-barbe. */
function buildRigging(L: CarrackLayout): THREE.BufferGeometry {
  const { hull } = L;
  const head = (m: Mast) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const [fore, main, mizzen, bonaventure] = [head(L.foreMast), head(L.mainMast), head(L.mizzenMast), head(L.bonaventureMast)];
  const points: THREE.Vector3[] = [
    fore, L.bowsprit.tip,
    main, new THREE.Vector3(0, L.foreMast.topPlatform + 0.4, L.foreMast.z),
    mizzen, new THREE.Vector3(0, L.mainMast.topPlatform - 1.5, L.mainMast.z),
    bonaventure, new THREE.Vector3(0, L.mizzenMast.topPlatform - 2, L.mizzenMast.z),
    L.bowsprit.tip, new THREE.Vector3(0, 2, hull.stationAt(1).z - 0.2),
  ];
  for (const side of [1, -1]) {
    for (const mast of [L.foreMast, L.mainMast, L.mizzenMast, L.bonaventureMast]) {
      const top = new THREE.Vector3(side * 0.6, mast.topPlatform, mast.z);
      for (const dz of SHROUD_FEET) {
        const s = hull.stationAt((mast.z + dz) / hull.halfLength);
        const y = s.gunwale - CHANNEL.below;
        points.push(top, new THREE.Vector3(side * (hull.halfWidthAt(s, y) + CHANNEL.width * 0.9), y, s.z));
      }
      points.push(head(mast), new THREE.Vector3(side * 0.8, mast.topPlatform + 0.5, mast.z - 0.2));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}
