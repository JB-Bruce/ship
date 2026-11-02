import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { galleonLamps } from './galleonLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, sideTf, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import type { Station } from '../parts/hullShape';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, buildSquareSail, cylinderBetween } from '../parts/sails';
import { addCastles, addMouldings, addPavises, DARK_WOOD, GILT, HULL_WOOD } from './galleonDecor';
import { addBow } from './galleonBow';
import { addStern } from './galleonStern';
import { DECK_Y, HIGH_Y, LOW_Y, WALES, type GalleonLayout, type Mast } from './galleonLayout';

/** Porte-haubans : planches qui débordent du bordé sous le plat-bord (dessous du plat-bord, largeur, et ce qu'elles dépassent des pieds de haubans, m). */
const CHANNEL = { below: 0.45, width: 0.55, overhang: 0.3 };
/**
 * Pieds des haubans : à ces distances (m) derrière chaque mât ; ils restent sur le plat-bord du pont qui le porte
 * (`clearance` m des marches et de la poupe), quitte à se resserrer.
 */
const SHROUD_FEET = { first: 0.4, spacing: 0.65, count: 4, clearance: 0.45 };
/** Le haut du bordé peint s'arrête à cette distance sous le plat-bord (m). */
const PAINT_BELOW_RAIL = 0.08;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export interface GalleonTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues, dans l'ordre de GalleonLayout.squareSails. */
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  spritsail: THREE.BufferGeometry;
  /** Voiles latines (dans le repère de leur vergue, voir buildLateenSail), leurs vergues et l'inclinaison de ce repère. */
  lateens: { sail: THREE.BufferGeometry; yard: THREE.BufferGeometry; pitch: number }[];
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord (pointe vers +X) : les deux batteries. */
  batteryGun: THREE.BufferGeometry;
  /** Pièce sur affût, derrière le pavois d'un château ou du pont. */
  deckGun: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, allongé) et par livrée. */
const templates = new Map<GalleonLayout, Map<Livery, GalleonTemplate>>();

export function galleonTemplateFor(layout: GalleonLayout, livery: Livery): GalleonTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: GalleonLayout, livery: Livery): GalleonTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const { hull, halfDeck, quarterdeck, poop, forecastle, at } = L;

  // Coque ; ponts planchés (milieu jusqu'à l'étrave, demi-pont, gaillard, dunette, château avant).
  const shell = hull.buildHull();
  batch.add(HULL_WOOD, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.99), 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, halfDeck.to, forecastle.from);
  for (const deck of [halfDeck, quarterdeck, poop, forecastle]) {
    batch.add(p.floor, hull.buildFloor(deck.y, deck.from, deck.to, 0.96), identity);
    addDeckSeams(batch, p.dark, hull, deck.y, deck.from, deck.to);
  }

  // Préceintes en bois sombre qui remontent vers la poupe ; au-dessus de la haute, hauts peints aux couleurs du camp
  // jusque sous la lisse dorée du plat-bord ; pavois et moulures dorés.
  for (const w of WALES) {
    const low = (_s: Station, u: number) => w.y + w.sheer * L.sheer(u) - w.height / 2;
    batch.add(DARK_WOOD, hull.buildBand(low, (s, u) => low(s, u) + w.height, 0.025), identity);
  }
  const top = WALES[0];
  batch.add(p.hull, hull.buildBand((_s, u) => top.y + top.sheer * L.sheer(u) + top.height / 2, (s) => s.gunwale - PAINT_BELOW_RAIL, 0.012), identity);
  for (const side of [1, -1] as const) batch.add(GILT, hull.buildRail(side, 1, 0, 0.09), identity);
  addPavises(batch, L);
  addMouldings(batch, L);

  // Sabords : les deux batteries dans le bordé (ils suivent la tonture), pièces légères dans le pavois ; fenêtres.
  for (const side of [1, -1] as const) {
    for (const u of L.lowPorts) batch.add(p.dark, box(0.07, 0.56, 0.6), sideTf(hull, L.station(u), LOW_Y + L.sheer(u), side, 0.035));
    for (const u of L.highPorts) batch.add(p.dark, box(0.07, 0.52, 0.56), sideTf(hull, L.station(u), HIGH_Y + L.sheer(u), side, 0.035));
    for (const { u, y } of L.pieceSlots) batch.add(p.dark, box(0.05, 0.42, 0.48), sideTf(hull, L.station(u), y + 0.4, side, 0.03));
    for (const { u, y } of L.windows) {
      batch.add(GILT, box(0.04, 0.56, 0.48), sideTf(hull, L.station(u), y, side, 0.015));
      batch.add(p.window, box(0.05, 0.44, 0.36), sideTf(hull, L.station(u), y, side, 0.03));
    }
  }
  addCastles(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);
  addMasts(batch, p, L);

  // Milieu : écoutilles, cabestan, cargaison ; colonne de la roue sur le gaillard.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, 'grating');
  const capstan = at(0.03).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.36, 0.42, 0.85, 8), tf(0, DECK_Y + 0.42, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8), tf(0, DECK_Y + 0.86, capstan));
  batch.add(p.wood, box(0.16, L.wheel.y - quarterdeck.y, 0.16), tf(0, (L.wheel.y + quarterdeck.y) / 2, L.wheel.z - 0.12));
  addCrate(batch, p, tf(1.3, DECK_Y, at(0.26).z, 0, 0.2));
  addCrate(batch, p, tf(1.25, DECK_Y + 0.42, at(0.26).z, 0, -0.1));
  addCrate(batch, p, tf(-1.4, DECK_Y, at(0.47).z, 0, 0.4));
  addBarrel(batch, p, tf(-1.5, DECK_Y, at(0.24).z));
  addBarrel(batch, p, tf(-1.1, DECK_Y, at(0.25).z, 0, 0.7));
  addBarrel(batch, p, tf(0.9, halfDeck.y, at(-0.36).z, 0, 1.1));
  addBarrel(batch, p, tf(-0.9, forecastle.y, at(0.8).z));
  addRopeCoil(batch, p, tf(-0.7, DECK_Y, L.mainMast.z - 0.9));
  addRopeCoil(batch, p, tf(0.7, forecastle.y, L.foreMast.z - 0.9));
  addRopeCoil(batch, p, tf(-0.6, poop.y, L.bonaventureMast.z + 0.9));

  const yard = (width: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, width + 0.6, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  addLampFixtures(batch, p, galleonLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.6)),
    yards: L.squareSails.map((s) => yard(s.width, s.width > 6 ? 0.11 : 0.07)),
    spritsail: buildSquareSail(L.spritsail.width, L.spritsail.height, 0.35),
    lateens: L.lateens.map(({ sail }) => {
      const lateen = buildLateenSail(sail);
      const yardGeometry = cylinderBetween(new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, lateen.yardLength + 0.4), 0.11, 0.06);
      return { sail: lateen.sail, yard: yardGeometry, pitch: lateen.pitch };
    }),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.8),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Mâts (grosses hunes rondes, chouques), hampe du pavillon au grand mât, porte-haubans. */
function addMasts(batch: GeometryBatch, p: Palette, L: GalleonLayout) {
  const masts: [Mast, number, number][] = [
    [L.foreMast, 0.28, 0.95],
    [L.mainMast, 0.38, 1.25],
    [L.mizzenMast, 0.22, 0.7],
    [L.bonaventureMast, 0.17, 0.55],
  ];
  for (const [mast, radius, platform] of masts) {
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    // Hune ronde, en forme de panier (pleine : on la voit sous tous les angles), cerclée de sombre.
    batch.add(p.wood, new THREE.CylinderGeometry(platform, platform * 0.7, 0.55, 12), tf(0, mast.topPlatform + 0.27, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(platform + 0.03, platform + 0.03, 0.08, 12), tf(0, mast.topPlatform + 0.52, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
    if (hasChannels(L, mast)) addChannels(batch, p, L, shroudFeet(L, mast));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.04, 0.04, 1.5, 4), tf(0, L.mainMast.top + 0.75, L.mainMast.z));
}

/** Le contre-artimon, tout à l'arrière où la coque se resserre, n'a pas de porte-haubans : ses haubans vont à la lisse. */
const hasChannels = (L: GalleonLayout, mast: Mast) => mast !== L.bonaventureMast;

/** Porte-haubans d'un mât, sur chaque bord : une planche qui suit le bordé, d'un peu avant le premier pied de hauban à un peu après le dernier. */
function addChannels(batch: GeometryBatch, p: Palette, L: GalleonLayout, feet: readonly number[]) {
  const { hull } = L;
  const zs = [feet[0] + CHANNEL.overhang, ...feet, feet[feet.length - 1] - CHANNEL.overhang];
  for (const side of [1, -1]) {
    const points = zs.map((z) => {
      const s = hull.stationAt(z / hull.halfLength);
      const y = s.gunwale - CHANNEL.below;
      return new THREE.Vector3(side * (hull.halfWidthAt(s, y) + CHANNEL.width / 2), y, z);
    });
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      const length = a.distanceTo(b) + 0.04;
      batch.add(p.wood, box(CHANNEL.width, 0.09, length), tf((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, Math.atan2(a.y - b.y, Math.hypot(b.x - a.x, b.z - a.z)), Math.atan2(b.x - a.x, b.z - a.z)));
    }
  }
}

/**
 * Haubans des quatre mâts (sur les porte-haubans, ou la lisse de la dunette), étais (contre-artimon → artimon → grand
 * mât → misaine → beaupré, et du perroquet de misaine au mât de contre-civadière), sous-barbe vers l'éperon.
 */
function buildRigging(L: GalleonLayout): THREE.BufferGeometry {
  const { hull, bowsprit } = L;
  const head = (m: Mast) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const [fore, main, mizzen, bonaventure] = [head(L.foreMast), head(L.mainMast), head(L.mizzenMast), head(L.bonaventureMast)];
  const foreTop = new THREE.Vector3(0, L.foreMast.topPlatform + 0.4, L.foreMast.z);
  const points: THREE.Vector3[] = [
    foreTop, bowsprit.base.clone().lerp(bowsprit.tip, 0.5),
    fore, bowsprit.topmast.clone().setY(bowsprit.topmast.y - 0.2),
    main, foreTop,
    mizzen, new THREE.Vector3(0, L.mainMast.topPlatform - 1.5, L.mainMast.z),
    bonaventure, new THREE.Vector3(0, L.mizzenMast.topPlatform - 2, L.mizzenMast.z),
    bowsprit.tip, new THREE.Vector3(0, L.beak.figurehead.y - 0.2, L.beak.figurehead.z - 0.4),
  ];
  for (const side of [1, -1]) {
    for (const mast of [L.foreMast, L.mainMast, L.mizzenMast, L.bonaventureMast]) {
      const top = new THREE.Vector3(side * 0.6, mast.topPlatform, mast.z);
      const channels = hasChannels(L, mast);
      for (const z of shroudFeet(L, mast)) {
        const s = hull.stationAt(z / hull.halfLength);
        const y = channels ? s.gunwale - CHANNEL.below : s.gunwale;
        points.push(top, new THREE.Vector3(side * (hull.halfWidthAt(s, y) + (channels ? CHANNEL.width * 0.9 : 0)), y, s.z));
      }
      points.push(head(mast), new THREE.Vector3(side * 0.8, mast.topPlatform + 0.5, mast.z - 0.2));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

/**
 * z des pieds des haubans d'un mât, de l'avant vers l'arrière : derrière le mât, sur le plat-bord du pont qui le porte
 * (entre ses marches, ou la poupe) ; resserrés si ce pont est trop court.
 */
function shroudFeet(L: GalleonLayout, mast: Mast): number[] {
  const z = (u: number) => L.station(u).z;
  const sections: [number, number][] = [
    [z(L.forecastle.from), z(L.forecastle.to)],
    [z(L.halfDeck.to), z(L.forecastle.from)],
    [z(L.poop.to), z(L.quarterdeck.to)],
    [z(-1), z(L.poop.to)],
  ];
  const [aft, fore] = sections.find(([a, f]) => mast.z > a && mast.z < f) ?? [z(-1), z(1)];
  const { first, spacing, count, clearance } = SHROUD_FEET;
  const start = Math.min(mast.z - first, fore - clearance);
  const room = start - (aft + clearance);
  const step = Math.min(spacing, room / (count - 1));
  return Array.from({ length: count }, (_, i) => start - step * i);
}
