import * as THREE from 'three';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import type { Island } from './island';
import { tint } from './townBuildings';

/**
 * Chantier de l'arsenal : où il touche le rivage (rad depuis l'axe de la crique) ; aire de construction plate qui
 * commence `apronFrom` m à l'intérieur des terres, longue de `apronLength`, large de `width` ; rampe de lancement qui
 * descend jusqu'à `rampOut` m au large, sous l'eau à `rampBottom` m (m).
 */
const YARD = { angle: 0.17, apronFrom: 3, apronLength: 21, width: 10, rampOut: 9, rampBottom: -1.6 };
/** Coque en chantier : longueur, largeur au maître-couple, hauteur des membrures, nombre de couples (m). */
const HULL = { length: 17, beam: 6, depth: 3.8, frames: 7 };

/**
 * Cale de construction de l'arsenal, à l'est du port : aire de pierre plate au-dessus du terrain, rampe de lancement
 * qui plonge dans la crique, une coque en chantier sur ses tins (quille, étrave, étambot, couples, lisses),
 * échafaudages, passerelles et piles de bois.
 */
export function addShipyard(batch: GeometryBatch, island: Island) {
  // Axe du chantier : dans le prolongement du rayon de l'île (le terrain y reste plat ; la normale de la côte, en
  // biais sur ce flanc de la crique, monterait vers les hauteurs du fort).
  const theta = island.def.bay.angle + YARD.angle;
  const shore = island.pointAt(theta, 0);
  const out = { x: Math.sin(theta), z: Math.cos(theta) };
  const yaw = theta;
  // Point à `d` m du rivage le long de l'axe du chantier (positif = vers le large), décalé de `side` m sur le côté.
  const along = (d: number, side = 0) => ({ x: shore.x + out.x * d + out.z * side, z: shore.z + out.z * d - out.x * side });
  // L'aire passe au-dessus du terrain le plus haut le long de son axe (ses bords peuvent mordre dans la pente).
  let ground = -Infinity;
  for (let d = -YARD.apronFrom; d >= -YARD.apronFrom - YARD.apronLength; d -= 3) {
    const p = along(d);
    ground = Math.max(ground, island.heightAt(p.x, p.z));
  }
  const top = ground + 0.25;
  const center = -YARD.apronFrom - YARD.apronLength / 2;
  const c = along(center);
  const stone = tint(0x9a948a);
  const coping = tint(0x6f6a62);
  const timber = tint(0x8a6440);
  const dark = tint(0x5b4128);
  // Aire de construction (son pied descend sous le terrain), et sa rampe de lancement vers le large.
  const foot = -0.6;
  batch.add(stone, new THREE.BoxGeometry(YARD.width, top - foot, YARD.apronLength), tf(c.x, (top + foot) / 2, c.z, 0, yaw));
  const rampLength = YARD.rampOut + YARD.apronFrom;
  const drop = top - YARD.rampBottom;
  const slope = Math.hypot(rampLength, drop);
  const pitch = Math.atan2(drop, rampLength);
  const r = along((YARD.rampOut - YARD.apronFrom) / 2);
  const ramp = new THREE.Matrix4()
    .makeTranslation(r.x, (top + YARD.rampBottom) / 2 - 0.5, r.z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeRotationX(pitch));
  batch.add(stone, new THREE.BoxGeometry(YARD.width - 2, 1, slope), ramp);
  for (const side of [-1, 1]) {
    const p = along(center, side * (YARD.width / 2 - 0.3));
    batch.add(coping, new THREE.BoxGeometry(0.6, 0.3, YARD.apronLength), tf(p.x, top + 0.1, p.z, 0, yaw));
  }

  // Repère de la coque : sur l'aire, +Z vers le large.
  const hull = new THREE.Matrix4().makeTranslation(c.x, top, c.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
  const put = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => hull.clone().multiply(tf(x, y, z, rx, ry, rz));
  const keelY = 0.95;
  const half = HULL.length / 2;
  // Tins sous la quille, quille, étrave (inclinée vers l'avant) et étambot.
  for (let z = -half + 1; z <= half - 1; z += 3) batch.add(dark, new THREE.BoxGeometry(1.4, 0.7, 0.6), put(0, 0.35, z));
  batch.add(timber, new THREE.BoxGeometry(0.4, 0.5, HULL.length), put(0, keelY, 0));
  batch.add(timber, new THREE.BoxGeometry(0.4, HULL.depth + 1.2, 0.45), put(0, keelY + HULL.depth / 2 + 0.4, half + 0.9, 0.35));
  batch.add(timber, new THREE.BoxGeometry(0.4, HULL.depth + 0.8, 0.45), put(0, keelY + HULL.depth / 2 + 0.2, -half - 0.1, -0.08));
  // Couples : varangue et deux allonges évasées, plus étroits vers les extrémités.
  for (let k = 0; k < HULL.frames; k++) {
    const z = -half + 1.6 + (k * (HULL.length - 3.2)) / (HULL.frames - 1);
    const fullness = Math.sqrt(Math.max(0.15, 1 - (z / (half + 1)) ** 2));
    const width = HULL.beam * fullness;
    batch.add(timber, new THREE.BoxGeometry(width, 0.3, 0.3), put(0, keelY + 0.35, z));
    for (const side of [-1, 1]) batch.add(timber, new THREE.BoxGeometry(0.28, HULL.depth, 0.3), put(side * (width / 2 + 0.25), keelY + HULL.depth / 2 + 0.2, z, 0, 0, -side * 0.16));
  }
  // Lisses le long des couples (deux par bord), échafaudages, passerelles, piles de bois au fond de l'aire.
  for (const side of [-1, 1]) {
    for (const [y, inset] of [[keelY + 1.6, 0.92], [keelY + 3.2, 0.98]]) {
      batch.add(timber, new THREE.BoxGeometry(0.16, 0.22, HULL.length - 3), put(side * (HULL.beam / 2) * inset + side * 0.35, y, 0));
    }
    for (let z = -half + 1; z <= half - 1; z += 4.4) batch.add(dark, new THREE.CylinderGeometry(0.1, 0.12, 6.5, 5), put(side * (HULL.beam / 2 + 1.4), 3.25, z));
    batch.add(timber, new THREE.BoxGeometry(0.9, 0.12, HULL.length - 1), put(side * (HULL.beam / 2 + 1.4), 3.4, 0));
    for (let k = 0; k < 4; k++) batch.add(timber, new THREE.BoxGeometry(4, 0.3, 1.2), put(side * 2.4, 0.15 + k * 0.32, -half - 1.4, 0, k * 0.04));
  }
}
