import * as THREE from 'three';
import { PLAYER } from '../config';
import type { DeckNav } from '../deckCrew/deckNav';
import type { MastTop, TopRoute } from '../deckCrew/mastTops';
import type { Shroud } from '../deckCrew/shrouds';
import type { DeckFooting } from './deckFooting';

/** Ce que le joueur demande à son corps à chaque image (repère du navire). */
export interface FootInput {
  /** Direction voulue sur le pont (longueur 0 à 1) : x vers bâbord, z vers la proue. */
  moveX: number;
  moveZ: number;
  run: boolean;
  /** Saut demandé (une fois). */
  jump: boolean;
  /** Avancer (+1) ou reculer (-1) : sur une échelle ou un hauban, monter ou descendre. */
  forward: number;
}

/**
 * Une escalade en cours, le long d'une ligne brisée (repère du navire) : `at` m parcourus depuis le bas, au plus `max`
 * (un hauban sans hune ne se grimpe qu'en partie).
 */
interface Climb {
  points: THREE.Vector3[];
  length: number;
  at: number;
  max: number;
  /** Nœud où l'on reprend pied en redescendant (en bas), et en haut pour une échelle (sinon -1). */
  footNode: number;
  topNode: number;
  /** Hauban grimpé (ou null : échelle), et la hune où il mène (on y prend pied en haut), ou null. */
  shroud: Shroud | null;
  top: MastTop | null;
}

function climbOf(points: THREE.Vector3[], fields: Omit<Climb, 'points' | 'length' | 'at' | 'max'>, share = 1): Climb {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
  return { points, length, at: 0, max: length * share, ...fields };
}

/**
 * Le joueur à pied sur le pont de son navire (repère du modèle) : il marche ou court dans la direction voulue, monte
 * les marches, saute (et peut monter sur ce qui est bas), retombe d'un château vers le pont du dessous ; le pavois,
 * les mâts et les cloisons l'arrêtent et il glisse le long d'eux ; il traverse les canons, la roue, la barre franche
 * et les matelots. Sur une échelle ou un hauban, avancer monte et reculer descend. Un hauban qui mène à une hune se
 * grimpe jusqu'en haut : on prend pied sur la hune, d'où l'on redescend par le hauban ou d'où l'on saute vers le pont.
 */
export class PlayerBody {
  readonly position = new THREE.Vector3();
  /** Dernier endroit où il se tenait debout. */
  private readonly safe = new THREE.Vector3();
  private vx = 0;
  private vz = 0;
  private vy = 0;
  grounded = true;
  climb: Climb | null = null;
  /** Cycle de pas (balancement de la tête) et vitesse au sol (m/s). */
  stride = 0;
  speed = 0;

  constructor(
    private readonly nav: DeckNav,
    private readonly footing: DeckFooting,
  ) {}

  /**
   * Pose le joueur sur le nœud praticable le plus proche de (x, y, z) où son corps tient, à plus de `clear.r` m de
   * `clear` s'il est donné (la place du barreur, quand on quitte la barre).
   */
  place(x: number, y: number, z: number, clear: { x: number; z: number; r: number } | null = null) {
    const nav = this.nav;
    let best = -1;
    let bestD = Infinity;
    for (const list of nav.nodes) {
      for (const n of list) {
        const d = Math.hypot(nav.x(n) - x, nav.z(n) - z) + Math.abs(nav.y(n) - y) * 2;
        if (d >= bestD || (clear && Math.hypot(nav.x(n) - clear.x, nav.z(n) - clear.z) < clear.r)) continue;
        this.position.set(nav.x(n), nav.y(n), nav.z(n));
        this.grounded = true;
        if (!this.fits(nav.x(n), nav.z(n))) continue;
        best = n;
        bestD = d;
      }
    }
    if (best >= 0) this.position.set(nav.x(best), nav.y(best), nav.z(best));
    else this.position.set(x, y, z);
    this.safe.copy(this.position);
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.climb = null;
  }

  update(dt: number, input: FootInput) {
    if (this.climb) return this.climbStep(dt, input);
    const p = this.position;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const accel = this.grounded ? PLAYER.accel : PLAYER.airAccel;
    const k = Math.min(1, accel * dt);
    this.vx += (input.moveX * speed - this.vx) * k;
    this.vz += (input.moveZ * speed - this.vz) * k;
    if (input.jump && this.grounded) {
      this.vy = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    // Pas de côté puis de face : contre un obstacle, on glisse le long de lui.
    const x0 = p.x;
    const z0 = p.z;
    if (this.canEnter(p.x + this.vx * dt, p.z)) p.x += this.vx * dt;
    if (this.canEnter(p.x, p.z + this.vz * dt)) p.z += this.vz * dt;
    this.speed = Math.hypot(p.x - x0, p.z - z0) / Math.max(dt, 1e-4);
    this.vertical(dt);
    if (this.grounded) this.stride += this.speed * dt * PLAYER.bob.frequency;
    this.ladderStart(input);
  }

  /** Monter dans un hauban (depuis le pont, près de son pied) : jusque dans sa hune s'il y en a une. */
  startShroud(h: Shroud) {
    const deck = new THREE.Vector3(this.nav.x(h.node), this.nav.y(h.node), this.nav.z(h.node));
    this.position.copy(deck);
    const found = this.routeOf(h);
    if (found) this.climb = climbOf(found.route.points.map((p) => p.clone()), { footNode: h.node, topNode: -1, shroud: h, top: found.top });
    else this.climb = climbOf([h.foot.clone().setY(h.foot.y + PLAYER.shroudStep), h.head.clone()], { footNode: h.node, topNode: -1, shroud: h, top: null }, PLAYER.shroudReach);
    this.vx = this.vz = this.vy = 0;
  }

  /** Redescendre d'une hune par l'un de ses haubans : on part d'en haut. */
  descend(top: MastTop, route: TopRoute) {
    const c = climbOf(route.points.map((p) => p.clone()), { footNode: route.shroud.node, topNode: -1, shroud: route.shroud, top });
    c.at = c.length - PLAYER.topStep;
    this.climb = c;
    this.vx = this.vz = this.vy = 0;
    this.pointAt(c, c.at, this.position);
  }

  /** La hune où l'on se tient debout, ou null. */
  standingTop(): MastTop | null {
    if (!this.grounded || this.climb) return null;
    const p = this.position;
    for (const top of this.nav.tops) if (Math.abs(top.ground(p.x, p.z) - p.y) < PLAYER.stepUp) return top;
    return null;
  }

  private routeOf(h: Shroud): { top: MastTop; route: TopRoute } | null {
    for (const top of this.nav.tops) for (const route of top.routes) if (route.shroud === h) return { top, route };
    return null;
  }

  /** Prendre pied sur une hune, au plus près de (x, z). */
  private stepOnto(top: MastTop, x: number, z: number) {
    top.nearest(x, z, this.position);
    this.safe.copy(this.position);
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.climb = null;
  }

  /** Redescendre tout de suite d'un hauban (ou d'une échelle, par le bas). */
  leaveClimb() {
    const c = this.climb;
    if (!c) return;
    this.climb = null;
    this.place(this.nav.x(c.footNode), this.nav.y(c.footNode), this.nav.z(c.footNode));
  }

  /** Point de vue : les yeux, avec le balancement de la marche (repère du navire). */
  eye(out: THREE.Vector3): THREE.Vector3 {
    const bob = this.grounded && !this.climb ? Math.sin(this.stride) * PLAYER.bob.height * Math.min(1, this.speed / PLAYER.runSpeed + 0.3) : 0;
    return out.set(this.position.x, this.position.y + PLAYER.eyeHeight + (this.speed > PLAYER.bob.minSpeed ? bob : 0), this.position.z);
  }

  /**
   * Peut-on aller en (x, z) à la hauteur actuelle des pieds ? Le corps a une petite largeur ; déjà coincé (poussé
   * contre un obstacle), on peut toujours s'en dégager tant que le centre reste sur le pont.
   */
  private canEnter(x: number, z: number): boolean {
    if (this.fits(x, z)) return true;
    const p = this.position;
    return !this.fits(p.x, p.z) && this.footing.groundBelow(x, z, this.top()) !== -Infinity;
  }

  /** Le corps tient-il en (x, z) : le centre et quatre points autour ont où se tenir ? */
  private fits(x: number, z: number): boolean {
    const top = this.top();
    const r = PLAYER.radius;
    for (const [dx, dz] of PROBES) if (this.footing.groundBelow(x + dx * r, z + dz * r, top) === -Infinity) return false;
    return true;
  }

  /** La plus haute surface qu'on peut atteindre depuis les pieds : une marche au sol, un peu moins en l'air. */
  private top(): number {
    return this.position.y + (this.grounded ? PLAYER.stepUp : PLAYER.airStep);
  }

  /** Marches, sauts et chutes : la plus haute surface sous les pieds. */
  private vertical(dt: number) {
    const p = this.position;
    const ground = this.footing.groundBelow(p.x, p.z, this.top());
    if (this.grounded) {
      // Rien de connu sous les pieds (coincé dans un obstacle) : on ne passe pas à travers le plancher, on s'en dégage.
      if (ground === -Infinity) return;
      if (ground >= p.y - PLAYER.stepDown) {
        p.y += (ground - p.y) * Math.min(1, PLAYER.stepSmooth * dt);
        this.safe.copy(p);
        return;
      }
      // Le pied ne trouve plus rien : il tombe (bord d'un château, haut d'un escalier sauté).
      this.grounded = false;
      this.vy = 0;
    }
    this.vy -= PLAYER.gravity * dt;
    p.y += this.vy * dt;
    if (ground !== -Infinity && p.y <= ground && this.vy <= 0) {
      p.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (p.y < this.footing.lowest - PLAYER.lostFall) {
      // Tombé sous tous les ponts (ne devrait pas arriver) : retour au dernier endroit sûr.
      this.place(this.safe.x, this.safe.y, this.safe.z);
    }
  }

  /** Au pied (ou en haut) d'une échelle, en avançant vers elle : on y grimpe. */
  private ladderStart(input: FootInput) {
    if (!this.grounded || input.forward <= 0) return;
    const nav = this.nav;
    const p = this.position;
    for (const [from, to] of nav.ladders) {
      const fx = nav.x(from);
      const fz = nav.z(from);
      if (Math.hypot(p.x - fx, p.z - fz) > PLAYER.ladderReach || Math.abs(nav.y(from) - p.y) > PLAYER.stepUp) continue;
      // Il faut se diriger vers l'autre bout.
      const tx = nav.x(to) - fx;
      const tz = nav.z(to) - fz;
      const len = Math.hypot(tx, tz) || 1;
      if ((tx * input.moveX + tz * input.moveZ) / len < PLAYER.ladderFacing) continue;
      const a = new THREE.Vector3(fx, nav.y(from), fz);
      const b = new THREE.Vector3(nav.x(to), nav.y(to), nav.z(to));
      this.climb = climbOf([a, b], { footNode: from, topNode: to, shroud: null, top: null });
      this.vx = this.vz = this.vy = 0;
      return;
    }
  }

  private climbStep(dt: number, input: FootInput) {
    const c = this.climb!;
    c.at = Math.min(c.max, c.at + input.forward * PLAYER.climbSpeed * (input.run ? PLAYER.climbRun : 1) * dt);
    this.stride += Math.abs(input.forward) * dt * PLAYER.bob.frequency;
    if (c.at <= 0 && input.forward < 0) return this.leaveClimb();
    const end = c.points[c.points.length - 1];
    if (c.at >= c.length && c.top) return this.stepOnto(c.top, end.x, end.z);
    if (c.at >= c.length && c.topNode >= 0) {
      this.climb = null;
      this.place(this.nav.x(c.topNode), this.nav.y(c.topNode), this.nav.z(c.topNode));
      return;
    }
    this.pointAt(c, Math.max(0, c.at), this.position);
  }

  /** Le point à `at` m du bas de l'escalade. */
  private pointAt(c: Climb, at: number, out: THREE.Vector3) {
    let left = at;
    for (let i = 1; i < c.points.length; i++) {
      const d = c.points[i].distanceTo(c.points[i - 1]);
      if (left <= d || i === c.points.length - 1) return out.lerpVectors(c.points[i - 1], c.points[i], d > 0 ? Math.min(1, left / d) : 1);
      left -= d;
    }
    return out.copy(c.points[0]);
  }
}

/** Points du corps testés contre le décor : le centre et quatre points autour, à son rayon. */
const PROBES = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
