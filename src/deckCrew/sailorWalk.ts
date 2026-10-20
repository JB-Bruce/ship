import { DECK_CREW } from '../config';
import type { DeckNav } from './deckNav';
import { turnToward, type Sailor } from './sailorMotion';

const { walk } = DECK_CREW;

/** Un point du repère du navire. */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Le marin est-il sur le pont, debout et visible des autres (pour s'écarter de lui) ? */
const present = (o: Sailor) => o.mode === 'act' || o.mode === 'move';

/**
 * Déplacements d'un marin sur le pont : chemin trouvé sur la grille du navire (escaliers et échelles compris), suivi
 * en douceur (il accélère, ralentit à l'arrivée, tourne progressivement), en s'écartant des autres marins (et en se
 * rangeant sur sa droite face à quelqu'un qui vient en sens inverse). Bloqué trop longtemps, il cherche un autre
 * chemin. Il grimpe aux échelles et aux haubans en ligne droite.
 */
export class SailorWalker {
  constructor(private readonly nav: DeckNav) {}

  /**
   * Envoie le marin vers (x, y, z), à regarder vers `facing` à l'arrivée. Renvoie false s'il n'y a pas de chemin
   * (autre partie du pont) : l'appelant le fait alors passer par en dessous.
   */
  goTo(s: Sailor, x: number, y: number, z: number, facing: number, run: boolean, avoid: Uint8Array | null): boolean {
    const nav = this.nav;
    const start = this.nodeOf(s);
    const goal = nav.nearestWalkable(x, y, z);
    const path = start >= 0 && goal >= 0 ? nav.paths.find(start, goal, avoid) : null;
    Object.assign(s, { tx: x, ty: y, tz: z, tf: facing, run });
    if (!path) return false;
    s.path = path;
    s.step = 0;
    s.stuck = 0;
    s.retries = 0;
    s.mode = 'move';
    return true;
  }

  /** Le nœud où il se tient (ou le plus proche). */
  nodeOf(s: Sailor): number {
    const here = this.nav.nodeAt(s.x, s.z, s.y);
    return here >= 0 ? here : this.nav.nearestWalkable(s.x, s.y, s.z);
  }

  /** Grimpe en passant par ces points (x, y, z à la suite), puis reprend son chemin ou s'arrête (`then`). */
  startClimb(s: Sailor, points: number[], then: 'path' | 'act') {
    s.climb = points;
    s.climbStep = 0;
    s.climbThen = then;
    s.mode = 'climb';
    s.wx = s.wz = 0;
  }

  /** Un pas de marche ou d'escalade. `crew` : tout l'équipage (pour s'écarter des autres) ; `player` : le joueur à pied. */
  step(s: Sailor, dt: number, crew: readonly Sailor[], avoid: Uint8Array | null, player: Vec3 | null = null) {
    if (s.mode === 'climb') this.climbStep(s, dt);
    else if (s.mode === 'move') this.walkStep(s, dt, crew, avoid, player);
    else if (s.mode === 'act') s.facing = turnToward(s.facing, s.tf, walk.turnRate * dt);
  }

  private walkStep(s: Sailor, dt: number, crew: readonly Sailor[], avoid: Uint8Array | null, player: Vec3 | null) {
    const nav = this.nav;
    const last = s.step >= s.path.length;
    const node = last ? -1 : s.path[s.step];
    const gx = last ? s.tx : nav.x(node);
    const gz = last ? s.tz : nav.z(node);
    // Hauteur visée pour choisir la surface sous ses pieds : un peu vers celle du prochain nœud (au pied d'un
    // escalier, la marche plutôt que le pont dessous).
    const gy = last ? s.ty : nav.y(node);
    const hint = s.y + Math.max(-walk.climbHint, Math.min(walk.climbHint, gy - s.y));
    const dx = gx - s.x;
    const dz = gz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < (last ? walk.arrive : walk.waypoint)) {
      if (last) return this.arrive(s);
      s.step++;
      // Le prochain nœud est l'autre bout d'une échelle : il y grimpe.
      const next = s.path[s.step];
      if (next !== undefined && nav.ladders.get(node) === next) this.startClimb(s, [nav.x(node), nav.y(node), nav.z(node), nav.x(next), nav.y(next), nav.z(next)], 'path');
      return;
    }
    const speed = (s.run ? DECK_CREW.runSpeed : DECK_CREW.walkSpeed) * s.pace * (last ? Math.min(1, d / walk.slowRadius + 0.25) : 1);
    let ax = (dx / d) * speed;
    let az = (dz / d) * speed;
    // S'écarter des autres ; face à un marin qui vient en sens inverse, se ranger sur sa droite.
    for (const o of crew) {
      if (o === s || !present(o) || Math.abs(o.y - s.y) > walk.otherDeck) continue;
      const ox = s.x - o.x;
      const oz = s.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od > walk.personal || od < 1e-4) continue;
      const push = ((walk.personal - od) / walk.personal) * walk.separation * (o.mode === 'act' ? walk.standingFactor : 1);
      ax += (ox / od) * push;
      az += (oz / od) * push;
      if (o.mode === 'move' && o.wx * s.wx + o.wz * s.wz < 0) {
        ax += (dz / d) * -walk.keepRight;
        az += (dx / d) * walk.keepRight;
      }
    }
    // Le joueur à pied : un marin arrêté, qu'on contourne un peu plus largement.
    if (player && Math.abs(player.y - s.y) <= walk.otherDeck) {
      const ox = s.x - player.x;
      const oz = s.z - player.z;
      const od = Math.hypot(ox, oz);
      const room = walk.personal * walk.playerRoom;
      if (od < room && od > 1e-4) {
        const push = ((room - od) / room) * walk.separation * walk.standingFactor;
        ax += (ox / od) * push;
        az += (oz / od) * push;
      }
    }
    const k = Math.min(1, walk.accel * dt);
    s.wx += (ax - s.wx) * k;
    s.wz += (az - s.wz) * k;
    const nx = s.x + s.wx * dt;
    const nz = s.z + s.wz * dt;
    const x0 = s.x;
    const z0 = s.z;
    // Pas hors du pont praticable (sauf tout près de sa cible : un poste derrière un canon, contre le pavois). Les affûts
    // ne gênent que le choix du chemin : on peut les frôler.
    const near = last && d < walk.finalReach;
    if (near || this.walkable(nx, nz, hint)) {
      s.x = nx;
      s.z = nz;
    } else if (this.walkable(nx, s.z, hint)) s.x = nx;
    else if (this.walkable(s.x, nz, hint)) s.z = nz;
    // Ce qui compte, c'est le chemin vraiment fait : contre un coin, la vitesse retombe et il cherche un autre chemin.
    const moved = Math.hypot(s.x - x0, s.z - z0) / Math.max(dt, 1e-4);
    if (moved < Math.hypot(s.wx, s.wz) * 0.5) {
      s.wx *= 0.5;
      s.wz *= 0.5;
    }
    s.stuck = moved < walk.stuckSpeed * s.pace ? s.stuck + dt : Math.max(0, s.stuck - dt);
    s.y += (nav.groundAt(s.x, s.z, hint) - s.y) * Math.min(1, walk.stepSmooth * dt);
    if (moved > walk.turnMinSpeed) s.facing = turnToward(s.facing, Math.atan2(s.wx, s.wz), walk.turnRate * dt);
    s.phase += dt * moved * walk.stride;
    if (s.stuck > walk.stuckTime) {
      // Bloqué (coin, marin arrêté sur sa place) : un autre chemin, puis, à la longue, il s'arrête là où il est.
      const retries = s.retries + 1;
      if (retries > walk.maxRetries || !this.goTo(s, s.tx, s.ty, s.tz, s.tf, s.run, avoid)) this.arrive(s);
      else s.retries = retries;
    }
  }

  private walkable(x: number, z: number, y: number): boolean {
    return this.nav.nodeAt(x, z, y) >= 0;
  }

  private arrive(s: Sailor) {
    s.mode = 'act';
    s.wx = s.wz = 0;
    s.stuck = 0;
    s.path = [];
  }

  private climbStep(s: Sailor, dt: number) {
    const p = s.climb;
    const i = s.climbStep * 3;
    const dx = p[i] - s.x;
    const dy = p[i + 1] - s.y;
    const dz = p[i + 2] - s.z;
    const d = Math.hypot(dx, dy, dz);
    const move = walk.climbSpeed * dt;
    // Il fait face à ce qu'il grimpe : du bas vers le haut de l'échelle ou du hauban.
    const a = s.climbStep > 0 ? s.climbStep * 3 - 3 : i;
    const b = s.climbStep > 0 ? i : Math.min(i + 3, p.length - 3);
    const [lo, hi] = p[a + 1] <= p[b + 1] ? [a, b] : [b, a];
    if (Math.hypot(p[hi] - p[lo], p[hi + 2] - p[lo + 2]) > 0.05) s.facing = turnToward(s.facing, Math.atan2(p[hi] - p[lo], p[hi + 2] - p[lo + 2]), walk.turnRate * 2 * dt);
    if (d <= move) {
      s.x = p[i];
      s.y = p[i + 1];
      s.z = p[i + 2];
      s.climbStep++;
      if (s.climbStep * 3 < p.length) return;
      if (s.climbThen === 'path') {
        s.mode = 'move';
        s.step++;
      } else {
        // Il reste où il est arrivé, tourné comme il grimpait.
        s.tf = s.facing;
        this.arrive(s);
      }
      return;
    }
    s.x += (dx / d) * move;
    s.y += (dy / d) * move;
    s.z += (dz / d) * move;
    s.phase += dt * walk.climbStride;
  }
}
