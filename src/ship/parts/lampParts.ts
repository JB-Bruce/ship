import * as THREE from 'three';
import { SHIP_LAMPS } from '../../config';
import type { ShipType } from '../../shipTypes';
import { GeometryBatch, tf } from '../../utils/geometryBatch';
import type { Palette } from './props';

/**
 * Les lampes d'un navire en plus de ses fanaux de poupe (SHIP_LAMPS), déclarées par son plan dans le repère où le
 * modèle pose ses pièces fixes (proue +Z, bâbord +X, Y vers le haut, flottaison à y = 0 : `root`, ou le groupe `body`
 * d'un modèle qui se reconstruit). Quatre sortes : lampadaire (`post`), applique murale (`wall`), lanterne suspendue
 * (`hanging`), et la lanterne de hune, une lanterne suspendue toute faite (`mastTopLamp`).
 * Caps (`facing`) : 0 = vers la proue, π/2 = vers bâbord, π = vers la poupe, -π/2 = vers tribord.
 * `scale` : taille de la lanterne (1 par défaut, jusqu'à 1,2 ou 1,4 sur un gros navire).
 */
export type LampSpec = PostLamp | WallLamp | HangingLamp;

/**
 * Lampadaire : lanterne sur poteau, pied posé sur un pont (`at` = pied du poteau, à la hauteur du plancher). Pièce
 * fixe : c'est un obstacle pour l'équipage et le joueur (voulu) ; ne jamais en poser sur un escalier ni à son pied,
 * sur une échelle, dans un passage étroit, au poste de la barre, sur une écoutille, contre un canon ni sur un poste aux
 * cordages (`DeckPlan.ropes`) : au bord d'un pont, contre le pavois ou la lisse, ou au bord d'un gaillard.
 */
export interface PostLamp {
  kind: 'post';
  at: THREE.Vector3;
  /** Hauteur du poteau (m), SHIP_LAMPS.post.height par défaut. */
  height?: number;
  /** Rotation autour de Y (cap) : sans effet visible sur une lanterne carrée. */
  facing?: number;
  scale?: number;
}

/**
 * Applique murale : lanterne posée sur une tablette fixée à une cloison (château, dunette, rouf), de part et d'autre
 * d'une porte. `at` : point SUR la face de la cloison (pas à son milieu : ajouter sa demi-épaisseur), à la hauteur du
 * centre du verre (environ 1,7 m au-dessus du pont : la tablette et sa jambe de force restent alors au-dessus des
 * têtes, et ne gênent pas l'équipage) ; `facing` : direction où regarde cette face (vers le pont qui est devant elle).
 */
export interface WallLamp {
  kind: 'wall';
  at: THREE.Vector3;
  facing: number;
  scale?: number;
}

/**
 * Lanterne suspendue, qui se balance avec le roulis et le tangage (`ShipLamps`). `at` : point d'attache, fixe dans le
 * repère du navire (dessous d'un barrot, du rebord d'un château, d'une vergue qui ne pivote jamais, du bord d'une hune :
 * jamais une pièce qui bouge, bôme, corne, vergue latine) ; ou, avec `arm`, point de la cloison ou du mât où se fixe
 * une potence : la lanterne pend alors au bout de ce bras horizontal, à `arm` m dans la direction `facing`.
 * `drop` : longueur de la tige, du point d'attache au haut de la lanterne (m, SHIP_LAMPS.hanging.drop par défaut).
 * La lanterne n'est pas un obstacle pour l'équipage (lot `InstancedMesh`, ignoré par la navigation du pont) : son bas
 * (`hangingBottom`) doit rester à au moins SHIP_LAMPS.headClear m au-dessus de tout pont où l'on marche dessous.
 * `halo` : taille de son halo (× celle d'un fanal), pour qu'elle se voie de loin (lanterne de hune).
 */
export interface HangingLamp {
  kind: 'hanging';
  at: THREE.Vector3;
  facing?: number;
  arm?: number;
  drop?: number;
  scale?: number;
  halo?: number;
}

/** Nombre de lampes en plus des fanaux de poupe pour un type et un nombre d'allongements (SHIP_LAMPS). */
export function lampCount(type: ShipType, level: number): number {
  return (SHIP_LAMPS.extra[type] ?? 0) + (SHIP_LAMPS.perExtension[type] ?? 0) * level;
}

/**
 * Les lampes d'un plan : ses places candidates, dans l'ordre où elles s'ajoutent, coupées au nombre voulu pour ce type
 * et cet allongement (`lampCount`). La liste doit en donner au moins autant que ce nombre (sinon, avertissement).
 */
export function lampsFor(type: ShipType, level: number, candidates: readonly LampSpec[]): LampSpec[] {
  const count = lampCount(type, level);
  if (candidates.length < count) console.warn(`Lampes : ${candidates.length} places pour ${count} lampes (${type}, allongement ${level})`);
  return candidates.slice(0, count);
}

/**
 * Lanterne de hune (nid de pie) : pendue sous le bord ARRIÈRE de la hune d'un mât (plancher libre au-dessus, que lisent
 * les matelots et le joueur : deckCrew/mastTops.ts), plus grosse, et à grand halo pour se voir de loin (SHIP_LAMPS.top).
 * `z` : axe du mât à la hauteur de la hune (mât incliné : le prendre à cette hauteur) ; `underside` : dessous du
 * plancher de la hune ; `rim` : rayon de la hune au-dessous (de l'axe à son bord arrière, m).
 */
export function mastTopLamp(z: number, underside: number, rim: number): HangingLamp {
  const T = SHIP_LAMPS.top;
  return { kind: 'hanging', at: new THREE.Vector3(0, underside, z - rim + T.inset), drop: T.drop, scale: T.scale, halo: T.halo };
}

/**
 * Deux appliques de part et d'autre d'une porte, sur la face d'une cloison (`z` : la face elle-même), `x` = ± `gap` de
 * l'axe, à `y` (centre du verre) ; `facing` : 0 pour la face avant (vers la proue), π pour la face arrière.
 */
export function doorSconces(z: number, y: number, gap: number, facing = 0, scale?: number): WallLamp[] {
  return [1, -1].map((side) => ({ kind: 'wall', at: new THREE.Vector3(side * gap, y, z), facing, scale }));
}

/**
 * Deux lanternes pendues à des potences de part et d'autre d'un mât (bras vers bâbord et tribord), à `y` (au moins
 * SHIP_LAMPS.headClear + la lanterne au-dessus du pont : voir `hangingBottom`) ; `radius` : rayon du mât à cette hauteur.
 */
export function mastPotences(z: number, y: number, radius: number, arm = 0.4, drop = 0.1): HangingLamp[] {
  return [1, -1].map((side) => ({ kind: 'hanging', at: new THREE.Vector3(side * radius, y, z), facing: (side * Math.PI) / 2, arm, drop }));
}

/** Niveau d'allongement d'un plan, retrouvé parmi ceux que donne `layoutOf` (plans en cache : 0 à 2). */
export function layoutLevel<T>(L: T, layoutOf: (level: number) => T): number {
  for (let level = 0; level <= SHIP_LAMPS.maxLevel; level++) if (layoutOf(level) === L) return level;
  return 0;
}

/**
 * Hauteur du centre du verre d'une applique sur une cloison qui monte de `deck` à `top` : SHIP_LAMPS.wallHeight
 * au-dessus du pont, ou plus bas sous un château bas (la lanterne reste sous le pont du dessus).
 */
export function sconceHeight(deck: number, top: number): number {
  return deck + Math.min(SHIP_LAMPS.wallHeight, top - deck - SHIP_LAMPS.wallTopGap);
}

/** Hauteur où poser une potence pour que sa lanterne (tige `drop`, taille `scale`) passe au-dessus des têtes sur ce pont. */
export function potenceHeight(deck: number, drop = 0.1, scale = 1): number {
  return deck + SHIP_LAMPS.headClear + drop + (LANTERN_TOP + LANTERN_BOTTOM) * scale;
}

const LANTERN = SHIP_LAMPS.lantern;
/** Du centre du verre au bas de la plaque du fond (m, taille 1). */
export const LANTERN_BOTTOM = LANTERN.glassHeight / 2 + LANTERN.frame;
/** Du centre du verre au haut de l'anneau (m, taille 1) : c'est là que se prend la tige d'une lanterne suspendue. */
export const LANTERN_TOP = LANTERN.glassHeight / 2 + LANTERN.frame + 2 * LANTERN.capHeight + LANTERN.ring;

/** Hauteur du bas d'une lanterne suspendue (repère du navire), pendue d'aplomb : à comparer au pont qui est dessous. */
export function hangingBottom(lamp: HangingLamp): number {
  const s = lamp.scale ?? 1;
  return lamp.at.y - (lamp.drop ?? SHIP_LAMPS.hanging.drop) - (LANTERN_TOP + LANTERN_BOTTOM) * s;
}

/** Une pièce de lanterne : une boîte unité (1 × 1 × 1) placée par `matrix`, sombre (monture) ou lampe (verre). */
export interface LampPart {
  glow: boolean;
  matrix: THREE.Matrix4;
}

/** Boîte unité étirée en (w, h, d), centrée en (x, y, z), tournée de `ry` autour de Y. */
const part = (glow: boolean, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): LampPart => ({
  glow,
  matrix: tf(x, y, z, 0, ry, 0, [w, h, d]),
});

/**
 * Lanterne carrée, la même pour toutes les sortes, dans son repère (centre du verre à l'origine, Y vers le haut) :
 * le verre (en tête de liste ; une seule boîte, le contrat de parts/nightGlow.ts : une lampe = une boîte), plaques du
 * fond et du haut, chapeau à deux gradins tourné d'un huitième de tour, anneau, quatre montants aux coins.
 */
export const LANTERN_PARTS: readonly LampPart[] = (() => {
  const { glass: g, glassHeight: h, frame: t, cap: c, capTop, capHeight: ch, ring } = LANTERN;
  const plate = g + 2 * t;
  const top = h / 2 + t;
  const parts = [
    part(true, 0, 0, 0, g, h, g),
    part(false, 0, -h / 2 - t / 2, 0, plate, t, plate),
    part(false, 0, h / 2 + t / 2, 0, plate, t, plate),
    part(false, 0, top + ch / 2, 0, c, ch, c, Math.PI / 4),
    part(false, 0, top + ch * 1.5, 0, c * capTop, ch, c * capTop, Math.PI / 4),
    part(false, 0, top + 2 * ch + ring / 2, 0, t, ring, t),
  ];
  for (const x of [-1, 1]) for (const z of [-1, 1]) parts.push(part(false, (x * g) / 2, 0, (z * g) / 2, t, h, t));
  return parts;
})();

/** Rotation d'un cap autour de Y : +Z local regarde vers `facing`. */
export const yawOf = (facing: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing);

/** Barre de section `t` tendue entre deux points du plan (y, z) : jambe de force d'une tablette ou d'une potence. */
export function braceTf(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Matrix4 {
  const length = from.distanceTo(to);
  const angle = Math.atan2(to.z - from.z, to.y - from.y);
  return tf((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, angle, 0, 0, [t, length, t]);
}

/** Pose une lanterne dans un lot fusionné : `place` = repère de la lanterne (centre du verre), taille comprise. */
function addLanternBody(batch: GeometryBatch, p: Palette, place: THREE.Matrix4) {
  for (const { glow, matrix } of LANTERN_PARTS) batch.add(glow ? p.glow : p.dark, new THREE.BoxGeometry(1, 1, 1), place.clone().multiply(matrix));
}

/**
 * Ajoute au lot fusionné d'un gabarit (en cache par plan et par livrée) toutes les pièces FIXES d'une liste de lampes :
 * lampadaires et appliques entiers, potences et pitons des lanternes suspendues (leur tige et leur lanterne, qui se
 * balancent, sont posées par `ShipLamps`, propre à chaque navire). Chaque lanterne fixe n'a qu'une boîte au matériau
 * de lampe : `addStatics` y retrouve ses lanternes (halos, lumière). Ne rien poser d'autre au matériau `p.glow`.
 */
export function addLampFixtures(batch: GeometryBatch, p: Palette, lamps: readonly LampSpec[]) {
  const box = () => new THREE.BoxGeometry(1, 1, 1);
  const P = SHIP_LAMPS.post;
  const W = SHIP_LAMPS.wall;
  const H = SHIP_LAMPS.hanging;
  for (const lamp of lamps) {
    const s = lamp.scale ?? 1;
    if (lamp.kind === 'post') {
      const height = lamp.height ?? P.height;
      const place = tf(lamp.at.x, lamp.at.y, lamp.at.z, 0, lamp.facing ?? 0);
      batch.add(p.dark, new THREE.BoxGeometry(P.foot * s, P.footHeight * s, P.foot * s), place.clone().multiply(tf(0, (P.footHeight * s) / 2, 0)));
      batch.add(p.dark, new THREE.CylinderGeometry(P.radius * s, P.radius * s * P.taper, height, 5), place.clone().multiply(tf(0, height / 2, 0)));
      addLanternBody(batch, p, place.clone().multiply(tf(0, height + LANTERN_BOTTOM * s, 0, 0, 0, 0, s)));
    } else if (lamp.kind === 'wall') {
      // Platine contre le mur, tablette sous la lanterne, jambe de force qui part du mur plus bas.
      const place = new THREE.Matrix4().compose(lamp.at, yawOf(lamp.facing), new THREE.Vector3(s, s, s));
      const [pw, ph, pt] = W.plate;
      const shelf = -LANTERN_BOTTOM - W.bracket / 2;
      batch.add(p.dark, box(), place.clone().multiply(tf(0, 0, pt / 2, 0, 0, 0, [pw, ph, pt])));
      batch.add(p.dark, box(), place.clone().multiply(tf(0, shelf, W.offset / 2, 0, 0, 0, [W.bracket, W.bracket, W.offset])));
      batch.add(p.dark, box(), place.clone().multiply(braceTf(new THREE.Vector3(0, shelf - W.brace[0], 0), new THREE.Vector3(0, shelf, W.offset * W.brace[1]), W.bracket)));
      addLanternBody(batch, p, place.clone().multiply(tf(0, 0, W.offset)));
    } else if ((lamp.arm ?? 0) > 0) {
      // Potence : platine contre le support, bras horizontal, jambe de force en dessous.
      const arm = lamp.arm!;
      const place = new THREE.Matrix4().compose(lamp.at, yawOf(lamp.facing ?? 0), new THREE.Vector3(1, 1, 1));
      const [pw, ph, pt] = H.armPlate;
      const t = H.arm * s;
      batch.add(p.dark, box(), place.clone().multiply(tf(0, (t - ph * s) / 2, (pt * s) / 2, 0, 0, 0, [pw * s, ph * s, pt * s])));
      batch.add(p.dark, box(), place.clone().multiply(tf(0, 0, arm / 2, 0, 0, 0, [t, t, arm])));
      batch.add(p.dark, box(), place.clone().multiply(braceTf(new THREE.Vector3(0, -H.armBrace[0] * s, 0), new THREE.Vector3(0, 0, arm * H.armBrace[1]), t)));
    } else {
      // Piton sous le barrot (ou la hune) où se prend la tige.
      const e = H.eye * s;
      batch.add(p.dark, box(), tf(lamp.at.x, lamp.at.y - e / 2, lamp.at.z, 0, lamp.facing ?? 0, 0, [e, e, e]));
    }
  }
}
