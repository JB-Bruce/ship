import type * as THREE from 'three';
import { DECK_CREW } from '../config';
import { restPose, type SailorPose } from './sailorPose';

/** Ce que fait un marin sur son poste. */
export type Duty = 'helm' | 'lookout' | 'idle' | 'look' | 'gun' | 'brace' | 'rope' | 'repair';
/** Où il en est : à son poste, en chemin, descendu sous le pont ou en train d'en remonter, tombé à l'eau, absent. */
export type Mode = 'act' | 'move' | 'below' | 'rise' | 'fall' | 'gone';

export interface Sailor {
  readonly role: 'helm' | 'lookout' | 'hand';
  readonly shirt: THREE.Color;
  readonly hat: 'tricorn' | 'bandana';
  /** Phase propre (0..1) : les marins ne bougent pas tous en même temps. */
  readonly seed: number;
  /** Pose dessinée, recalculée à chaque image. */
  readonly pose: SailorPose;
  // Position des pieds et orientation, dans le repère du navire.
  x: number;
  y: number;
  z: number;
  facing: number;
  /** Promenade d'attache (index dans DeckPlan.walks). */
  walk: number;
  mode: Mode;
  duty: Duty;
  /** Cible du déplacement, et orientation à l'arrivée. */
  tx: number;
  ty: number;
  tz: number;
  tf: number;
  run: boolean;
  timer: number;
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

export function newSailor(role: Sailor['role'], shirt: THREE.Color, hat: Sailor['hat']): Sailor {
  return {
    role, shirt, hat, seed: Math.random(), pose: restPose(),
    x: 0, y: 0, z: 0, facing: 0, walk: 0, mode: 'act', duty: role === 'hand' ? 'idle' : role,
    tx: 0, ty: 0, tz: 0, tf: 0, run: false, timer: 0, phase: 0, rise: 1, leaving: false, post: -1, recoil: 0,
    vx: 0, vy: 0, vz: 0, spin: 0,
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
/** Il est arrivé à moins de cette distance de sa cible (m). */
const ARRIVED = 0.05;

/**
 * Fait avancer un marin selon son mode : chute (renvoie true quand il touche l'eau), descente sous le pont puis remontée
 * à sa cible, marche ou course vers sa cible. À son poste (« act »), rien ne bouge ici.
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
    case 'move': {
      const dx = s.tx - s.x;
      const dz = s.tz - s.z;
      const d = Math.hypot(dx, dz);
      const speed = s.run ? DECK_CREW.runSpeed : DECK_CREW.walkSpeed;
      if (d < ARRIVED + speed * dt) {
        s.x = s.tx;
        s.z = s.tz;
        s.mode = 'act';
        if (s.duty !== 'idle') s.facing = s.tf;
        return false;
      }
      s.x += (dx / d) * speed * dt;
      s.z += (dz / d) * speed * dt;
      s.facing = Math.atan2(dx, dz);
      s.phase += dt * speed * 5.5;
      return false;
    }
    default:
      return false;
  }
}

/** Part du roulis et du tangage que le buste compense (équilibre). */
const BALANCE = 0.6;
const REST = restPose();

/** Calcule la pose du marin selon ce qu'il fait. */
export function poseSailor(s: Sailor, m: ShipMotion) {
  const p = s.pose;
  const t = m.time + s.seed * 20;
  const f = s.facing;
  Object.assign(p, REST);
  p.x = s.x;
  p.y = s.y;
  p.z = s.z;
  p.facing = f;
  // Équilibre : le buste se redresse contre l'assiette du navire, exprimée dans le repère du marin.
  p.lean = BALANCE * (m.pitch * Math.cos(f) + m.roll * Math.sin(f));
  p.tilt = BALANCE * (m.pitch * Math.sin(f) - m.roll * Math.cos(f));
  if (s.mode === 'fall') {
    p.roll = s.spin;
    p.armL = p.armR = 2.6;
    p.outL = p.outR = 0.7;
    p.legL = 0.5;
    p.legR = -0.4;
    return;
  }
  if (s.mode === 'move') {
    const amp = s.run ? 0.75 : 0.45;
    const w = Math.sin(s.phase);
    p.legL = amp * w;
    p.legR = -amp * w;
    p.armL = 0.15 - amp * 0.8 * w;
    p.armR = 0.15 + amp * 0.8 * w;
    p.bob = Math.abs(Math.cos(s.phase)) * 0.03 - 0.015;
    p.lean += s.run ? 0.2 : 0.05;
  } else {
    poseDuty(s, p, t, m);
  }
  // Sous le pont (descente, remontée) : il s'enfonce par l'écoutille.
  p.bob -= (1 - s.rise) * 1.2;
}

function poseDuty(s: Sailor, p: SailorPose, t: number, m: ShipMotion) {
  switch (s.duty) {
    case 'idle':
      p.bob = Math.sin(t * 1.6) * 0.008;
      p.headYaw = Math.sin(t * 0.35) * 0.6;
      // Les uns bras ballants, les autres les mains dans le dos.
      if (s.seed > 0.6) {
        p.armL = p.armR = -0.35;
        p.outL = p.outR = 0.15;
      }
      break;
    case 'look':
      p.lean += 0.15;
      p.armL = p.armR = 0.75;
      p.outL = p.outR = 0.18;
      p.headYaw = Math.sin(t * 0.3) * 0.3;
      break;
    case 'gun': {
      // Accroupi derrière la culasse ; il recule quand la pièce tire, et refoule la charge pendant le rechargement.
      const back = s.recoil * DECK_CREW.recoil;
      p.x -= Math.sin(s.facing) * back;
      p.z -= Math.cos(s.facing) * back;
      p.bob = -0.12;
      p.legL = 0.35;
      p.legR = -0.2;
      p.lean += 0.3 - s.recoil * 0.4;
      p.armL = p.armR = 0.9 + (m.reloading(s.post) ? 0.45 * Math.sin(t * 7) : 0);
      break;
    }
    case 'brace':
      // En combat, sans canon à servir : accroupi derrière le pavois, il guette le large.
      p.bob = -0.22;
      p.legL = 0.8;
      p.legR = 0.15;
      p.lean += 0.35;
      p.armL = p.armR = 0.55;
      p.headYaw = Math.sin(t * 0.8) * 0.4;
      break;
    case 'rope':
      // Il hale, une main après l'autre, penché en arrière.
      p.lean -= 0.3;
      p.bob = -0.05;
      p.legL = 0.4;
      p.legR = -0.25;
      p.armL = 2 + 0.45 * Math.sin(t * 5);
      p.armR = 2 + 0.45 * Math.sin(t * 5 + Math.PI);
      p.outL = p.outR = 0.12;
      break;
    case 'repair':
      // À genoux, il cloue une planche.
      p.bob = -0.32;
      p.legL = 1.4;
      p.legR = 0.2;
      p.lean += 0.55;
      p.armL = 0.8;
      p.armR = 1.1 + 0.7 * Math.max(0, Math.sin(t * 9));
      break;
    case 'helm':
      // Les mains sur la roue ; il se penche dans le virage.
      p.armL = p.armR = 1.2;
      p.outL = p.outR = 0.22;
      p.tilt -= m.rudder * 0.15;
      p.headYaw = Math.sin(t * 0.25) * 0.25;
      break;
    case 'lookout':
      // La main en visière, il balaie l'horizon.
      p.armR = 2.7;
      p.outR = 0.45;
      p.lean += 0.05;
      p.headYaw = Math.sin(t * 0.5) * 0.9;
      break;
  }
}
