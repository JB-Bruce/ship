import * as THREE from 'three';
import { KRAKEN } from '../../config';
import type { CreatureTarget } from '../../combat/cannons';
import type { Structure } from '../../combat/projectiles';
import type { Ship } from '../../ship/ship';
import { radiusAt } from './tentacleMesh';

/** Une tentacule qui enserre la coque, ou qui bat l'air autour du navire et s'abat sur son pont. */
export type TentacleRole = 'grab' | 'flail';

/** Mesures du navire tenu, dans son repère : demi-largeur et demi-longueur, hauteur du pont et du plat-bord (m). */
export interface ShipFrame {
  hw: number;
  hl: number;
  deck: number;
  gunwale: number;
}

export function frameOf(ship: Ship): ShipFrame {
  const walks = ship.model.deckPlan?.walks ?? [];
  const deck = walks.length ? Math.min(...walks.map((w) => w.y)) : 0.5;
  return { hw: ship.stats.width / 2, hl: ship.stats.length / 2, deck, gunwale: deck + 1.1 };
}

const N = KRAKEN.segments;
const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
/** Quatre points de contrôle (repère du navire) : une pose de la tentacule. */
type Pose = [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
const newPose = (): Pose => [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const poseA = newPose();
const poseB = newPose();
const blended = newPose();
const local = new THREE.Vector3();
const closest = new THREE.Vector3();
const segment = new THREE.Line3();
const box = new THREE.Box3();

function blend(out: Pose, a: Pose, b: Pose, k: number) {
  for (let i = 0; i < 4; i++) out[i].lerpVectors(a[i], b[i], k);
}

/**
 * Une tentacule du Kraken : sa pose (courbe de Bézier dans le repère du navire tenu, plus une ondulation), recalculée
 * à chaque image en points du monde (`points`, du pied à la pointe) ; sa vie cachée (elle se voit à sa couleur et à
 * son agitation) ; c'est une cible des canons de tous les camps et un ouvrage que les boulets touchent.
 */
export class Tentacle implements CreatureTarget, Structure {
  readonly kind = 'tentacle' as const;
  readonly faction = 'monster' as const;
  readonly flesh = true;
  /** Point visé : la partie hors de l'eau, à l'extérieur du bordé. */
  readonly position = new THREE.Vector3();
  velocityX = 0;
  velocityZ = 0;
  readonly radius = 2;
  readonly aimHeight = 0;
  readonly points = Array.from({ length: N + 1 }, () => new THREE.Vector3());
  /** 0 = sous l'eau, 1 = en place ; `up` : vers où elle va. */
  rise = 0;
  up = false;
  /** Tranchée par les boulets : le tronçon `cutAt` et ceux au-dessus sont partis, le reste retombe et coule. */
  cut = false;
  cutAt = N;
  health: number;
  maxHealth: number;
  /** Sursaut après un coup (s), et temps écoulé dans le coup de tentacule en cours (s, -1 : aucun). */
  hurt = 0;
  slam = -1;
  private readonly bounds = new THREE.Sphere();

  constructor(
    public role: TentacleRole,
    public side: 1 | -1,
    /** Place le long de la coque (-1 poupe, 1 proue) et écart au bordé d'une tentacule libre (m). */
    public along: number,
    public out: number,
    readonly phase: number,
    health: number,
  ) {
    this.health = this.maxHealth = health;
  }

  /** Visée par les canons : sortie de l'eau, entière. */
  get alive(): boolean {
    return !this.cut && this.rise > 0.7;
  }

  /** Enserre la coque. */
  get gripping(): boolean {
    return this.role === 'grab' && !this.cut && this.rise > 0.95;
  }

  /** Abîmée, de 0 (intacte) à 1. */
  get wound(): number {
    return 1 - Math.max(0, this.health) / this.maxHealth;
  }

  /** Avance la montée ou la descente et le coup de tentacule, puis recalcule les points (repère : `ship`). */
  update(dt: number, time: number, ship: Ship, f: ShipFrame) {
    this.rise = clamp01(this.rise + (this.up && !this.cut ? 1 : -1) * dt / (this.cut ? KRAKEN.diveTime * 0.7 : this.up ? KRAKEN.emergeTime : KRAKEN.diveTime));
    this.hurt = Math.max(0, this.hurt - dt * 2);
    if (this.slam >= 0) this.slam += dt;
    this.posture(time, f);
    this.sample(time, ship);
    this.velocityX = ship.velocityX;
    this.velocityZ = ship.velocityZ;
  }

  /** Fin du coup de tentacule ? (alors `slam` revient à -1) */
  get slamPhase(): 'raise' | 'strike' | 'hold' | 'recover' | null {
    if (this.slam < 0) return null;
    const s = KRAKEN.slam;
    if (this.slam < s.raise) return 'raise';
    if (this.slam < s.raise + s.strike) return 'strike';
    if (this.slam < s.raise + s.strike + s.hold) return 'hold';
    if (this.slam < s.raise + s.strike + s.hold + 1) return 'recover';
    this.slam = -1;
    return null;
  }

  /** Les quatre points de contrôle de la pose du moment, dans `blended`. */
  private posture(time: number, f: ShipFrame) {
    const k = this.rise;
    this.submerged(poseA, f);
    if (this.role === 'grab') {
      this.reared(poseB, f);
      if (k < 0.55) return blend(blended, poseA, poseB, ease(k / 0.55));
      this.wrap(poseA, f, time);
      return blend(blended, poseB, poseA, ease((k - 0.55) / 0.45));
    }
    this.flail(poseB, f, time);
    blend(blended, poseA, poseB, ease(k));
    const phase = this.slamPhase;
    if (!phase || k < 1) return;
    const s = KRAKEN.slam;
    const t = this.slam;
    if (phase === 'raise') {
      this.rearBack(poseA, f, time);
      blend(blended, poseB, poseA, ease(t / s.raise));
    } else if (phase === 'strike') {
      this.rearBack(poseA, f, time);
      this.smash(poseB, f);
      const u = (t - s.raise) / s.strike;
      blend(blended, poseA, poseB, u * u);
    } else if (phase === 'hold') this.smash(blended, f);
    else {
      this.smash(poseA, f);
      blend(blended, poseA, poseB, ease(t - s.raise - s.strike - s.hold));
    }
  }

  private submerged(p: Pose, f: ShipFrame) {
    const s = this.side;
    const o = f.hw + (this.role === 'grab' ? 3 : this.out);
    const z = this.along * f.hl * 0.75;
    p[0].set(s * o, -10, z - 1);
    p[1].set(s * (o + 0.5), -8, z);
    p[2].set(s * o, -7, z + 1);
    p[3].set(s * (o - 1), -7, z + 2);
  }

  private wrap(p: Pose, f: ShipFrame, time: number) {
    const s = this.side;
    const z = this.along * f.hl * 0.75;
    // Elle serre et desserre : la boucle autour du plat-bord respire.
    const squeeze = 0.35 * Math.sin(time * 2.2 + this.phase);
    p[0].set(s * (f.hw + 2.6), -4.5, z - 1.5);
    p[1].set(s * (f.hw + 3.4 - squeeze), f.gunwale + 3.2, z - 0.5);
    p[2].set(s * f.hw * 0.55, f.gunwale + 2.4 + squeeze, z + 0.8);
    p[3].set(-s * f.hw * 0.25, f.deck + 0.5, z + 2);
  }

  private reared(p: Pose, f: ShipFrame) {
    const s = this.side;
    const z = this.along * f.hl * 0.75;
    p[0].set(s * (f.hw + 2.6), -4.5, z - 1.5);
    p[1].set(s * (f.hw + 4.5), f.gunwale + 7, z - 0.5);
    p[2].set(s * (f.hw + 2.5), f.gunwale + 13, z + 0.5);
    p[3].set(s * f.hw * 0.3, f.gunwale + 11, z + 1.5);
  }

  /** Hauteur d'une tentacule libre au-dessus de l'eau (m) : elle grandit avec le navire tenu. */
  private height(f: ShipFrame) {
    return 10 + f.hw * 0.8 + 2 * Math.sin(this.phase * 3.1);
  }

  private flail(p: Pose, f: ShipFrame, time: number) {
    const s = this.side;
    const o = f.hw + this.out;
    const z = this.along * f.hl * 0.75;
    const h = this.height(f);
    const t = time + this.phase * 5;
    // Elle monte en se balançant, et sa pointe s'enroule vers le navire (jamais droite comme une corne).
    const curl = 0.5 + 0.5 * Math.sin(t * 0.5);
    p[0].set(s * o, -4.5, z);
    p[1].set(s * (o + 2.5 + Math.sin(t * 0.7) * 1.2), h * 0.55, z + Math.sin(t * 0.7) * 2);
    p[2].set(s * (o + 0.5 + Math.sin(t * 0.9) * 2.5), h * 1.05, z + Math.cos(t * 0.6) * 3);
    p[3].set(s * (o - 3 - 2 * curl + Math.sin(t * 1.1 + 1)), h * (0.75 - 0.15 * curl), z + Math.sin(t * 0.8 + 2) * 3.5);
  }

  /** Elle se dresse, penchée en arrière, avant de s'abattre (l'alerte). */
  private rearBack(p: Pose, f: ShipFrame, time: number) {
    const s = this.side;
    const o = f.hw + this.out;
    const z = this.along * f.hl * 0.75;
    const h = this.height(f);
    const tremble = 0.25 * Math.sin(time * 19 + this.phase);
    p[0].set(s * o, -4.5, z);
    p[1].set(s * (o + 2.5), h * 0.55, z);
    p[2].set(s * (o + 3.5 + tremble), h * 1.15, z);
    p[3].set(s * (o + 1.5 + tremble), h * 1.55, z);
  }

  /** Abattue en travers du pont. */
  private smash(p: Pose, f: ShipFrame) {
    const s = this.side;
    const o = f.hw + this.out;
    const z = this.along * f.hl * 0.75;
    p[0].set(s * o, -4.5, z);
    p[1].set(s * (o + 0.5), f.gunwale + 5, z);
    p[2].set(s * f.hw * 0.7, f.gunwale + 3, z);
    p[3].set(-s * f.hw * 0.6, f.deck + 0.35, z + 1);
  }

  /** Échantillonne la courbe (plus son ondulation) en points du monde, et tient à jour le point visé et l'enveloppe. */
  private sample(time: number, ship: Ship) {
    const [a, b, c, d] = blended;
    const writhe = (this.role === 'grab' && this.rise > 0.95 ? 0.15 : 0.55) + this.wound * 0.6 + this.hurt * 1.2;
    const m = ship.model.root.matrixWorld;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const v = 1 - u;
      local.set(0, 0, 0)
        .addScaledVector(a, v * v * v)
        .addScaledVector(b, 3 * v * v * u)
        .addScaledVector(c, 3 * v * u * u)
        .addScaledVector(d, u * u * u);
      const w = writhe * u ** 1.5;
      local.x += w * Math.sin(time * 3.1 - u * 6 + this.phase);
      local.z += w * Math.cos(time * 2.6 - u * 5 + this.phase * 1.7);
      this.points[i].copy(local).applyMatrix4(m);
    }
    this.position.copy(this.points[Math.round(N * (this.role === 'grab' ? 0.35 : 0.3))]);
    box.makeEmpty();
    for (let i = 0; i <= this.cutAt; i++) box.expandByPoint(this.points[i]);
    box.getBoundingSphere(this.bounds);
    this.bounds.radius += KRAKEN.radius[0];
  }

  /** Un point du monde dans la chair (tronçons hors de l'eau, sous la coupure) ? */
  containsPoint(x: number, y: number, z: number): boolean {
    local.set(x, y, z);
    if (!this.bounds.containsPoint(local)) return false;
    return this.segmentAt(local) >= 0;
  }

  /** Le tronçon qui contient ce point (ou -1). */
  segmentAt(p: THREE.Vector3): number {
    for (let i = 0; i < this.cutAt; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      if (a.y < -1 && b.y < -1) continue;
      segment.set(a, b).closestPointToPoint(p, true, closest);
      const r = radiusAt(i) + 0.3;
      if (closest.distanceToSquared(p) < r * r) return i;
    }
    return -1;
  }
}
