import * as THREE from 'three';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import { addBarrel, addCrate, addLantern, addRopeCoil, type Palette } from '../parts/props';
import { cylinderBetween } from '../parts/sails';
import { DECK_Y, type FrigateLayout } from './frigateLayout';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Hauteurs des deux galeries de poupe : celle de la grand-chambre (sous le gaillard) et celle de la dunette. */
const galleries = (L: FrigateLayout) => [
  { floor: DECK_Y + 0.45, windows: DECK_Y + 1.15 },
  { floor: L.quarterdeck.y + 0.2, windows: L.quarterdeck.y + 0.9 },
];

/**
 * Poupe de frégate : très haut tableau arrière en bois clair, deux galeries superposées (fenêtres, balcon à balustres
 * dorés), moulures dorées, trois grands fanaux au couronnement, et des galeries de bouteille sur deux niveaux de chaque côté.
 */
export function addStern(L: FrigateLayout, batch: GeometryBatch, p: Palette, gold: THREE.Material, light: THREE.Material) {
  const stern = L.at(-1);
  const face = stern.z - 0.02;
  const top = stern.gunwale;
  // Tableau en bois clair au-dessus de la préceinte.
  const width = 2 * L.widthAt(-1, top);
  batch.add(light, box(width, top - DECK_Y + 0.3, 0.04), tf(0, (top + DECK_Y - 0.3) / 2, face - 0.01));
  for (const { floor, windows } of galleries(L)) {
    const w = 2 * L.widthAt(-1, windows);
    for (let x = -w / 2 + 0.55; x <= w / 2 - 0.5; x += 0.85) {
      batch.add(p.dark, box(0.5, 0.7, 0.05), tf(x, windows, face - 0.03));
      batch.add(gold, box(0.6, 0.06, 0.06), tf(x, windows + 0.4, face - 0.04));
    }
    // Balcon : plancher, balustres et main courante dorés.
    const z = stern.z - 0.42;
    const length = w - 0.4;
    batch.add(p.wood, box(length, 0.1, 0.8), tf(0, floor, z));
    batch.add(p.trim, box(length, 0.2, 0.75), tf(0, floor - 0.15, z));
    batch.add(gold, box(length, 0.07, 0.07), tf(0, floor + 0.55, z - 0.38));
    for (let x = -length / 2 + 0.1; x <= length / 2; x += 0.32) batch.add(gold, box(0.05, 0.5, 0.05), tf(x, floor + 0.3, z - 0.38));
  }
  for (const y of [DECK_Y - 0.3, L.quarterdeck.y - 0.15, L.poop.y - 0.15, top - 0.1]) batch.add(gold, box(2 * L.widthAt(-1, y) - 0.15, 0.1, 0.07), tf(0, y, face - 0.04));
  // Pilastres dorés aux angles, et un écusson ovale (doré, cœur aux couleurs de la livrée) au couronnement.
  for (const side of [1, -1]) batch.add(gold, box(0.14, top - DECK_Y + 0.3, 0.06), tf(side * (width / 2 - 0.12), (top + DECK_Y - 0.3) / 2, face - 0.04));
  const crest = (L.poop.y + top) / 2;
  const disc = (radius: number) => new THREE.CylinderGeometry(radius, radius, 0.06, 12);
  batch.add(gold, disc(0.62), tf(0, crest, face - 0.05, Math.PI / 2, 0, 0, [1.6, 1, 1]));
  batch.add(p.trim, disc(0.48), tf(0, crest, face - 0.08, Math.PI / 2, 0, 0, [1.6, 1, 1]));

  // Trois grands fanaux au couronnement.
  for (const x of [-1.5, 0, 1.5]) addLantern(batch, p, tf(x, top, stern.z + 0.25, 0, 0, 0, x === 0 ? 2.1 : 1.6));

  // Galeries de bouteille (balcons fermés sur les flancs de la poupe), une par galerie de poupe, avec leurs fenêtres.
  const u = -0.86;
  const q = L.at(u);
  for (const side of [1, -1]) {
    for (const { windows } of galleries(L)) {
      const x = side * (L.widthAt(u, windows) + 0.25);
      batch.add(light, box(0.55, 1.5, 2.3), tf(x, windows, q.z));
      batch.add(gold, box(0.6, 0.08, 2.4), tf(x, windows + 0.78, q.z));
      batch.add(gold, box(0.6, 0.08, 2.4), tf(x, windows - 0.78, q.z));
      for (const dz of [-0.7, 0, 0.7]) batch.add(p.dark, box(0.05, 0.55, 0.42), tf(x + side * 0.28, windows + 0.05, q.z + dz));
    }
    // Petit dôme au-dessus de la galerie haute.
    const x = side * (L.widthAt(u, galleries(L)[1].windows) + 0.25);
    batch.add(p.trim, new THREE.ConeGeometry(0.42, 0.6, 4), tf(x, galleries(L)[1].windows + 1.1, q.z, 0, Math.PI / 4, 0, [1, 1, 2.6]));
  }
}

/**
 * Éperon à l'avant : une longue poulaine sous le beaupré, son caillebotis, les lisses courbes qui la relient au
 * gaillard d'avant, et la figure de proue dorée au bout.
 */
export function addBeakhead(L: FrigateLayout, batch: GeometryBatch, p: Palette, gold: THREE.Material) {
  const bow = L.at(1);
  const tip = new THREE.Vector3(0, 3.5, bow.z + 3.6);
  // Poulaine : une pièce effilée qui part de l'étrave, et son caillebotis.
  batch.add(p.trim, cylinderBetween(new THREE.Vector3(0, 2.6, bow.z - 0.4), tip, 0.32, 0.12, 4), new THREE.Matrix4());
  batch.add(p.wood, box(1, 0.08, 2.2), tf(0, 3.55, bow.z + 1.1, -0.06));
  // Lisses de poulaine : du pavois du gaillard d'avant jusqu'à la figure de proue.
  const rail = (from: THREE.Vector3, to: THREE.Vector3) => batch.add(gold, cylinderBetween(from, to, 0.05, 0.04, 4), new THREE.Matrix4());
  for (const side of [1, -1]) {
    for (const [y, dz] of [[4.6, 0], [3.9, 0.3]]) {
      const start = new THREE.Vector3(side * L.widthAt(0.93, y), y, L.at(0.93).z);
      const middle = new THREE.Vector3(side * 0.45, y - 0.5, bow.z + 1.6 + dz);
      rail(start, middle);
      rail(middle, new THREE.Vector3(side * 0.12, tip.y + 0.3, tip.z - 0.4));
    }
  }
  // Figure de proue : une silhouette dorée penchée vers l'avant, bras repliés comme des ailes.
  batch.add(gold, new THREE.CylinderGeometry(0.16, 0.24, 1.3, 6), tf(0, tip.y + 0.45, tip.z + 0.1, 0.95));
  batch.add(gold, new THREE.SphereGeometry(0.19, 6, 5), tf(0, tip.y + 0.95, tip.z + 0.62));
  for (const side of [1, -1]) batch.add(gold, box(0.06, 0.12, 0.9), tf(side * 0.2, tip.y + 0.55, tip.z + 0.15, 0.55, 0, side * 0.2));
}

/** Cargaison et cordages sur les ponts (l'équipage est animé à part : deckCrew/). */
export function addCargo(L: FrigateLayout, batch: GeometryBatch, p: Palette) {

  addBarrel(batch, p, tf(1, L.forecastle.y, L.at(0.7).z));
  addBarrel(batch, p, tf(-1, L.forecastle.y, L.at(0.7).z, 0, 0.7));
  addBarrel(batch, p, tf(-1.1, L.poop.y, L.at(-0.94).z, 0, 1.4));
  addCrate(batch, p, tf(0.9, DECK_Y, L.at(-0.3).z, 0, 0.2));
  addCrate(batch, p, tf(-0.9, DECK_Y, L.at(0.44).z, 0, -0.3));
  addRopeCoil(batch, p, tf(-0.8, DECK_Y, L.foreMast.z - 2));
  addRopeCoil(batch, p, tf(0.8, L.quarterdeck.y, L.mizzenMast.z + 1));
}
