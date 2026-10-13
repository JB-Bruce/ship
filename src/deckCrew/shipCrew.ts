import * as THREE from 'three';
import { DECK_CREW } from '../config';
import type { DeckPlan, DeckSpot } from '../ship/deckPlan';
import { GunPosts } from './gunPosts';
import type { Ship } from '../ship/ship';
import { advance, newSailor, poseSailor, type Duty, type Sailor, type ShipMotion } from './sailorMotion';
import { drawSailor } from './sailorPose';
import type { SailorMeshes } from './sailorMeshes';

/** Écart de hauteur au-delà duquel un marin change de pont en passant par en dessous (m). */
const OTHER_DECK = 0.3;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const world = new THREE.Vector3();

/**
 * L'équipage animé d'un navire ponté : barreur, vigie et matelots (DeckPlan.hands). Les matelots flânent sur leur
 * pont ; en combat, ils servent les canons à découvert ; quand la voilure change, deux d'entre eux halent les cordages ;
 * après le combat, deux réparent tant que le navire est abîmé. Moins le navire a de vie, moins il reste de matelots sur
 * le pont : les autres tombent à l'eau sous les coups, et remontent quand il se répare. Quand il sombre, tous sautent.
 */
export class ShipCrew {
  readonly sailors: Sailor[] = [];
  /** Image où le navire a été vu pour la dernière fois (le système oublie les équipages des navires disparus). */
  lastSeen = 0;
  private plan: DeckPlan;
  private readonly guns = new GunPosts();
  private lastHealth: number;
  private lastSail: number;
  private ropeTimer = 0;
  private returnTimer = 0;
  private fallTimer = 0;
  /** Temps restant « en combat » après le dernier tir ou le dernier coup reçu (s). */
  private engaged = 0;
  private readonly motion: ShipMotion;

  constructor(
    private readonly ship: Ship,
    private readonly splash: (x: number, y: number, z: number) => void,
  ) {
    this.plan = ship.model.deckPlan!;
    this.lastHealth = ship.health;
    this.lastSail = ship.controls.sail;
    this.motion = { time: 0, pitch: 0, roll: 0, rudder: 0, reloading: (cannon) => (ship.cannonCooldowns[cannon] ?? 0) > 0.5 };
    this.sailors.push(this.hire('helm', 'tricorn'));
    if (this.plan.lookout) this.sailors.push(this.hire('lookout'));
    this.staff();
    this.layout();
  }

  /** Un marin aux couleurs de son camp (chemise, coiffe). */
  private hire(role: Sailor['role'], hat?: Sailor['hat']): Sailor {
    const faction = this.ship.faction;
    return newSailor(role, new THREE.Color(pick(DECK_CREW.shirts[faction])), hat ?? (Math.random() < DECK_CREW.tricorn[faction] ? 'tricorn' : 'bandana'));
  }

  /** Autant de matelots que le pont en prévoit : un navire allongé en embarque de nouveaux. */
  private staff() {
    let hands = 0;
    for (const s of this.sailors) if (s.role === 'hand') hands++;
    for (; hands < this.plan.hands; hands++) this.sailors.push(this.hire('hand'));
  }

  /** `enemyNear` : un ennemi est à portée de vue (le système le vérifie de temps en temps). */
  update(dt: number, enemyNear: boolean) {
    const ship = this.ship;
    this.motion.time += dt;
    this.motion.pitch = ship.pitch;
    this.motion.roll = ship.roll;
    this.motion.rudder = ship.controls.rudder;
    // Le navire a été reconstruit (allongement) : de nouveaux matelots embarquent, chacun retrouve sa place.
    if (ship.model.deckPlan && ship.model.deckPlan !== this.plan) {
      this.plan = ship.model.deckPlan;
      this.staff();
      this.layout();
    }
    // Canons refaits : les canonniers reprennent leur poste au prochain combat.
    if (this.guns.sync(ship.model, this.plan)) for (const s of this.sailors) if (s.duty === 'gun') s.duty = 'idle';
    this.guns.detectShots(ship.cannonCooldowns, this.onShot);
    const hit = ship.health < this.lastHealth - 0.01;
    this.lastHealth = ship.health;
    this.engaged = hit ? DECK_CREW.combatCalm : Math.max(0, this.engaged - dt);
    const combat = enemyNear || this.engaged > 0;
    if (Math.abs(ship.controls.sail - this.lastSail) > 0.02) {
      this.lastSail = ship.controls.sail;
      this.ropeTimer = DECK_CREW.ropeTime;
    }
    this.ropeTimer -= dt;
    if (!ship.alive) {
      // Il sombre : tout le monde saute à l'eau, chacun à son tour.
      for (const s of this.sailors) if (this.onDeck(s) && Math.random() < dt * 1.5) this.fall(s);
    } else {
      this.manageCount(dt, hit);
      this.assign(combat);
    }
    for (const s of this.sailors) this.step(s, dt);
  }

  draw(meshes: SailorMeshes) {
    const matrix = this.ship.model.root.matrixWorld;
    for (const s of this.sailors) {
      if (s.mode === 'gone' || s.rise <= 0.02) continue;
      poseSailor(s, this.motion);
      drawSailor(meshes, matrix, s.pose, s.shirt, s.hat);
    }
  }

  /** Barreur et vigie à leur poste, matelots répartis sur les promenades. */
  private layout() {
    let k = 0;
    for (const s of this.sailors) {
      if (s.mode === 'gone') continue;
      const spot = s.role === 'helm' ? this.plan.helm : s.role === 'lookout' ? this.plan.lookout : null;
      s.mode = 'act';
      s.rise = 1;
      s.post = -1;
      if (spot) {
        Object.assign(s, { x: spot.x, y: spot.y, z: spot.z, facing: spot.facing, duty: s.role });
        continue;
      }
      s.walk = k++ % Math.max(1, this.plan.walks.length);
      this.toWalkPoint(s);
      s.x = s.tx;
      s.y = s.ty;
      s.z = s.tz;
      s.facing = rand(-Math.PI, Math.PI);
      s.duty = 'idle';
      s.timer = rand(0, DECK_CREW.idle[1]);
    }
  }

  /** Une pièce vient de tirer : le navire est en combat, et son canonnier recule. */
  private readonly onShot = (cannon: number) => {
    this.engaged = DECK_CREW.combatCalm;
    for (const s of this.sailors) if (s.duty === 'gun' && s.post === cannon && s.mode === 'act') s.recoil = 1;
  };

  /** Matelots sur le pont selon la vie du navire : les coups en jettent à l'eau, la réparation les fait remonter. */
  private manageCount(dt: number, hit: boolean) {
    const ship = this.ship;
    const share = DECK_CREW.minCrew + (1 - DECK_CREW.minCrew) * (ship.health / ship.stats.maxHealth);
    const target = Math.max(1, Math.round(this.plan.hands * share));
    let onDeck = 0;
    for (const s of this.sailors) if (s.role === 'hand' && this.onDeck(s)) onDeck++;
    this.fallTimer -= dt;
    this.returnTimer -= dt;
    if (onDeck > target && (hit || this.fallTimer <= 0)) {
      const victim = this.sailors.find((s) => s.role === 'hand' && this.onDeck(s) && s.mode !== 'below');
      if (victim) this.fall(victim);
      this.fallTimer = 0.3;
    } else if (onDeck < target && this.returnTimer <= 0) {
      const back = this.sailors.find((s) => s.role === 'hand' && s.mode === 'gone');
      if (back) {
        this.toWalkPoint(back);
        Object.assign(back, { x: back.tx, y: back.ty, z: back.tz, mode: 'rise', rise: 0, duty: 'idle', post: -1, leaving: false, spin: 0 });
      }
      this.returnTimer = DECK_CREW.returnDelay;
    }
  }

  /** Répartit les tâches : canons en combat, cordages pendant une manœuvre, réparation après le combat. */
  private assign(combat: boolean) {
    const ship = this.ship;
    const repairing = !combat && ship.health < ship.stats.maxHealth - 1;
    for (const s of this.sailors) {
      if (s.role !== 'hand' || !this.onDeck(s)) continue;
      // Fin d'une tâche : retour à la promenade.
      const over =
        ((s.duty === 'gun' || s.duty === 'brace') && !combat) || (s.duty === 'rope' && (combat || this.ropeTimer <= 0)) || (s.duty === 'repair' && !repairing);
      if (over) this.toIdle(s);
    }
    if (combat) {
      for (const g of this.guns.posts) if (!this.manned('gun', g.cannon)) this.send(g.spot, 'gun', g.cannon, true);
      // Les autres se mettent à couvert là où ils sont, tournés vers le large.
      for (const s of this.sailors) {
        if (s.role !== 'hand' || (s.duty !== 'idle' && s.duty !== 'look') || s.mode !== 'act') continue;
        s.duty = 'brace';
        s.facing = (Math.sign(s.x) || 1) * (Math.PI / 2);
      }
    } else if (this.ropeTimer > 0) {
      const ropes = this.plan.ropes;
      for (let i = 0; i < ropes.length && this.count('rope') < DECK_CREW.ropeHands; i++) if (!this.manned('rope', i)) this.send(ropes[i], 'rope', i, true);
    } else if (repairing) {
      let busy = this.count('repair');
      for (const s of this.sailors) {
        if (busy >= DECK_CREW.repairHands) break;
        if (s.role !== 'hand' || s.duty !== 'idle' || s.mode !== 'act' || !this.onDeck(s)) continue;
        this.toWalkPoint(s);
        this.go(s, 'repair', -1, false);
        busy++;
      }
    }
  }

  private count(duty: Duty): number {
    let n = 0;
    for (const s of this.sailors) if (s.duty === duty && this.onDeck(s)) n++;
    return n;
  }

  /** Un matelot tient-il (ou rejoint-il) ce poste ? */
  private manned(duty: Duty, post: number): boolean {
    for (const s of this.sailors) if (s.duty === duty && s.post === post && this.onDeck(s)) return true;
    return false;
  }

  /** Envoie le matelot libre le plus proche à un poste. */
  private send(spot: DeckSpot, duty: Duty, post: number, run: boolean) {
    let best: Sailor | null = null;
    let bestDistance = Infinity;
    for (const s of this.sailors) {
      if (s.role !== 'hand' || !this.onDeck(s) || (s.duty !== 'idle' && s.duty !== 'look' && s.duty !== 'brace')) continue;
      const d = Math.hypot(s.x - spot.x, (s.y - spot.y) * 4, s.z - spot.z);
      if (d < bestDistance) {
        best = s;
        bestDistance = d;
      }
    }
    if (!best) return;
    Object.assign(best, { tx: spot.x, ty: spot.y, tz: spot.z, tf: spot.facing });
    this.go(best, duty, post, run);
  }

  /** Vers la cible (tx, ty, tz) : à pied sur le même pont, sinon par en dessous. */
  private go(s: Sailor, duty: Duty, post: number, run: boolean) {
    s.duty = duty;
    s.post = post;
    s.run = run;
    s.mode = Math.abs(s.ty - s.y) > OTHER_DECK ? 'below' : 'move';
  }

  private toIdle(s: Sailor) {
    s.post = -1;
    s.recoil = 0;
    this.toWalkPoint(s);
    this.go(s, 'idle', -1, false);
    s.timer = rand(DECK_CREW.idle[0], DECK_CREW.idle[1]);
  }

  /** Un point au hasard sur sa promenade, comme cible. */
  private toWalkPoint(s: Sailor) {
    const w = this.plan.walks[s.walk];
    if (!w) return;
    const t = Math.random();
    s.tx = w.ax + (w.bx - w.ax) * t;
    s.ty = w.y;
    s.tz = w.az + (w.bz - w.az) * t;
    s.tf = Math.sign(s.tx) * (Math.PI / 2) || rand(-Math.PI, Math.PI);
  }

  private onDeck(s: Sailor): boolean {
    return s.mode !== 'gone' && s.mode !== 'fall' && !s.leaving;
  }

  /** Projeté par-dessus bord, du côté où il se trouve. */
  private fall(s: Sailor) {
    const side = Math.sign(s.x) || (Math.random() < 0.5 ? 1 : -1);
    Object.assign(s, { mode: 'fall', duty: 'idle', post: -1, vx: side * rand(1.8, 2.6), vy: rand(2, 3), vz: rand(-0.6, 0.6), spin: 0, rise: 1 });
  }

  private step(s: Sailor, dt: number) {
    if (advance(s, dt)) {
      // Il touche l'eau : gerbe à l'endroit de sa chute.
      world.set(s.x, 0, s.z).applyMatrix4(this.ship.model.root.matrixWorld);
      this.splash(world.x, world.y, world.z);
    }
    if (s.mode !== 'act') return;
    if (s.duty === 'idle' || s.duty === 'look') this.wander(s, dt);
    else if (s.duty === 'gun' || s.duty === 'rope') s.facing = s.tf;
  }

  /** Flânerie : promenade, regard vers la mer contre le pavois, ou simple pause. */
  private wander(s: Sailor, dt: number) {
    s.timer -= dt;
    if (s.timer > 0) return;
    s.timer = rand(DECK_CREW.idle[0], DECK_CREW.idle[1]);
    const roll = Math.random();
    if (roll < 0.55) {
      this.toWalkPoint(s);
      this.go(s, 'idle', -1, false);
    } else if (roll < 0.85) {
      s.duty = 'look';
      s.facing = (Math.sign(s.x) || 1) * (Math.PI / 2);
    } else {
      s.duty = 'idle';
      s.facing = rand(-Math.PI, Math.PI);
    }
  }
}
