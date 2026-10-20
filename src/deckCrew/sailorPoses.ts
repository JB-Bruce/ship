import { DECK_CREW } from '../config';
import type { Sailor, ShipMotion } from './sailorMotion';
import { restPose, type SailorPose } from './sailorPose';

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
  const balance = s.mode === 'climb' || s.duty === 'aloft' ? 0 : BALANCE;
  p.lean = balance * (m.pitch * Math.cos(f) + m.roll * Math.sin(f));
  p.tilt = balance * (m.pitch * Math.sin(f) - m.roll * Math.cos(f));
  if (s.mode === 'fall') {
    p.roll = s.spin;
    p.armL = p.armR = 2.6;
    p.outL = p.outR = 0.7;
    p.legL = 0.5;
    p.legR = -0.4;
    return;
  }
  if (s.mode === 'climb') poseClimb(s, p);
  else if (s.mode === 'move') poseWalk(s, p);
  else poseDuty(s, p, t, m);
  // Sous le pont (descente, remontée) : il s'enfonce par l'écoutille.
  p.bob -= (1 - s.rise) * 1.2;
}

/** Marche ou course : l'amplitude suit la vitesse (il démarre et s'arrête en douceur). */
function poseWalk(s: Sailor, p: SailorPose) {
  const speed = Math.hypot(s.wx, s.wz);
  const amp = Math.min(0.8, speed * (s.run ? 0.26 : 0.4));
  const w = Math.sin(s.phase);
  p.legL = amp * w;
  p.legR = -amp * w;
  p.armL = 0.15 - amp * 0.8 * w;
  p.armR = 0.15 + amp * 0.8 * w;
  p.bob = Math.abs(Math.cos(s.phase)) * 0.03 * Math.min(1, speed) - 0.015;
  p.lean += Math.min(0.25, speed * 0.07);
}

/** Il grimpe (échelle, hauban) : une main après l'autre, un pied après l'autre. */
function poseClimb(s: Sailor, p: SailorPose) {
  const w = Math.sin(s.phase);
  p.armL = 2.5 + 0.4 * w;
  p.armR = 2.5 - 0.4 * w;
  p.outL = p.outR = 0.2;
  p.legL = 0.6 + 0.5 * Math.max(0, w);
  p.legR = 0.6 + 0.5 * Math.max(0, -w);
  p.lean = 0.15;
}

function poseDuty(s: Sailor, p: SailorPose, t: number, m: ShipMotion) {
  switch (s.duty) {
    case 'idle':
      p.bob = Math.sin(t * 1.6) * 0.008;
      p.headYaw = Math.sin(t * 0.35) * 0.6;
      // Les uns bras ballants, les autres les mains dans le dos, ou les poings sur les hanches.
      if (s.seed > 0.66) {
        p.armL = p.armR = -0.35;
        p.outL = p.outR = 0.15;
      } else if (s.seed > 0.4) {
        p.armL = p.armR = 0.3;
        p.outL = p.outR = 0.65;
      }
      break;
    case 'look':
      p.lean += 0.15;
      p.armL = p.armR = 0.75;
      p.outL = p.outR = 0.18;
      p.headYaw = Math.sin(t * 0.3) * 0.3;
      break;
    case 'chat': {
      // Il parle avec les mains de temps en temps, et hoche la tête.
      const talk = Math.max(0, Math.sin(t * 0.7));
      p.armR = 0.3 + talk * (0.9 + 0.3 * Math.sin(t * 6));
      p.outR = 0.25 + talk * 0.2;
      p.armL = s.seed > 0.5 ? -0.3 : 0.15;
      p.headYaw = Math.sin(t * 0.9) * 0.25;
      p.lean += 0.05 * Math.sin(t * 2.3);
      p.bob = Math.sin(t * 1.4) * 0.01;
      break;
    }
    case 'swab': {
      // À genoux, il frotte le pont à la pierre (va-et-vient des deux bras).
      const rub = Math.sin(t * 4);
      p.bob = -0.34;
      p.legL = 1.4;
      p.legR = 1.4;
      p.lean += 0.75;
      p.armL = p.armR = 1.1 + 0.35 * rub;
      p.outL = p.outR = 0.1;
      break;
    }
    case 'coil': {
      // Accroupi, il love un cordage : les mains tournent l'une après l'autre.
      p.bob = -0.25;
      p.legL = 1;
      p.legR = 0.3;
      p.lean += 0.5;
      p.armL = 0.9 + 0.35 * Math.sin(t * 3.2);
      p.armR = 0.9 + 0.35 * Math.cos(t * 3.2);
      p.outL = 0.2 + 0.15 * Math.cos(t * 3.2);
      p.outR = 0.2 + 0.15 * Math.sin(t * 3.2);
      break;
    }
    case 'sit':
      // Assis contre le pavois, jambes allongées, les mains sur les genoux.
      p.bob = -0.5;
      p.legL = p.legR = 1.5;
      p.lean -= 0.15;
      p.armL = p.armR = 0.7;
      p.headYaw = Math.sin(t * 0.25) * 0.5;
      break;
    case 'aloft':
      // Dans les haubans : une main tient, l'autre en visière, il regarde le large.
      p.armL = 2.6;
      p.outL = 0.2;
      p.armR = 2.3;
      p.outR = 0.5;
      p.legL = 0.7;
      p.legR = 0.2;
      p.headYaw = Math.sin(t * 0.4) * 0.8;
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
