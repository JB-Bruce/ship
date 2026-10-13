import { GARRISON } from '../config';
import type { Ship } from '../ship/ship';
import type { ShipType } from '../shipTypes';
import type { Enemy, EnemySpawner } from './enemySpawner';
import { land, type Island } from './island';

/** Un poste de la garnison : un navire amarré dans la crique, ou une ronde autour de l'île. */
interface Post {
  readonly type: ShipType;
  /** Mouillage (garnison amarrée), sinon null (ronde). */
  readonly mooring: { x: number; z: number } | null;
  /** Sens de la ronde (+1 ou -1). */
  readonly turn: number;
  /** Son navire en mer, ou null. */
  enemy: Enemy | null;
  /** Délai avant qu'un nouveau navire prenne le poste (s) : renfort après un naufrage. */
  wait: number;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
/** Place trop près de toi pour y faire surgir un navire : on réessaie après ce délai (s). */
const RETRY = 2;

/**
 * Garnison de la Marine autour d'une île qu'elle tient : navires amarrés dans la crique et rondes au large
 * (GARRISON). Ils ne sont en mer que quand ton navire est dans les parages, et apparaissent toujours hors de vue. Un
 * navire coulé est remplacé après un délai, tant que le fort tient ; quand tu prends l'île, les survivants s'en vont.
 */
export class NavyGarrison {
  private readonly posts: Post[];
  /** Rayon des rondes autour du centre de l'île (m). */
  private readonly orbit: number;

  constructor(
    private readonly island: Island,
    private readonly spawner: EnemySpawner,
  ) {
    this.orbit = island.outerRadius + GARRISON.patrolOffing;
    const bay = island.def.bay.angle;
    const moored = GARRISON.moored.map(({ type, angle, offing }) => {
      const p = island.pointAt(bay + angle, -offing);
      return { type, mooring: land.keepOffshore(p.x, p.z, GARRISON.mooringRadius * 2), turn: 1, enemy: null, wait: 0 };
    });
    const patrols = GARRISON.patrols.map((type, i) => ({ type, mooring: null, turn: i % 2 === 0 ? 1 : -1, enemy: null, wait: 0 }));
    this.posts = [...moored, ...patrols];
  }

  /**
   * `reinforce` : le fort tient (sinon plus aucun navire ne prend la mer) ; `alarm` : on approche du port ou le fort
   * est touché, les navires amarrés appareillent.
   */
  update(dt: number, leader: Ship, reinforce: boolean, alarm: boolean) {
    const d = Math.hypot(leader.position.x - this.island.cx, leader.position.z - this.island.cz);
    const near = d < GARRISON.activeRadius;
    const far = d > GARRISON.releaseRadius;
    for (const post of this.posts) {
      const enemy = post.enemy;
      if (enemy) {
        if (enemy.ship.sunk) {
          post.enemy = null;
          post.wait = rand(GARRISON.reinforceDelay);
        } else if (far && enemy.ai.state === 'patrol' && enemy.ship.alive) {
          // Au repos et loin de toi : il rentre (il reprendra la mer à ton retour).
          this.spawner.discard(enemy);
          post.enemy = null;
        } else if (alarm && post.mooring) {
          enemy.ai.wake();
        }
        continue;
      }
      post.wait = Math.max(0, post.wait - dt);
      if (!near || !reinforce || post.wait > 0) continue;
      post.enemy = this.launch(post, leader);
      if (!post.enemy) post.wait = RETRY;
    }
  }

  /** L'île est prise : les survivants abandonnent leur poste et s'en vont (ils disparaissent au large). */
  release() {
    for (const post of this.posts) {
      if (post.enemy && post.enemy.ship.alive) {
        post.enemy.persistent = false;
        post.enemy.ai.leave();
      }
      post.enemy = null;
      post.wait = 0;
    }
  }

  /** Met un navire à son poste, hors de vue de ton navire ; null si sa place est trop près de toi. */
  private launch(post: Post, leader: Ship): Enemy | null {
    const { x: lx, z: lz } = leader.position;
    if (post.mooring) {
      const { x, z } = post.mooring;
      if (Math.hypot(x - lx, z - lz) < GARRISON.spawnClearance) return null;
      // Proue vers le large, dans l'axe de la crique.
      return this.spawner.spawnGuard(post.type, x, z, this.island.def.bay.angle, { moored: post.mooring, leash: GARRISON.leash });
    }
    // Ronde : elle surgit sur son cercle, du côté opposé à toi (un peu décalée selon son sens).
    const { cx, cz } = this.island;
    const angle = Math.atan2(lx - cx, lz - cz) + Math.PI + post.turn * 0.6;
    const p = land.keepOffshore(cx + Math.sin(angle) * this.orbit, cz + Math.cos(angle) * this.orbit, GARRISON.mooringRadius * 2);
    if (Math.hypot(p.x - lx, p.z - lz) < GARRISON.spawnClearance) return null;
    const orbit = { x: cx, z: cz, radius: this.orbit, turn: post.turn };
    return this.spawner.spawnGuard(post.type, p.x, p.z, angle + post.turn * (Math.PI / 2), { orbit, leash: GARRISON.leash });
  }
}
