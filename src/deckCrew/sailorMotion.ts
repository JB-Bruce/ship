import type * as THREE from 'three';
import type { MastTop, TopRoute } from './mastTops';
import { restPose, type SailorPose } from './sailorPose';
import type { Shroud } from './shrouds';

/**
 * Ce que fait un marin : barre, vigie, flânerie (`idle`, `look` accoudé au pavois), canons, à couvert, cordages,
 * réparation, discussion, lavage du pont, cordages qu'on love, assis, là-haut dans les haubans (`aloft`) ou debout
 * dans une hune à regarder le large (`watch`).
 */
export type Duty = 'helm' | 'lookout' | 'idle' | 'look' | 'gun' | 'brace' | 'rope' | 'repair' | 'chat' | 'swab' | 'coil' | 'sit' | 'aloft' | 'watch';

/** Une place dans une hune : la hune, la place (index de MastTop.spots), la montée prise (null : il y est posé). */
export interface Perch {
  top: MastTop;
  spot: number;
  route: TopRoute | null;
}
/**
 * Où il en est : à son poste, en chemin sur le pont, en train de grimper (échelle, hauban), descendu sous le pont ou
 * en train d'en remonter, tombé à l'eau, absent.
 */
export type Mode = 'act' | 'move' | 'climb' | 'below' | 'rise' | 'fall' | 'gone';

export interface Sailor {
  readonly role: 'helm' | 'lookout' | 'hand';
  readonly shirt: THREE.Color;
  readonly hat: 'tricorn' | 'bandana';
  /** Phase propre (0..1) : les marins ne bougent pas tous en même temps. */
  readonly seed: number;
  /** Allure propre (× la vitesse de marche) : chacun son pas. */
  readonly pace: number;
  /** Pose dessinée, recalculée à chaque image. */
  readonly pose: SailorPose;
  // Position des pieds et orientation, dans le repère du navire.
  x: number;
  y: number;
  z: number;
  facing: number;
  /** Partie du pont où il flâne d'habitude (index dans DeckPlan.walks, pour répartir l'équipage). */
  walk: number;
  mode: Mode;
  duty: Duty;
  /** Cible du déplacement, et orientation voulue à l'arrivée (il s'y tourne en douceur). */
  tx: number;
  ty: number;
  tz: number;
  tf: number;
  run: boolean;
  /** Temps restant de l'occupation en cours (s). */
  timer: number;
  /** Petit rythme dans l'occupation (lavage : prochain déplacement, s). */
  beat: number;
  /** Chemin sur le pont (nœuds de DeckNav) et prochain nœud visé. */
  path: number[];
  step: number;
  /** Vitesse de marche (m/s, repère du navire). */
  wx: number;
  wz: number;
  /** Temps passé sans avancer (s) : au-delà, il cherche un autre chemin ; nouveaux chemins déjà cherchés pour ce trajet. */
  stuck: number;
  retries: number;
  /** Escalade (échelle, hauban) : points à rejoindre (x, y, z à la suite), le prochain, et ce qui suit l'arrivée. */
  climb: number[];
  climbStep: number;
  climbThen: 'path' | 'act';
  /** Hauban où il grimpe, ou null ; place dans une hune (il y monte, y est ou en redescend), ou null. */
  shroud: Shroud | null;
  perch: Perch | null;
  /** Groupe de discussion (-1 = aucun). */
  group: number;
  /** Cycle de marche. */
  phase: number;
  /** 0 = sous le pont, 1 = debout sur le pont. */
  rise: number;
  /** Il descend pour ne pas remonter (il remonte plus tard, quand le navire se répare). */
  leaving: boolean;
  /** Canon servi (index dans model.cannons) ou poste aux cordages occupé ; -1 sinon. */
  post: number;
  /** 1 = sa pièce vient de tirer (recul), décroît jusqu'à 0. */
  recoil: number;
  // Chute à l'eau : vitesse et culbute.
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

export function newSailor(role: Sailor['role'], shirt: THREE.Color, hat: Sailor['hat'], pace: number): Sailor {
  return {
    role, shirt, hat, seed: Math.random(), pace, pose: restPose(),
    x: 0, y: 0, z: 0, facing: 0, walk: 0, mode: 'act', duty: role === 'hand' ? 'idle' : role,
    tx: 0, ty: 0, tz: 0, tf: 0, run: false, timer: 0, beat: 0, path: [], step: 0, wx: 0, wz: 0, stuck: 0, retries: 0,
    climb: [], climbStep: 0, climbThen: 'act', shroud: null, perch: null, group: -1,
    phase: 0, rise: 1, leaving: false, post: -1, recoil: 0, vx: 0, vy: 0, vz: 0, spin: 0,
  };
}

/** Ce que le marin voit de son navire pour bouger. */
export interface ShipMotion {
  time: number;
  /** Assiette du navire (rad) : le buste des marins en compense une part. */
  pitch: number;
  roll: number;
  rudder: number;
  /** La pièce du canonnier se recharge-t-elle ? */
  reloading(cannon: number): boolean;
}

const GRAVITY = 9.8;
/** Vitesse de descente et de remontée par une écoutille (fraction par seconde). */
const HATCH_SPEED = 2.5;

/** Angle `from` tourné vers `to` d'au plus `step` rad (par le plus court). */
export function turnToward(from: number, to: number, step: number): number {
  const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}

/**
 * Fait avancer un marin qui ne marche pas : chute (renvoie true quand il touche l'eau), descente sous le pont puis
 * remontée à sa cible. La marche et l'escalade sont dans SailorWalker.
 */
export function advance(s: Sailor, dt: number): boolean {
  s.recoil = Math.max(0, s.recoil - dt * 2);
  switch (s.mode) {
    case 'fall':
      s.vy -= GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.spin += Math.sign(s.vx) * 4 * dt;
      if (s.y >= -0.4) return false;
      s.mode = 'gone';
      return true;
    case 'below':
      s.rise -= dt * HATCH_SPEED;
      if (s.rise > 0) return false;
      s.rise = 0;
      s.x = s.tx;
      s.y = s.ty;
      s.z = s.tz;
      s.facing = s.tf;
      s.mode = s.leaving ? 'gone' : 'rise';
      return false;
    case 'rise':
      s.rise = Math.min(1, s.rise + dt * HATCH_SPEED);
      if (s.rise >= 1) s.mode = 'act';
      return false;
    default:
      return false;
  }
}
