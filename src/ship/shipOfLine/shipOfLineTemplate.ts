import * as THREE from 'three';
import { addLampFixtures } from '../parts/shipLamps';
import { shipOfLineLamps } from './shipOfLineLamps';
import { WATER_MASK, type Livery } from '../../config';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { buildBatteryGun, buildWheel } from '../corvette/corvetteTemplate';
import { addBow } from '../galleon/galleonBow';
import { addDeckSeams, buildRudderGeometry, flagMaterialFor, paletteFor, std } from '../parts/common';
import { addHatch } from '../parts/deckFittings';
import { addBarrel, addCrate, addRopeCoil, buildCarriageGunGeometry, type Palette } from '../parts/props';
import { buildGaffSail, buildSquareSail, buildTriangleSail, cylinderBetween } from '../parts/sails';
import { addCastles, addPlanking, OCHRE } from './shipOfLineDecor';
import { DECK_Y, PORT, type ShipOfLineLayout } from './shipOfLineLayout';
import { addMasts, buildRigging } from './shipOfLineRig';
import { addStern } from './shipOfLineStern';

/** Mantelet (volet d'un sabord de batterie) : un peu plus grand que le sabord, épaisseur (m). */
const LID = { margin: 0.08, thickness: 0.07 };

export interface ShipOfLineTemplate {
  palette: Palette;
  statics: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Voiles carrées et vergues, dans l'ordre de ShipOfLineLayout.squareSails. */
  squareSails: THREE.BufferGeometry[];
  yards: THREE.BufferGeometry[];
  spritsail: THREE.BufferGeometry;
  /** Focs (repère de leur point d'amure), dans l'ordre de ShipOfLineLayout.jibs. */
  jibs: THREE.BufferGeometry[];
  /** Brigantine d'artimon (repère de son gréement), sa bôme et sa corne. */
  spanker: THREE.BufferGeometry;
  boom: THREE.BufferGeometry;
  gaff: THREE.BufferGeometry;
  sailMaterial: THREE.Material;
  rudder: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Fût seul, qui dépasse d'un sabord (pointe vers +X) : les deux batteries. */
  batteryGun: THREE.BufferGeometry;
  /** Pièce sur affût, derrière le pavois d'un gaillard ou du pont. */
  deckGun: THREE.BufferGeometry;
  /** Mantelets des deux batteries : charnière en haut (origine), pendant vers -Y, plaqués sur le bordé. */
  lowLid: THREE.BufferGeometry;
  highLid: THREE.BufferGeometry;
  lidMaterial: THREE.Material;
  flagMaterial: THREE.Material;
  rigging: THREE.BufferGeometry;
  waterMask: THREE.BufferGeometry;
}

/** Un gabarit par plan (64, 74, 80) et par livrée. */
const templates = new Map<ShipOfLineLayout, Map<Livery, ShipOfLineTemplate>>();

export function shipOfLineTemplateFor(layout: ShipOfLineLayout, livery: Livery): ShipOfLineTemplate {
  let byLivery = templates.get(layout);
  if (!byLivery) templates.set(layout, (byLivery = new Map()));
  let template = byLivery.get(livery);
  if (!template) {
    template = buildTemplate(layout, livery);
    byLivery.set(livery, template);
  }
  return template;
}

function buildTemplate(L: ShipOfLineLayout, livery: Livery): ShipOfLineTemplate {
  const p = paletteFor(livery);
  const batch = new GeometryBatch();
  const identity = new THREE.Matrix4();
  const { hull, quarterdeck, poop, forecastle, at } = L;

  // Coque, bordé et sabords ; ponts planchés (milieu jusqu'à l'étrave, gaillard d'arrière, dunette, gaillard d'avant).
  addPlanking(batch, p, L);
  batch.add(p.floor, hull.buildFloor(DECK_Y, L.base(-0.99), L.base(0.99), 0.97), identity);
  addDeckSeams(batch, p.dark, hull, DECK_Y, quarterdeck.to, forecastle.from);
  for (const deck of [quarterdeck, poop, forecastle]) {
    batch.add(p.floor, hull.buildFloor(deck.y, deck.from, deck.to, 0.96), identity);
    addDeckSeams(batch, p.dark, hull, deck.y, deck.from, deck.to);
  }
  addCastles(batch, p, L);
  addStern(batch, p, L);
  addBow(batch, p, L);
  addMasts(batch, p, L);

  // Milieu : écoutilles, cabestan, cargaison ; colonne de la roue sur le gaillard d'arrière.
  for (const h of L.hatches) addHatch(batch, p, tf(0, DECK_Y, L.station(h.u).z), h.width, h.depth, 'grating');
  batch.add(p.wood, new THREE.CylinderGeometry(0.38, 0.44, 0.85, 8), tf(0, DECK_Y + 0.42, L.capstan));
  batch.add(p.dark, new THREE.CylinderGeometry(0.52, 0.52, 0.08, 8), tf(0, DECK_Y + 0.86, L.capstan));
  batch.add(p.wood, new THREE.BoxGeometry(0.16, L.wheel.y - quarterdeck.y, 0.16), tf(0, (L.wheel.y + quarterdeck.y) / 2, L.wheel.z - 0.12));
  addCrate(batch, p, tf(1.3, DECK_Y, at(0.25).z, 0, 0.2));
  addCrate(batch, p, tf(1.25, DECK_Y + 0.42, at(0.25).z, 0, -0.1));
  addBarrel(batch, p, tf(-1.4, DECK_Y, at(0.24).z));
  addBarrel(batch, p, tf(-1, DECK_Y, at(0.26).z, 0, 0.7));
  addBarrel(batch, p, tf(-0.9, forecastle.y, at(0.84).z));
  addRopeCoil(batch, p, tf(-0.8, DECK_Y, L.mainMast.z - 1));
  addRopeCoil(batch, p, tf(0.8, forecastle.y, L.foreMast.z - 1));
  addRopeCoil(batch, p, tf(-0.7, poop.y, at(-0.9).z));

  const yard = (width: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, width + 0.6, 6);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  const lid = ([h, w]: readonly [number, number]) => {
    const g = new THREE.BoxGeometry(LID.thickness, h + LID.margin, w + LID.margin);
    g.translate(0, -(h + LID.margin) / 2, 0);
    return g;
  };
  addLampFixtures(batch, p, shipOfLineLamps(L));
  return {
    palette: p,
    statics: batch.build(),
    squareSails: L.squareSails.map((s) => buildSquareSail(s.width, s.height, 0.6)),
    yards: L.squareSails.map((s) => yard(s.width, s.width > 6 ? 0.12 : 0.07)),
    spritsail: buildSquareSail(L.spritsail.width, L.spritsail.height, 0.35),
    jibs: L.jibs.map((j) => buildTriangleSail(j.head.clone().sub(j.tack), j.clew.clone().sub(j.tack), 0.4)),
    spanker: buildGaffSail(L.spanker),
    boom: cylinderBetween(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0, 0, L.spanker.clew.z - 0.3), 0.13, 0.09),
    gaff: cylinderBetween(L.spanker.throat, L.spanker.peak, 0.1, 0.06),
    sailMaterial: std(livery.sail, { side: THREE.DoubleSide }),
    rudder: buildRudderGeometry(3),
    wheel: buildWheel(),
    batteryGun: buildBatteryGun(),
    deckGun: buildCarriageGunGeometry(),
    lowLid: lid(PORT.low),
    highLid: lid(PORT.high),
    // Mantelets : le même ocre que les bandes des batteries (sabords fermés, la bande paraît pleine).
    lidMaterial: OCHRE,
    flagMaterial: flagMaterialFor(livery),
    rigging: buildRigging(L),
    waterMask: hull.buildWaterMask(DECK_Y + WATER_MASK.aboveDeck),
  };
}
