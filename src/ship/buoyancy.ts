import { BUOYANCY, RECOIL, type ShipStats } from '../config';
import type { Waves } from '../ocean/waves';

/** Réglages d'un ressort : part de la vitesse de la cible suivie, durcissement, vitesse max (rad/s ou m/s), butée. */
interface FollowOptions {
  follow: number;
  hardening: number;
  maxRate: number;
  hardLimit: number;
}

const DEFAULT_FOLLOW: FollowOptions = { follow: 1, hardening: BUOYANCY.hardening, maxRate: Infinity, hardLimit: BUOYANCY.hardLimit };

/**
 * Ressort qui suit une cible en mouvement (hauteur ou angle de l'eau). Il amortit l'écart de vitesse avec la cible,
 * pas la vitesse absolue : sinon il traîne derrière la vague, et le bateau plonge sous les crêtes ou décolle des creux.
 * Le ressort se durcit quand l'écart approche `maxOffset` (sans à-coup), et une butée l'arrête un peu plus loin.
 * Pour un navire lourd (FollowOptions) : il ne suit qu'une part de la vitesse de la cible, se durcit moins, et sa
 * vitesse est plafonnée en douceur (pas de bascule brutale au passage d'une crête).
 */
class Follower {
  value = 0;
  private speed = 0;
  private lastTarget = NaN;

  reset(value: number) {
    this.value = value;
    this.speed = 0;
    this.lastTarget = NaN;
  }

  copy(other: Follower) {
    this.value = other.value;
    this.speed = other.speed;
    this.lastTarget = other.lastTarget;
  }

  update(target: number, stiffness: number, damping: number, maxOffset: number, dt: number, o: FollowOptions = DEFAULT_FOLLOW) {
    if (dt <= 0) return;
    // Premier calcul (apparition) : on part posé sur l'eau.
    if (Number.isNaN(this.lastTarget)) this.value = target;
    const targetSpeed = Number.isNaN(this.lastTarget) ? 0 : (target - this.lastTarget) / dt;
    this.lastTarget = target;
    const ratio = (this.value - target) / maxOffset;
    // Raideur durcie, mais bornée pour que le calcul reste stable même à faible nombre d'images par seconde.
    const k = Math.min(stiffness * (1 + o.hardening * ratio * ratio), 1 / (dt * dt));
    this.speed += ((target - this.value) * k + (targetSpeed * o.follow - this.speed) * damping) * dt;
    // Vitesse plafonnée en douceur (tanh : aucun à-coup à l'approche du plafond).
    if (o.maxRate < Infinity) this.speed = o.maxRate * Math.tanh(this.speed / o.maxRate);
    this.value += this.speed * dt;
    // Butée de sécurité (rarement atteinte).
    const limit = maxOffset * o.hardLimit;
    const offset = this.value - target;
    if (Math.abs(offset) > limit) {
      this.value = target + Math.sign(offset) * limit;
      this.speed = targetSpeed;
    }
  }
}

/**
 * Flottaison d'une coque : mesure l'eau sous le centre, la proue, la poupe et les deux flancs, et en déduit
 * hauteur, tangage et roulis. Les ressorts de chaque type (shipTypes.ts, adoucis par la masse des améliorations)
 * donnent le caractère : vif pour une barque, lourd et posé pour un brigantin. Les gros navires ont en plus de
 * l'inertie en tangage et en roulis (BUOYANCY.heavyMass) : une vague courte ne les fait pas basculer d'un coup ; et
 * ils ne suivent qu'une part de la hauteur de la houle (BUOYANCY.heaveExponent) : ils montent et descendent moins vite.
 */
export class Buoyancy {
  private readonly height = new Follower();
  private readonly pitchFollower = new Follower();
  private readonly rollFollower = new Follower();
  /**
   * Balancement dû aux tirs, ajouté aux angles des vagues : un oscillateur lent et peu amorti, d'autant plus lent
   * que le bateau est lourd (il met du temps à revenir droit).
   */
  private readonly recoil = { roll: 0, rollSpeed: 0, pitch: 0, pitchSpeed: 0 };
  private readonly recoilOmega: number;
  /** Lenteur du tangage et du roulis due à la masse (1 = bateau léger), et les réglages de leurs ressorts qui en découlent. */
  private readonly inertia: number;
  private readonly tilt: FollowOptions;
  /** Part de la hauteur de l'eau que suit la coque (1 = navire léger ; un gros navire fend un peu les crêtes). */
  private readonly heave: number;

  /** `mass` : masse de base du type de bateau. */
  constructor(mass: number) {
    const period = RECOIL.period * Math.pow(mass / RECOIL.referenceMass, RECOIL.periodMassExponent);
    this.recoilOmega = (2 * Math.PI) / period;
    // Au-delà de la corvette, la masse compte moins (une frégate ne doit pas être lente à suivre la mer).
    const knee = BUOYANCY.inertiaKneeMass;
    const effective = mass <= knee ? mass : knee * Math.pow(mass / knee, BUOYANCY.inertiaKneeExponent);
    const inertia = (this.inertia = Math.pow(Math.max(1, effective / BUOYANCY.heavyMass), BUOYANCY.inertiaExponent));
    this.tilt = {
      follow: Math.pow(inertia, -BUOYANCY.followExponent),
      hardening: BUOYANCY.hardening / inertia,
      maxRate: inertia > 1 ? BUOYANCY.maxTiltRate / inertia : Infinity,
      hardLimit: BUOYANCY.hardLimit * inertia,
    };
    this.heave = Math.pow(Math.min(1, BUOYANCY.heavyMass / mass), BUOYANCY.heaveExponent);
  }

  get y(): number {
    return this.height.value;
  }

  /** Tangage (rad) : positif = proue haute. */
  get pitch(): number {
    return this.pitchFollower.value + this.recoil.pitch;
  }

  /** Roulis (rad) : positif = bâbord haut. */
  get roll(): number {
    return this.rollFollower.value + this.recoil.roll;
  }

  /** Secousse en roulis et en tangage (rad/s), par exemple le recul d'un canon. */
  kick(roll: number, pitch: number) {
    this.recoil.rollSpeed += roll;
    this.recoil.pitchSpeed += pitch;
  }

  /** Reprend l'assiette d'une autre coque du même type (même masse) : hauteur, tangage, roulis et leurs élans. */
  copyFrom(other: Buoyancy) {
    this.height.copy(other.height);
    this.pitchFollower.copy(other.pitchFollower);
    this.rollFollower.copy(other.rollFollower);
    Object.assign(this.recoil, other.recoil);
  }

  reset(y: number) {
    this.height.reset(y);
    this.pitchFollower.reset(0);
    this.rollFollower.reset(0);
    Object.assign(this.recoil, { roll: 0, rollSpeed: 0, pitch: 0, pitchSpeed: 0 });
  }

  /**
   * `sinking` : avancement du naufrage (0..1). `heel` : gîte due au virage (rad), ajoutée au roulis.
   * Bâbord (+X local) en coordonnées monde : (cos cap, −sin cap).
   */
  update(dt: number, stats: ShipStats, x: number, z: number, heading: number, heel: number, sinking: number, waves: Waves) {
    const b = stats.buoyancy;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const l = stats.length * BUOYANCY.sampleLength;
    const w = stats.width * BUOYANCY.sampleWidth;
    const center = waves.heightAt(x, z);
    const bow = waves.heightAt(x + fx * l, z + fz * l);
    const stern = waves.heightAt(x - fx * l, z - fz * l);
    const port = waves.heightAt(x + fz * w, z - fx * w);
    const starboard = waves.heightAt(x - fz * w, z + fx * w);

    // Naufrage : la coque s'alourdit, s'enfonce par l'avant et se couche sur le flanc.
    const sinkDepth = sinking * sinking * 9;
    const c = BUOYANCY.centerWeight;
    const targetY = ((center * c + bow + stern + port + starboard) / (c + 4)) * this.heave - sinkDepth;
    const targetPitch = Math.atan2(bow - stern, 2 * l) - sinking * 0.35;
    const targetRoll = Math.atan2(port - starboard, 2 * w) + heel + sinking * 0.8;

    const inertia = this.inertia;
    const response = b.tiltResponse / inertia;
    const tiltStiffness = response * response;
    const dampingRatio = BUOYANCY.tiltDamping + (BUOYANCY.heavyTiltDamping - BUOYANCY.tiltDamping) * (1 - 1 / inertia);
    const tiltDamping = 2 * dampingRatio * response;
    const max = BUOYANCY.maxOffset;
    this.height.update(targetY, b.stiffness, b.damping, max, dt);
    // Un écart d'angle est borné pour que les extrémités de la coque restent près de l'eau (plus loin si le navire est lourd).
    const reach = max * Math.pow(inertia, BUOYANCY.offsetExponent);
    this.pitchFollower.update(targetPitch, tiltStiffness, tiltDamping, reach / (stats.length / 2), dt, this.tilt);
    this.rollFollower.update(targetRoll, tiltStiffness, tiltDamping, reach / (stats.width / 2), dt, this.tilt);
    this.updateRecoil(dt);
  }

  /** Oscillateur amorti du recul (intégration semi-implicite, stable aux pas de temps du jeu). */
  private updateRecoil(dt: number) {
    const r = this.recoil;
    const w = this.recoilOmega;
    const c = 2 * RECOIL.damping * w;
    r.rollSpeed += (-w * w * r.roll - c * r.rollSpeed) * dt;
    r.roll += r.rollSpeed * dt;
    r.pitchSpeed += (-w * w * r.pitch - c * r.pitchSpeed) * dt;
    r.pitch += r.pitchSpeed * dt;
  }
}
