import { DECK_CREW } from '../config';
import type { DeckPlan } from '../ship/deckPlan';
import type { DeckNav } from './deckNav';
import type { Duty, Sailor } from './sailorMotion';
import type { SailorWalker } from './sailorWalk';

const { activities: A } = DECK_CREW;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const between = (range: readonly [number, number]) => rand(range[0], range[1]);

/** Occupations du temps calme (le matelot est libre pour une tâche : canons, cordages, réparation). */
const LEISURE: readonly Duty[] = ['idle', 'look', 'chat', 'swab', 'coil', 'sit'];
export const isLeisure = (s: Sailor) => LEISURE.includes(s.duty) && s.shroud === null;

/** Ce que les occupations demandent à l'équipage : l'envoyer quelque part (ou par en dessous, faute de chemin). */
export interface CrewMoves {
  go(s: Sailor, x: number, y: number, z: number, facing: number, duty: Duty, run: boolean): void;
}

/**
 * Le temps calme d'un équipage : chaque matelot libre enchaîne des occupations tirées au hasard (selon
 * DECK_CREW.activities) : flâner, s'accouder au pavois, discuter à deux ou trois, laver le pont, lover un cordage,
 * s'asseoir contre le pavois, grimper dans les haubans. Chacune dure un moment, puis il passe à une autre.
 */
export class CrewActivities {
  private nextGroup = 0;

  constructor(
    private readonly nav: DeckNav,
    private readonly walker: SailorWalker,
    private readonly plan: DeckPlan,
    private readonly sailors: Sailor[],
    private readonly moves: CrewMoves,
  ) {}

  /** Fait vivre les matelots libres (temps calme). */
  update(dt: number) {
    for (const s of this.sailors) {
      if (s.role !== 'hand' || s.leaving) continue;
      if (s.shroud) this.aloft(s, dt);
      else if (isLeisure(s) && s.mode === 'act') {
        s.timer -= dt;
        if (s.duty === 'swab') this.swab(s, dt);
        if (s.timer <= 0) this.next(s);
      }
    }
  }

  /** Fin de l'occupation : il quitte son groupe ; dans les haubans, il redescend d'abord. */
  release(s: Sailor) {
    if (s.group >= 0) this.endGroup(s.group);
    if (!s.shroud) return;
    if (s.post === 0) {
      s.shroud = null;
      s.post = -1;
    } else if (s.post === 1 && s.mode === 'act') this.climbDown(s);
  }

  /** Une nouvelle occupation, tirée au hasard selon les poids. */
  next(s: Sailor) {
    if (s.group >= 0) this.endGroup(s.group);
    const w = A.weights;
    let roll = Math.random() * (w.stroll + w.rail + w.chat + w.swab + w.coil + w.sit + w.shroud);
    if ((roll -= w.stroll) < 0) return this.stroll(s);
    if ((roll -= w.rail) < 0) return this.rail(s, 'look') || this.stroll(s);
    if ((roll -= w.chat) < 0) return this.chat(s) || this.stroll(s);
    if ((roll -= w.swab) < 0) return this.startSwab(s) || this.stroll(s);
    if ((roll -= w.coil) < 0) return this.coil(s) || this.stroll(s);
    if ((roll -= w.sit) < 0) return this.rail(s, 'sit') || this.stroll(s);
    return this.climbUp(s) || this.stroll(s);
  }

  /** Flâner : quelques pas vers un point de sa partie du pont, puis une pause. */
  stroll(s: Sailor): true {
    const node = this.nodeNear(s, A.strollRange);
    if (node >= 0) this.moves.go(s, this.nav.x(node), this.nav.y(node), this.nav.z(node), s.facing + rand(-1.5, 1.5), 'idle', false);
    s.timer = between(A.idle);
    return true;
  }

  /** Accoudé au pavois (`look`, tourné vers le large) ou assis contre lui (`sit`, tourné vers le pont). */
  private rail(s: Sailor, duty: 'look' | 'sit'): boolean {
    const nav = this.nav;
    const part = this.partOf(s);
    for (let tries = 0; tries < A.tries; tries++) {
      const r = nav.rails[Math.floor(Math.random() * nav.rails.length)];
      if (!r || nav.part[r.node] !== part || this.distance(s, r.node) > A.railRange || this.taken(nav.x(r.node), nav.z(r.node), s)) continue;
      const facing = ((duty === 'look' ? r.side : -r.side) * Math.PI) / 2;
      this.moves.go(s, nav.x(r.node), nav.y(r.node), nav.z(r.node), facing, duty, false);
      s.timer = between(duty === 'look' ? A.look : A.sit);
      return true;
    }
    return false;
  }

  /** Discuter : il rejoint un ou deux matelots libres tout proches, en cercle, tournés les uns vers les autres. */
  private chat(s: Sailor): boolean {
    const partners = this.sailors.filter(
      (o) => o !== s && o.role === 'hand' && o.mode === 'act' && (o.duty === 'idle' || o.duty === 'look') && o.group < 0 && !o.leaving && Math.hypot(o.x - s.x, o.z - s.z) < A.chatRange && Math.abs(o.y - s.y) < 0.5,
    );
    if (!partners.length) return false;
    const members = [s, ...partners.slice(0, Math.random() < 0.5 ? 1 : 2)];
    const center = this.nav.nearestWalkable((s.x + members[1].x) / 2, s.y, (s.z + members[1].z) / 2);
    if (center < 0) return false;
    const cx = this.nav.x(center);
    const cz = this.nav.z(center);
    const id = this.nextGroup++;
    const time = between(A.chat);
    const start = Math.random() * Math.PI * 2;
    members.forEach((m, k) => {
      const angle = start + (k * Math.PI * 2) / members.length;
      const x = cx + Math.sin(angle) * A.chatRadius;
      const z = cz + Math.cos(angle) * A.chatRadius;
      this.moves.go(m, x, this.nav.y(center), z, angle + Math.PI, 'chat', false);
      m.group = id;
      m.timer = time + rand(0, 1);
    });
    return true;
  }

  private endGroup(id: number) {
    for (const m of this.sailors) {
      if (m.group !== id) continue;
      m.group = -1;
      if (m.duty === 'chat') {
        m.duty = 'idle';
        m.timer = between(A.afterChat);
      }
    }
  }

  /** Laver le pont : à genoux, il frotte, puis se déplace d'un pas et recommence. */
  private startSwab(s: Sailor): boolean {
    if (this.count('swab') >= A.maxSwabbers) return false;
    const node = this.nodeNear(s, A.strollRange);
    if (node < 0) return false;
    this.moves.go(s, this.nav.x(node), this.nav.y(node), this.nav.z(node), rand(-Math.PI, Math.PI), 'swab', false);
    s.timer = between(A.swab);
    s.beat = between(A.swabShift);
    return true;
  }

  private swab(s: Sailor, dt: number) {
    s.beat -= dt;
    if (s.beat > 0) return;
    s.beat = between(A.swabShift);
    const node = this.nodeNear(s, A.swabStep);
    if (node >= 0 && this.walker.goTo(s, this.nav.x(node), this.nav.y(node), this.nav.z(node), s.facing + rand(-0.6, 0.6), false, null)) s.duty = 'swab';
  }

  /** Lover un cordage, au pied d'un mât. */
  private coil(s: Sailor): boolean {
    const free = this.plan.ropes.filter((r) => !this.taken(r.x, r.z, s));
    if (!free.length) return false;
    const r = free[Math.floor(Math.random() * free.length)];
    this.moves.go(s, r.x, r.y, r.z, r.facing + Math.PI, 'coil', false);
    s.timer = between(A.coil);
    return true;
  }

  /** Grimper dans un hauban libre : il y va, monte, reste un moment à regarder le large, redescend. */
  private climbUp(s: Sailor): boolean {
    const nav = this.nav;
    const busy = new Set(this.sailors.map((o) => o.shroud));
    if (busy.size - (busy.has(null) ? 1 : 0) >= A.maxAloft) return false;
    const options = nav.shrouds.filter((h) => !busy.has(h) && nav.part[h.node] === this.partOf(s));
    if (!options.length) return false;
    const h = options[Math.floor(Math.random() * options.length)];
    this.moves.go(s, nav.x(h.node), nav.y(h.node), nav.z(h.node), (h.side * Math.PI) / 2, 'idle', false);
    s.shroud = h;
    s.post = 0;
    s.timer = between(A.aloft);
    return true;
  }

  /** Étapes dans les haubans : post 0 = il y va, 1 = là-haut, 2 = il redescend. */
  private aloft(s: Sailor, dt: number) {
    const h = s.shroud!;
    if (s.mode !== 'act') return;
    if (s.post === 0) {
      const t = rand(A.aloftHeight[0], A.aloftHeight[1]);
      const up = [h.foot.x, h.foot.y + 0.1, h.foot.z, h.foot.x + (h.head.x - h.foot.x) * t, h.foot.y + (h.head.y - h.foot.y) * t, h.foot.z + (h.head.z - h.foot.z) * t];
      this.walker.startClimb(s, up, 'act');
      s.duty = 'aloft';
      s.post = 1;
    } else if (s.post === 1) {
      s.timer -= dt;
      if (s.timer <= 0) this.climbDown(s);
    } else {
      s.shroud = null;
      s.post = -1;
      s.duty = 'idle';
      s.timer = between(A.afterChat);
    }
  }

  private climbDown(s: Sailor) {
    const h = s.shroud!;
    const nav = this.nav;
    this.walker.startClimb(s, [h.foot.x, h.foot.y + 0.1, h.foot.z, nav.x(h.node), nav.y(h.node), nav.z(h.node)], 'act');
    s.post = 2;
  }

  // ——— Outils ———

  private partOf(s: Sailor): number {
    const n = this.walker.nodeOf(s);
    return n >= 0 ? this.nav.part[n] : -1;
  }

  /** Un nœud au hasard de sa partie du pont, à moins de `range` m, loin des bords, de préférence vers sa promenade. */
  private nodeNear(s: Sailor, range: number): number {
    const nav = this.nav;
    const part = this.partOf(s);
    const list = part >= 0 ? nav.nodes[part] : null;
    if (!list) return -1;
    const w = this.plan.walks[s.walk];
    for (let tries = 0; tries < A.tries; tries++) {
      const n = list[Math.floor(Math.random() * list.length)];
      if (nav.edge[n] || this.distance(s, n) > range) continue;
      // Sa promenade d'attache garde l'équipage réparti entre les ponts.
      if (w && Math.abs(nav.y(n) - w.y) > 0.5 && Math.random() < A.homeBias) continue;
      return n;
    }
    return -1;
  }

  private distance(s: Sailor, node: number) {
    return Math.hypot(this.nav.x(node) - s.x, this.nav.z(node) - s.z);
  }

  /** Un autre matelot est-il déjà là (ou en route) ? */
  private taken(x: number, z: number, s: Sailor): boolean {
    return this.sailors.some((o) => o !== s && o.mode !== 'gone' && Math.hypot((o.mode === 'move' ? o.tx : o.x) - x, (o.mode === 'move' ? o.tz : o.z) - z) < A.spotClearance);
  }

  private count(duty: Duty): number {
    let n = 0;
    for (const o of this.sailors) if (o.duty === duty && o.mode !== 'gone') n++;
    return n;
  }
}
