import * as THREE from 'three';
import { KRAKEN } from '../../config';
import type { CreatureTarget } from '../../combat/cannons';
import type { Ship } from '../../ship/ship';
import { KrakenHead } from './krakenHead';
import { SeveredPiece } from './severedPiece';
import { frameOf, Tentacle, type ShipFrame } from './tentacle';

/** Où il en est : il nage vers sa proie, surgit, la tient, replonge, se regroupe sous l'eau, ou fuit. */
export type KrakenPhase = 'approach' | 'hold' | 'dive' | 'regroup' | 'flee' | 'gone';

/** Ce que le Kraken fait au monde (dégâts, voiles, équipage, secousse, sons, messages) : fourni par Krakens. */
export interface KrakenActs {
  damage(ship: Ship, amount: number): void;
  tearSail(ship: Ship): void;
  knockCrew(ship: Ship, count: number): void;
  shake(ship: Ship, amount: number): void;
  burst(x: number, y: number, z: number, scale: number): void;
  sound(name: string, at: THREE.Vector3, volume?: number): void;
  /** Une nouvelle proie à moins de `range` m de (x, z), ou null. */
  prey(x: number, z: number, range: number): Ship | null;
  /** Il a surgi sous `ship`, la tête est sortie, il fuit. */
  event(kind: 'grab' | 'head' | 'flee', ship: Ship | null): void;
}

const N = KRAKEN.segments;
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const push = new THREE.Vector3();

/**
 * Un Kraken : il nage sous l'eau vers sa proie (ombre et bouillons), surgit et l'enserre de ses tentacules (il la
 * freine, la fait gîter et l'écrase), la frappe de ses tentacules libres, perd ses tentacules sous les boulets ; la
 * tête sort quand assez sont tranchées. Tête vaincue ou trop peu de tentacules : il fuit. Sinon il replonge et surgit
 * sous une autre proie. On ne le tue jamais.
 */
export class Kraken {
  phase: KrakenPhase = 'approach';
  /** Centre de la bête sous l'eau, et son cap (vers sa proie). */
  readonly position = new THREE.Vector3();
  heading = 0;
  target: Ship | null;
  readonly tentacles: Tentacle[];
  readonly head: KrakenHead;
  readonly pieces: SeveredPiece[] = [];
  /** Tout ce que les canons visent : les tentacules, puis la tête. */
  readonly parts: CreatureTarget[];
  /** Graine de son ombre sous l'eau. */
  readonly seed = Math.random() * 100;
  time = 0;
  /** Force de son ombre sous l'eau (0 à 1). */
  shadow = 0;
  private frame: ShipFrame;
  private phaseTime = 0;
  private slamTimer = rand(KRAKEN.slam.interval);
  private regroupTime = rand(KRAKEN.regroup);
  /** Bord vers lequel il tire le navire tenu (1 bâbord, -1 tribord), tiré à chaque prise. */
  private pull = 1;
  private cutCount = 0;
  private exposeAt: number = KRAKEN.exposeAfter;
  /** Navires qu'il a lâchés : leur gîte et leur enfoncement s'effacent en douceur. */
  private readonly released = new Set<Ship>();

  constructor(
    target: Ship,
    from: THREE.Vector3,
    tentacleHealth: number,
    private readonly acts: KrakenActs,
  ) {
    this.target = target;
    this.frame = frameOf(target);
    this.position.copy(from).setY(-8);
    this.tentacles = Array.from({ length: KRAKEN.tentacles }, (_, i) => new Tentacle('flail', i % 2 ? 1 : -1, 0, 6, i * 1.37 + Math.random(), tentacleHealth));
    this.head = new KrakenHead(tentacleHealth * KRAKEN.head.health);
    this.parts = [...this.tentacles, this.head];
  }

  /** Il tient un navire (ou surgit autour de lui). */
  get engaged(): boolean {
    return this.phase === 'hold';
  }

  update(dt: number) {
    this.time += dt;
    this.phaseTime += dt;
    const target = this.target;
    if (this.phase === 'approach') this.approach(dt);
    else if (this.phase === 'hold') this.hold(dt);
    else if (this.phase === 'dive' && this.allDown()) this.setPhase('regroup');
    else if (this.phase === 'regroup' && this.phaseTime > this.regroupTime) this.retarget();
    else if (this.phase === 'flee') this.flee(dt);
    this.shadow = THREE.MathUtils.damp(this.shadow, this.phase === 'approach' || this.phase === 'flee' ? 1 : this.phase === 'regroup' ? 0.6 : 0, 2, dt);
    if (target) {
      target.model.root.updateMatrixWorld();
      for (const t of this.tentacles) if (t.rise > 0 || t.up) t.update(dt, this.time, target, this.frame);
      this.updateHead(dt, target);
    }
    this.easeReleased(dt);
  }

  /** Les tentacules et la tête sont sous l'eau. */
  private allDown(): boolean {
    return this.tentacles.every((t) => t.rise === 0) && this.head.rise === 0;
  }

  private setPhase(phase: KrakenPhase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Il nage sous l'eau vers sa proie ; tout près, il surgit. */
  private approach(dt: number) {
    const target = this.target;
    if (!target || !target.alive) return this.retarget();
    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    const d = Math.hypot(dx, dz);
    this.heading = Math.atan2(dx, dz);
    const step = Math.min(d, (KRAKEN.swimSpeed + Math.max(0, target.speed)) * dt);
    this.position.x += (dx / d) * step;
    this.position.z += (dz / d) * step;
    if (d > this.frame.hw + 2) return;
    this.emerge(target);
  }

  /** Il surgit sous `ship` : les tentacules restantes jaillissent, la moitié pour l'enserrer, le reste autour. */
  private emerge(ship: Ship) {
    this.frame = frameOf(ship);
    const left = this.tentacles.filter((t) => !t.cut);
    const grabbers = Math.min(KRAKEN.grabbers, left.length - 1);
    left.forEach((t, i) => {
      t.role = i < grabbers ? 'grab' : 'flail';
      t.side = i % 2 ? 1 : -1;
      const rank = Math.floor(i / 2);
      t.along = t.role === 'grab' ? (rank - (grabbers / 2 - 1) / 2) * 0.55 : (Math.random() * 2 - 1) * 0.8;
      t.out = 4 + Math.random() * 4;
      t.slam = -1;
      t.up = true;
    });
    this.pull = Math.random() < 0.5 ? 1 : -1;
    this.setPhase('hold');
    this.acts.event('grab', ship);
    this.acts.sound('cursed/rise', ship.position, 1.5);
    for (const t of left) {
      ship.model.root.updateMatrixWorld();
      t.update(0, this.time, ship, this.frame);
      const base = t.points[Math.round(N * 0.3)];
      this.acts.burst(base.x, 0, base.z, 1);
    }
  }

  /** Il tient sa proie : prise, dégâts, coups de tentacule ; la tête sort quand il le faut, il fuit s'il est vaincu. */
  private hold(dt: number) {
    const ship = this.target!;
    this.position.set(ship.position.x, -8, ship.position.z);
    if (!ship.alive && ship.sinkTime !== null && ship.sinkTime > 3) return this.dive();
    let gripping = 0;
    let left = 0;
    for (const t of this.tentacles) {
      if (!t.cut) left++;
      if (t.gripping) gripping++;
    }
    const share = gripping / Math.max(1, KRAKEN.grabbers);
    // Il tire le navire vers un bord (il gîte), par à-coups ; le navire est freiné et s'enfonce.
    const g = KRAKEN.grip;
    const tug = this.pull * (1 + 0.35 * Math.sin(this.time * 1.7) + 0.2 * Math.sin(this.time * 4.3));
    this.setGrip(ship, g.hold * share, g.roll * share * tug, g.sink * share, dt);
    if (ship.alive && share > 0) {
      this.acts.damage(ship, g.damage * ship.stats.maxHealth * share * dt);
      if (Math.random() < g.sailChance * share * dt) this.acts.tearSail(ship);
      if (Math.random() < dt * 0.4) this.acts.sound('ambience/hull_creak', ship.position, 1.2);
    }
    this.updateSlams(dt, ship);
    if (this.head.health <= 0 || left < KRAKEN.minTentacles) return this.rout();
    if (!this.head.up && this.cutCount >= this.exposeAt) {
      this.head.up = true;
      this.phaseTime = 0;
      this.acts.event('head', ship);
      this.acts.sound('cursed/rise', ship.position, 2);
    } else if (this.head.up && this.phaseTime > KRAKEN.head.exposed) {
      this.exposeAt = this.cutCount + 1;
      this.dive();
    }
  }

  /** Coups de tentacule : une tentacule libre se dresse, puis s'abat sur le pont (dégâts, matelots à l'eau, secousse). */
  private updateSlams(dt: number, ship: Ship) {
    const s = KRAKEN.slam;
    const impact = s.raise + s.strike;
    for (const t of this.tentacles) {
      if (t.slam < 0 || t.cut) continue;
      if (t.slam < impact && t.slam + dt >= impact && ship.alive) {
        const tip = t.points[N];
        this.acts.damage(ship, s.damage * ship.stats.maxHealth);
        this.acts.knockCrew(ship, s.crew);
        this.acts.shake(ship, s.shake);
        this.acts.burst(tip.x, tip.y, tip.z, 0.8);
        this.acts.sound('combat/ram_crash', tip, 1.4);
      }
    }
    this.slamTimer -= dt;
    if (this.slamTimer > 0) return;
    this.slamTimer = rand(s.interval);
    const free = this.tentacles.filter((t) => t.role === 'flail' && !t.cut && t.rise === 1 && t.slam < 0);
    if (!free.length) return;
    free[Math.floor(Math.random() * free.length)].slam = 0;
  }

  /** La tête : à côté du navire, du bord qui garde le plus de tentacules, tournée vers lui. */
  private updateHead(dt: number, ship: Ship) {
    const side = this.tentacles.reduce((sum, t) => sum + (t.cut ? 0 : t.side), 0) >= 0 ? 1 : -1;
    const across = this.frame.hw + KRAKEN.head.gap;
    const x = ship.position.x + Math.cos(ship.heading) * across * side;
    const z = ship.position.z - Math.sin(ship.heading) * across * side;
    this.head.update(dt, x, z, Math.atan2(ship.position.x - x, ship.position.z - z), this.time);
    this.head.velocityX = ship.velocityX;
    this.head.velocityZ = ship.velocityZ;
  }

  /** Une tentacule a perdu toute sa vie : le bout tranché part, le reste lâche et coule. */
  sever(t: Tentacle, at: THREE.Vector3) {
    const hit = t.segmentAt(at);
    t.cutAt = THREE.MathUtils.clamp(hit < 0 ? Math.round(N / 2) : hit, 3, N - 3);
    t.cut = true;
    t.up = false;
    t.slam = -1;
    const ship = this.target;
    push.subVectors(t.points[t.cutAt], ship ? ship.position : this.position).setY(0).setLength(2 + Math.random() * 2).setY(3 + Math.random() * 2);
    this.pieces.push(new SeveredPiece(t.points, t.cutAt, push));
    this.cutCount++;
    this.acts.sound('combat/mast_crack', at, 1.2);
  }

  /** Il lâche tout et replonge (la tête aussi), avant de se regrouper sous l'eau. */
  private dive() {
    this.regroupTime = rand(KRAKEN.regroup);
    for (const t of this.tentacles) t.up = false;
    this.head.up = false;
    if (this.target) this.released.add(this.target);
    this.setPhase('dive');
    if (this.target) this.acts.sound('cursed/dive', this.target.position, 1.5);
  }

  /** Vaincu : il lâche tout et s'enfuit sous l'eau. */
  private rout() {
    this.dive();
    this.setPhase('flee');
    this.acts.event('flee', this.target);
  }

  /** Il file sous l'eau, loin de sa dernière proie ; au bout d'un moment, il a disparu. */
  private flee(dt: number) {
    if (!this.allDown()) return;
    this.position.x += Math.sin(this.heading + Math.PI) * KRAKEN.fleeSpeed * dt;
    this.position.z += Math.cos(this.heading + Math.PI) * KRAKEN.fleeSpeed * dt;
    if (this.phaseTime > 8) this.setPhase('gone');
  }

  /** Une nouvelle proie à portée (ou la même) : il nage vers elle ; sinon il s'en va. */
  private retarget() {
    const prey = this.acts.prey(this.position.x, this.position.z, KRAKEN.retarget);
    if (!prey) {
      if (this.target) this.released.add(this.target);
      return this.setPhase('gone');
    }
    if (this.target && this.target !== prey) this.released.add(this.target);
    this.target = prey;
    this.frame = frameOf(prey);
    this.released.delete(prey);
    this.setPhase('approach');
  }

  /** Prise sur un navire : ce qu'il vise, atteint en douceur. */
  private setGrip(ship: Ship, hold: number, roll: number, sink: number, dt: number) {
    const k = 1 - Math.exp(-dt * KRAKEN.grip.settle);
    ship.grip.hold += (hold - ship.grip.hold) * k;
    ship.grip.roll += (roll - ship.grip.roll) * k;
    ship.grip.sink += (sink - ship.grip.sink) * k;
  }

  private easeReleased(dt: number) {
    for (const ship of this.released) {
      this.setGrip(ship, 0, 0, 0, dt);
      if (Math.abs(ship.grip.roll) + ship.grip.sink + ship.grip.hold < 1e-3) {
        ship.grip.hold = ship.grip.roll = ship.grip.sink = 0;
        this.released.delete(ship);
      }
    }
  }

  /** Il disparaît du monde : plus rien ne doit rester tenu. */
  release() {
    for (const ship of [...this.released, ...(this.target ? [this.target] : [])]) ship.grip.hold = ship.grip.roll = ship.grip.sink = 0;
    this.released.clear();
  }
}
