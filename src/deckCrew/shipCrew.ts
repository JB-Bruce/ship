import * as THREE from 'three';
import { DECK_CREW } from '../config';
import type { DeckPlan, DeckSpot } from '../ship/deckPlan';
import type { Ship } from '../ship/ship';
import { CrewActivities, isLeisure } from './crewActivities';
import { coverNear, markGuns } from './crewSpots';
import { deckNavOf, type DeckNav } from './deckNav';
import type { MastTop } from './mastTops';
import { nodeCount } from './deckPath';
import { GunPosts } from './gunPosts';
import { advance, newSailor, type Duty, type Perch, type Sailor, type ShipMotion } from './sailorMotion';
import { drawSailor } from './sailorPose';
import { poseSailor } from './sailorPoses';
import type { SailorMeshes } from './sailorMeshes';
import { SailorWalker } from './sailorWalk';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const world = new THREE.Vector3();

/**
 * L'équipage animé d'un navire ponté : barreur, vigie (dans la hune du plus grand mât, s'il y en a une : le nid de pie) et
 * matelots (DeckPlan.hands). Ils marchent sur le pont réel du
 * navire (DeckNav : escaliers, échelles, obstacles) en s'évitant ; au calme, chacun enchaîne des occupations
 * (CrewActivities) ; en combat, ils courent servir les canons à découvert et les autres se mettent à couvert contre le
 * pavois ; quand la voilure change, deux d'entre eux halent les cordages ; après le combat, deux réparent tant que le
 * navire est abîmé. Moins le navire a de vie, moins il reste de matelots sur le pont : les autres tombent à l'eau sous
 * les coups, et remontent quand il se répare. Quand il sombre, tous sautent.
 */
export class ShipCrew {
  readonly sailors: Sailor[] = [];
  /** Image où le navire a été vu pour la dernière fois (le système oublie les équipages des navires disparus). */
  lastSeen = 0;
  /** Le joueur à pied sur ce pont (repère du navire), dont les marins s'écartent ; null s'il n'y est pas. */
  player: THREE.Vector3 | null = null;
  private plan: DeckPlan;
  private nav: DeckNav;
  private walker: SailorWalker;
  private activities: CrewActivities;
  /** Nœuds occupés par les affûts (on les contourne). */
  private avoid: Uint8Array;
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
    this.nav = deckNavOf(ship.model, this.plan);
    this.walker = new SailorWalker(this.nav);
    this.activities = this.newActivities();
    this.avoid = new Uint8Array(nodeCount(this.nav));
    this.lastHealth = ship.health;
    this.lastSail = ship.controls.sail;
    this.motion = { time: 0, pitch: 0, roll: 0, rudder: 0, reloading: (cannon) => (ship.cannonCooldowns[cannon] ?? 0) > 0.5 };
    this.sailors.push(this.hire('helm', 'tricorn'));
    if (this.plan.lookout) this.sailors.push(this.hire('lookout'));
    this.staff();
    this.layout();
  }

  private newActivities() {
    return new CrewActivities(this.nav, this.walker, this.plan, this.sailors, { go: (s, x, y, z, f, duty, run) => this.go(s, x, y, z, f, duty, run) });
  }

  /** Un marin aux couleurs de son camp (chemise, coiffe), à son pas. */
  private hire(role: Sailor['role'], hat?: Sailor['hat']): Sailor {
    const faction = this.ship.crewColors;
    const hatOf = hat ?? (Math.random() < DECK_CREW.tricorn[faction] ? 'tricorn' : 'bandana');
    return newSailor(role, new THREE.Color(pick(DECK_CREW.shirts[faction])), hatOf, rand(DECK_CREW.walk.pace[0], DECK_CREW.walk.pace[1]));
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
    // Le navire a été reconstruit (allongement) : nouveau pont, de nouveaux matelots embarquent, chacun retrouve sa place.
    if (ship.model.deckPlan && ship.model.deckPlan !== this.plan) {
      this.plan = ship.model.deckPlan;
      this.nav = deckNavOf(ship.model, this.plan);
      this.walker = new SailorWalker(this.nav);
      this.activities = this.newActivities();
      this.avoid = new Uint8Array(nodeCount(this.nav));
      this.guns.reset();
      this.staff();
      this.layout();
    }
    // Canons refaits : les canonniers reprennent leur poste au prochain combat.
    if (this.guns.sync(ship.model, this.plan)) {
      markGuns(this.nav, ship.model.cannons, this.avoid);
      for (const s of this.sailors) if (s.duty === 'gun') s.duty = 'idle';
    }
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
      // Ceux qui sont dans une hune y restent.
      for (const s of this.sailors) if (this.onDeck(s) && s.mode !== 'climb' && !this.inTop(s) && Math.random() < dt * 1.5) this.fall(s);
    } else {
      this.manageCount(dt, hit);
      this.assign(combat);
      if (!combat) this.activities.update(dt);
    }
    for (const s of this.sailors) this.step(s, dt);
  }

  /** `noHelm` : le barreur n'est pas dessiné (la caméra est à sa place). */
  draw(meshes: SailorMeshes, noHelm = false) {
    const matrix = this.ship.model.root.matrixWorld;
    for (const s of this.sailors) {
      if (s.mode === 'gone' || s.rise <= 0.02 || (noHelm && s.role === 'helm')) continue;
      poseSailor(s, this.motion);
      drawSailor(meshes, matrix, s.pose, s.shirt, s.hat);
    }
  }

  /** Barreur et vigie à leur poste, matelots répartis sur le pont (chacun près de sa promenade d'attache). */
  private layout() {
    let k = 0;
    for (const s of this.sailors) {
      if (s.mode === 'gone') continue;
      const perch = s.role === 'lookout' ? this.lookoutPerch() : null;
      const spot = s.role === 'helm' ? this.plan.helm : perch ? perch.top.spots[perch.spot] : s.role === 'lookout' ? this.plan.lookout : null;
      Object.assign(s, { mode: 'act', rise: 1, post: -1, shroud: null, perch, group: -1, path: [], wx: 0, wz: 0 });
      if (spot) {
        Object.assign(s, { x: spot.x, y: spot.y, z: spot.z, facing: spot.facing, tf: spot.facing, duty: s.role });
        continue;
      }
      s.walk = k++ % Math.max(1, this.plan.walks.length);
      this.placeOnWalk(s);
      s.duty = 'idle';
      s.timer = rand(0, DECK_CREW.activities.idle[1]);
    }
  }

  /** La vigie se tient dans la hune du plus grand mât (le nid de pie), s'il y en a une ; sinon à son poste du pont. */
  private lookoutPerch(): Perch | null {
    let top: MastTop | null = null;
    for (const t of this.nav.tops) if (!top || t.mastHead > top.mastHead) top = t;
    return top ? { top, spot: 0, route: null } : null;
  }

  /** Debout dans une hune (la vigie, ou un matelot monté là-haut). */
  private inTop(s: Sailor): boolean {
    return s.perch !== null && (s.role === 'lookout' || s.post === 1);
  }

  /** Pose le matelot sur un nœud libre près d'un point de sa promenade. */
  private placeOnWalk(s: Sailor) {
    const w = this.plan.walks[s.walk];
    const t = Math.random();
    const node = w ? this.nav.nearestWalkable(w.ax + (w.bx - w.ax) * t, w.y, w.az + (w.bz - w.az) * t) : -1;
    if (node >= 0) Object.assign(s, { x: this.nav.x(node), y: this.nav.y(node), z: this.nav.z(node) });
    else if (w) Object.assign(s, { x: w.ax, y: w.y, z: w.az });
    s.facing = s.tf = rand(-Math.PI, Math.PI);
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
      const victim = this.sailors.find((s) => s.role === 'hand' && this.onDeck(s) && s.mode !== 'below' && s.mode !== 'climb' && !this.inTop(s));
      if (victim) this.fall(victim);
      this.fallTimer = 0.3;
    } else if (onDeck < target && this.returnTimer <= 0) {
      const back = this.sailors.find((s) => s.role === 'hand' && s.mode === 'gone');
      if (back) {
        this.placeOnWalk(back);
        Object.assign(back, { tx: back.x, ty: back.y, tz: back.z, mode: 'rise', rise: 0, duty: 'idle', post: -1, leaving: false, spin: 0, shroud: null, perch: null, group: -1 });
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
      // Fin d'une tâche : retour au temps calme.
      const over =
        ((s.duty === 'gun' || s.duty === 'brace') && !combat) || (s.duty === 'rope' && (combat || this.ropeTimer <= 0)) || (s.duty === 'repair' && !repairing);
      if (over) this.toIdle(s);
      // En combat, ceux qui sont dans les haubans redescendent, les groupes se défont.
      if (combat && (s.shroud || s.group >= 0)) this.activities.release(s);
    }
    if (combat) {
      for (const g of this.guns.posts) if (!this.manned('gun', g.cannon)) this.send(g.spot, 'gun', g.cannon, true);
      // Les autres courent se mettre à couvert contre le pavois le plus proche, tournés vers le large.
      for (const s of this.sailors) if (s.role === 'hand' && this.free(s) && s.duty !== 'brace' && s.mode === 'act') this.takeCover(s);
    } else if (this.ropeTimer > 0) {
      const ropes = this.plan.ropes;
      for (let i = 0; i < ropes.length && this.count('rope') < DECK_CREW.ropeHands; i++) if (!this.manned('rope', i)) this.send(ropes[i], 'rope', i, true);
    } else if (repairing) {
      let busy = this.count('repair');
      for (const s of this.sailors) {
        if (busy >= DECK_CREW.repairHands) break;
        if (s.role !== 'hand' || !isLeisure(s) || s.mode !== 'act' || !this.onDeck(s)) continue;
        this.activities.release(s);
        this.activities.stroll(s);
        s.duty = 'repair';
        busy++;
      }
    }
  }

  /** Libre pour une tâche : au temps calme (pas dans les haubans) ou à couvert. */
  private free(s: Sailor) {
    return this.onDeck(s) && (isLeisure(s) || s.duty === 'brace');
  }

  /** Court se mettre à couvert contre le pavois le plus proche (une place par matelot), tourné vers le large. */
  private takeCover(s: Sailor) {
    const nav = this.nav;
    const taken = (node: number) => this.sailors.some((o) => o !== s && o.duty === 'brace' && Math.hypot(o.tx - nav.x(node), o.tz - nav.z(node)) < DECK_CREW.activities.spotClearance);
    const best = coverNear(nav, s.x, s.y, s.z, taken);
    const side = best >= 0 ? Math.sign(nav.x(best)) || 1 : Math.sign(s.x) || 1;
    if (best >= 0) this.go(s, nav.x(best), nav.y(best), nav.z(best), (side * Math.PI) / 2, 'brace', true);
    else {
      s.duty = 'brace';
      s.tf = (side * Math.PI) / 2;
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
      if (s.role !== 'hand' || !this.free(s) || (s.mode !== 'act' && s.mode !== 'move')) continue;
      const d = Math.hypot(s.x - spot.x, (s.y - spot.y) * 4, s.z - spot.z);
      if (d < bestDistance) {
        best = s;
        bestDistance = d;
      }
    }
    if (!best) return;
    this.activities.release(best);
    this.go(best, spot.x, spot.y, spot.z, spot.facing, duty, run);
    best.post = post;
  }

  /** Vers (x, y, z) par le pont ; faute de chemin (autre partie du pont), par en dessous. */
  private go(s: Sailor, x: number, y: number, z: number, facing: number, duty: Duty, run: boolean) {
    s.duty = duty;
    s.post = -1;
    if (this.walker.goTo(s, x, y, z, facing, run, this.avoid)) return;
    if (Math.hypot(s.x - x, s.z - z) < 0.3 && Math.abs(s.y - y) < 0.3) {
      s.mode = 'act';
      return;
    }
    s.mode = 'below';
  }

  private toIdle(s: Sailor) {
    s.post = -1;
    s.recoil = 0;
    this.activities.stroll(s);
  }

  private onDeck(s: Sailor): boolean {
    return s.mode !== 'gone' && s.mode !== 'fall' && !s.leaving;
  }

  /** Projeté par-dessus bord, du côté où il se trouve. */
  private fall(s: Sailor) {
    const side = Math.sign(s.x) || (Math.random() < 0.5 ? 1 : -1);
    if (s.group >= 0) this.activities.release(s);
    Object.assign(s, { mode: 'fall', duty: 'idle', post: -1, shroud: null, perch: null, vx: side * rand(1.8, 2.6), vy: rand(2, 3), vz: rand(-0.6, 0.6), spin: 0, rise: 1 });
  }

  private step(s: Sailor, dt: number) {
    if (advance(s, dt)) {
      // Il touche l'eau : gerbe à l'endroit de sa chute.
      world.set(s.x, 0, s.z).applyMatrix4(this.ship.model.root.matrixWorld);
      this.splash(world.x, world.y, world.z);
    }
    if (s.role === 'hand') this.walker.step(s, dt, this.sailors, this.avoid, this.player);
  }
}
