import * as THREE from 'three';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, sideTf, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import type { Station } from '../parts/hullShape';
import { buildOarGeometry } from '../parts/oarBank';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildLateenSail, cylinderBetween } from '../parts/sails';
import { addBow, addCastles, addPavises, addStern, DARK_WOOD, HULL_WOOD } from './galleassDecor';
import { BATTERY_Y, DECK_Y, OAR, WALES, type GalleassLayout, type Mast } from './galleassLayout';

/** Bouches des trois fûts d'un triple canon (repère du canon, qui pointe vers +X) : deux côte à côte, le troisième dessus. */
export const TRIPLE_MUZZLES: readonly THREE.Vector3[] = [new THREE.Vector3(0.8, -0.17, 0.21), new THREE.Vector3(0.8, -0.17, -0.21), new THREE.Vector3(0.8, 0.2, 0)];
/** Le haut du bordé peint s'arrête à cette distance sous le plat-bord (m). */
const PAINT_BELOW_RAIL = 0.08;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

export interface GalleassTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles latines (dans le repère de leur vergue, voir buildLateenSail), leurs vergues et l'inclinaison de ce repère. */
  lateens: { sail: THREE.BufferGeometry; yard: THREE.BufferGeometry; pitch: number }[];
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord de la batterie (pointe vers +X). */
  batteryGun: THREE.BufferGeometry;
  /** Pièce sur affût : pont et dessus du château avant. */
  deckGun: THREE.BufferGeometry;
  /** Triple canon : trois fûts cerclés ensemble (bouches : TRIPLE_MUZZLES). */
  tripleGun: THREE.BufferGeometry;
  oar: THREE.BufferGeometry;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (de base, allongée) et par livrée. */
const templates = new Map<GalleassLayout, Map<Livery, GalleassTemplate>>();

export function galleassTemplateFor(layout: GalleassLayout, livery: Livery): GalleassTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: GalleassLayout, livery: Livery): GalleassTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const { hull, sternDeck, forecastle, at } = L;

  // Coque ; ponts planchés (milieu, château de poupe, château avant).
  const shell = hull.buildHull();
  batch.add(HULL_WOOD, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.97), 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, sternDeck.to, forecastle.from);
  for (const deck of [sternDeck, forecastle]) {
    batch.add(p.floor, hull.buildFloor(deck.y, deck.from, deck.to, 0.96), identity);
    addDeckSeams(batch, p.dark, hull, deck.y, deck.from, deck.to);
  }

  // Préceintes en bois sombre qui suivent la tonture ; haut du bordé peint aux couleurs du camp, de la préceinte haute
  // jusque sous la lisse de plat-bord (il monte avec les châteaux) ; pavois au liseré du camp.
  for (const w of WALES) {
    // Les préceintes basses s'effilent jusqu'à rien avant que la quille ne remonte sous le château avant.
    const { bowFull, bowEnd } = w;
    const height = (u: number) =>
      bowFull === undefined || bowEnd === undefined ? w.height : w.height * THREE.MathUtils.clamp((L.base(bowEnd) - u) / (L.base(bowEnd) - L.base(bowFull)), 0, 1);
    const low = (_s: Station, u: number) => w.y + w.sheer * L.sheer(u) - height(u) / 2;
    batch.add(DARK_WOOD, hull.buildBand(low, (s, u) => low(s, u) + height(u), 0.025), identity);
  }
  const top = WALES[0];
  batch.add(p.hull, hull.buildBand((_s, u) => top.y + top.sheer * L.sheer(u) + top.height / 2, (s) => s.gunwale - PAINT_BELOW_RAIL, 0.012), identity);
  for (const side of [1, -1] as const) batch.add(p.trim, hull.buildRail(side, 1, 0, 0.08), identity);
  addPavises(batch, p, L);

  // Sabords : batterie dans le bordé (ils suivent la tonture), pièces du pont dans le pavois, avirons sous la batterie.
  for (const side of [1, -1] as const) {
    for (const u of L.batteryPorts) batch.add(p.dark, box(0.07, 0.5, 0.56), sideTf(hull, L.station(u), BATTERY_Y + L.sheer(u), side, 0.035));
    for (const u of L.deckPorts) batch.add(p.dark, box(0.05, 0.4, 0.46), sideTf(hull, L.station(u), DECK_Y + 0.4, side, 0.03));
    for (const z of L.oarZs) batch.add(p.dark, box(0.05, 0.2, 0.22), sideTf(hull, hull.stationAt(z / hull.halfLength), OAR.y, side, 0.02));
  }
  addCastles(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);
  addMasts(batch, p, L);

  // Milieu : écoutilles, cabestan, quelques barils et caisses dans l'axe (les flancs restent aux canons) ; colonne de la
  // roue sur le château de poupe.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, 'grating');
  const capstan = at(-0.1).z;
  batch.add(p.wood, new THREE.CylinderGeometry(0.32, 0.38, 0.8, 8), tf(0, DECK_Y + 0.4, capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.46, 0.46, 0.08, 8), tf(0, DECK_Y + 0.82, capstan));
  batch.add(p.wood, box(0.14, L.wheel.y - sternDeck.y, 0.14), tf(0, (L.wheel.y + sternDeck.y) / 2, L.wheel.z - 0.12));
  addBarrel(batch, p, tf(0.55, DECK_Y, L.foreMast.z - 1.1));
  addBarrel(batch, p, tf(-0.5, DECK_Y, L.foreMast.z - 1.3, 0, 0.7));
  addCrate(batch, p, tf(0.5, DECK_Y, at(0.42).z, 0, 0.2));
  addCrate(batch, p, tf(-0.45, DECK_Y, at(-0.38).z, 0, -0.3));
  addBarrel(batch, p, tf(0.7, forecastle.y, at(0.74).z));
  addRopeCoil(batch, p, tf(-0.55, DECK_Y, L.mainMast.z - 0.8));
  addRopeCoil(batch, p, tf(0.55, DECK_Y, L.mizzenMast.z - 0.8));
  addRopeCoil(batch, p, tf(-0.6, sternDeck.y, at(-0.9).z));

  return {
    palette: p,
    statics: batch.build(),
    lateens: L.lateens.map(({ sail }) => {
      const lateen = buildLateenSail(sail);
      const yardGeometry = cylinderBetween(new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, lateen.yardLength + 0.4), 0.11, 0.06);
      return { sail: lateen.sail, yard: yardGeometry, pitch: lateen.pitch };
    }),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(2.4),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    tripleGun: buildTripleGun(),
    oar: buildOarGeometry(OAR),
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}

/** Triple canon le long de +X : trois fûts (TRIPLE_MUZZLES) serrés par deux cercles de fer. */
function buildTripleGun(): THREE.BufferGeometry {
  const batch = new GeometryBatch();
  const key = new THREE.MeshBasicMaterial();
  for (const m of TRIPLE_MUZZLES) {
    batch.add(key, new THREE.CylinderGeometry(0.11, 0.14, 1.4, 8), tf(0.1, m.y, m.z, 0, 0, -Math.PI / 2));
    batch.add(key, new THREE.CylinderGeometry(0.13, 0.13, 0.1, 8), tf(0.74, m.y, m.z, 0, 0, -Math.PI / 2));
  }
  // Centre de la grappe, et rayon d'un cercle qui l'enserre.
  const cy = TRIPLE_MUZZLES.reduce((sum, m) => sum + m.y, 0) / TRIPLE_MUZZLES.length;
  const hoop = Math.max(...TRIPLE_MUZZLES.map((m) => Math.hypot(m.y - cy, m.z))) + 0.12;
  for (const x of [-0.3, 0.32]) batch.add(key, new THREE.TorusGeometry(hoop, 0.045, 4, 10), tf(x, cy, 0, 0, Math.PI / 2));
  return batch.build()[0].geometry;
}

/** Mâts (hunes rondes de misaine et du grand mât, chouques), hampe du pavillon au grand mât. */
function addMasts(batch: GeometryBatch, p: Palette, L: GalleassLayout) {
  const masts: [Mast, number, number][] = [
    [L.foreMast, 0.24, 0.6],
    [L.mainMast, 0.3, 0.75],
    [L.mizzenMast, 0.2, 0],
  ];
  for (const [mast, radius, platform] of masts) {
    batch.add(p.wood, new THREE.CylinderGeometry(radius * 0.6, radius, mast.top - mast.base, 8), tf(0, (mast.top + mast.base) / 2, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, 0.1, 8), tf(0, mast.top + 0.05, mast.z));
    if (!platform) continue;
    // Hune ronde, en forme de panier (pleine : on la voit sous tous les angles), cerclée de sombre.
    batch.add(p.wood, new THREE.CylinderGeometry(platform, platform * 0.7, 0.5, 12), tf(0, mast.topPlatform + 0.25, mast.z));
    batch.add(p.dark, new THREE.CylinderGeometry(platform + 0.03, platform + 0.03, 0.08, 12), tf(0, mast.topPlatform + 0.48, mast.z));
  }
  batch.add(p.dark, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), tf(0, L.mainMast.top + 0.7, L.mainMast.z));
}

/** Haubans des trois mâts (sur le plat-bord, entre les sabords du pont), étais (artimon → grand mât → misaine → proue), sous-barbe de l'éperon. */
function buildRigging(L: GalleassLayout): THREE.BufferGeometry {
  const { hull } = L;
  const stem = hull.stationAt(1);
  const head = (m: Mast) => new THREE.Vector3(0, m.top - 0.5, m.z);
  const [fore, main, mizzen] = [head(L.foreMast), head(L.mainMast), head(L.mizzenMast)];
  const points: THREE.Vector3[] = [
    fore, new THREE.Vector3(0, stem.gunwale + 0.5, stem.z - 0.1),
    main, new THREE.Vector3(0, L.foreMast.topPlatform + 0.5, L.foreMast.z),
    mizzen, new THREE.Vector3(0, L.mainMast.topPlatform - 4, L.mainMast.z),
    L.spur.tip, new THREE.Vector3(0, 0.4, stem.z - 0.1),
  ];
  [L.foreMast, L.mainMast, L.mizzenMast].forEach((mast, i) => {
    for (const side of [1, -1]) {
      const top = mast.topPlatform ? new THREE.Vector3(side * 0.5, mast.topPlatform, mast.z) : new THREE.Vector3(side * 0.15, mast.top - 2, mast.z);
      for (const z of L.shroudFeet[i]) {
        const s = hull.stationAt(z / hull.halfLength);
        points.push(top, new THREE.Vector3(side * hull.halfWidthAt(s, s.gunwale) * 0.98, s.gunwale, s.z));
      }
      if (mast.topPlatform) points.push(head(mast), new THREE.Vector3(side * 0.6, mast.topPlatform + 0.5, mast.z - 0.2));
    }
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}
