import * as THREE from 'three';
import { GeometryBatch, tf } from '../utils/geometryBatch';
import { addTower } from './fortKeep';
import type { FortLayout } from './fortLayouts';
import { addRampart, addSentry, around, fortMaterials, starOutline, type FortMaterials } from './fortWalls';
import { land } from './island';

export { FORT_LAYOUTS, type FortLayout } from './fortLayouts';

/** Pied des murs, sous le point le plus bas du terrain (ou de la mer) sous le fort (m). */
const WALL_FOOT_DEPTH = 3;
/** Plateforme de tir (barbette) sous chaque canon : le fût passe au-dessus du parapet. */
export const BARBETTE = { radius: 1.4, height: 0.5 };
/** Caserne : longueur, hauteur des murs, profondeur (m). */
const BARRACKS = { length: 6.5, height: 2.4, depth: 2.6 };
/** Le cavalier repose un peu sous le terre-plein (m) : pas de jour entre ses murs et le dallage. */
const INNER_SINK = 0.5;

export interface GunSlot {
  readonly position: THREE.Vector3;
  /** Cap de repos du canon : vers le large, dans l'axe de son emplacement. */
  readonly restYaw: number;
  readonly barbette: THREE.Mesh;
}

export interface FortModel {
  readonly group: THREE.Group;
  readonly slots: readonly GunSlot[];
  /** Pied du mât du pavillon, en haut de la tour de guet (ou du donjon). */
  readonly flagBase: THREE.Vector3;
  /** Taille du pavillon (FortLayout.flag). */
  readonly flagScale: number;
  /** Volume approximatif de l'enceinte (pour les boulets d'un siège) : centre, rayon, bas et haut (m), hauteur du terre-plein. */
  readonly bounds: { x: number; z: number; radius: number; bottom: number; top: number; rampart: number };
  /** Cap du bastion principal (vers le large). */
  readonly facing: number;
}

/**
 * Fort bastionné à la façon des Caraïbes : enceinte en pierre à bastions en pointe, la pointe principale tournée
 * vers le large, parapet, guérites, tour de guet et caserne au centre, porte côté terre. Les canons tirent en
 * barbette par-dessus le parapet. Le même plan, agrandi, donne la citadelle de Port-Sabre ; Fort-Royal y ajoute un
 * cordon, un cavalier (enceinte intérieure plus haute, avec ses propres canons) et un donjon à tourelles.
 * `facing` : cap du bastion principal (par défaut, vers le large le plus proche).
 */
export function buildFort(cx: number, cz: number, layout: FortLayout, facing?: number): FortModel {
  const away = { x: 0, z: 0 };
  land.gradient(cx, cz, away);
  const sea = facing ?? Math.atan2(away.x, away.z);
  const step = (Math.PI * 2) / layout.bastions;
  const m = fortMaterials();

  // Le terre-plein passe au-dessus du terrain le plus haut sous le fort ; le pied des murs, sous le plus bas.
  const outline = starOutline(cx, cz, sea, layout);
  const heights = [land.heightAt(cx, cz), ...outline.map((p) => land.heightAt(p.x, p.z))];
  const top = Math.max(...heights) + layout.wallHeight;
  const foot = Math.min(0, ...heights) - WALL_FOOT_DEPTH;
  const ground = land.heightAt(cx, cz);
  const batch = new GeometryBatch();
  addRampart(batch, m, outline, cx, cz, foot, top, layout.cordon ?? false);

  // Guérites aux pointes des bastions.
  for (const i of layout.sentries) {
    const axis = sea + i * step;
    addSentry(batch, m, around(cx, cz, axis, layout.tip - 0.7), top, axis);
  }

  // Cavalier : une seconde enceinte, plus haute, au milieu du terre-plein.
  const inner = layout.inner;
  const innerTop = inner ? top + inner.height : top;
  if (inner) addRampart(batch, m, starOutline(cx, cz, sea, inner), cx, cz, top - INNER_SINK, innerTop, layout.cordon ?? false);

  // Tour de guet (ou donjon) au centre, sur le cavalier s'il y en a un, avec le pavillon.
  const towerTop = addTower(batch, m, cx, cz, innerTop, sea, layout.tower);
  for (const a of layout.barracks.angles) addBarracks(batch, m, around(cx, cz, sea + Math.PI + a, layout.barracks.radius), top, sea + a);
  addGate(batch, m, cx, cz, sea, layout);

  const group = new THREE.Group();
  for (const { geometry, material } of batch.build()) group.add(new THREE.Mesh(geometry, material));

  // Barbettes (une par emplacement), montrées seulement quand le canon est en service.
  const barbetteGeometry = new THREE.CylinderGeometry(BARBETTE.radius, BARBETTE.radius + 0.15, BARBETTE.height, 10);
  const slots = layout.gunSlots.map(([da, r, onInner]) => {
    const restYaw = sea + da;
    const p = around(cx, cz, restYaw, r);
    const y = onInner ? innerTop : top;
    const barbette = new THREE.Mesh(barbetteGeometry, m.darkStone);
    barbette.position.set(p.x, y + BARBETTE.height / 2, p.z);
    group.add(barbette);
    return { position: new THREE.Vector3(p.x, y + BARBETTE.height, p.z), restYaw, barbette };
  });
  const bounds = { x: cx, z: cz, radius: (layout.tip + layout.curtain.radius) / 2, bottom: Math.min(ground, 0) - 1, top: towerTop, rampart: top };
  return { group, slots, flagBase: new THREE.Vector3(cx, towerTop, cz), flagScale: layout.flag ?? 1, bounds, facing: sea };
}

/** Caserne sur le terre-plein (`top`), en long selon `yaw` : murs blanchis et toit à deux pans. */
function addBarracks(batch: GeometryBatch, m: FortMaterials, p: THREE.Vector3, top: number, yaw: number) {
  const { length, height, depth } = BARRACKS;
  batch.add(m.whitewash, new THREE.BoxGeometry(length, height, depth), tf(p.x, top + height / 2, p.z, 0, yaw));
  // Prisme à 3 pans couché le long de la caserne, arête vers le haut.
  const ridge = new THREE.CylinderGeometry(1, 1, length + 0.4, 3);
  ridge.rotateZ(Math.PI / 2);
  ridge.rotateX(-Math.PI / 2);
  batch.add(m.roof, ridge, tf(p.x, top + height + 0.35, p.z, 0, yaw, 0, [1, 0.75, 1.6]));
}

/** Porte côté terre, dans la courtine la plus opposée au large, au niveau du terrain. */
function addGate(batch: GeometryBatch, m: FortMaterials, cx: number, cz: number, sea: number, layout: FortLayout) {
  const step = (Math.PI * 2) / layout.bastions;
  const { curtain } = layout;
  const angle = sea + Math.round((Math.PI - step / 2) / step) * step + step / 2;
  const gate = around(cx, cz, angle, curtain.radius * Math.cos(step / 2 - curtain.angle) + 0.05);
  const y = land.heightAt(gate.x, gate.z);
  batch.add(m.shadow, new THREE.BoxGeometry(2.2, 2.6, 0.3), tf(gate.x, y + 1.3, gate.z, 0, angle));
  batch.add(m.wood, new THREE.BoxGeometry(1.8, 2.3, 0.35), tf(gate.x, y + 1.15, gate.z, 0, angle));
}
