import { BOSS_IDS, BOSSES, type BossId } from '../config';
import type { Ship } from '../ship/ship';
import type { Enemy, EnemySpawner } from './enemySpawner';
import type { Weather } from './weather';

export interface BossEvents {
  /** Le boss vient de surgir. */
  appear(id: BossId): void;
  /** Son temps se lève : le boss s'éloigne. */
  leave(id: BossId): void;
  /** Le boss a disparu dans la brume. */
  vanish(id: BossId): void;
}

/** Délai avant de réessayer quand aucun point d'apparition n'est valable (près du port, par exemple) (s). */
const RETRY = 3;
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * La rencontre avec un boss : une fois par épisode de son temps (grosse tempête, brouillard), un peu après qu'il s'est
 * installé, le boss surgit et s'en prend à la flotte. Quand ce temps se lève, il s'éloigne puis disparaît, et
 * reviendra intact. S'il coule toute ta flotte, il disparaît aussitôt (et ne revient qu'à l'épisode suivant).
 */
class BossEncounter {
  /** Le boss en mer, ou null. */
  boss: Enemy | null = null;
  private timer: number | null = null;
  /** Le boss est déjà venu pendant cet épisode. */
  private came = false;

  constructor(
    private readonly id: BossId,
    private readonly spawner: EnemySpawner,
    private readonly events: BossEvents,
  ) {}

  /** `fleetAlive` : il reste au moins un navire à flot dans ta flotte. */
  update(dt: number, weather: Weather, leader: Ship, fleetAlive: boolean) {
    const def = BOSSES[this.id];
    // Coulé (le spawner l'a retiré) : on l'oublie.
    if (this.boss && !this.spawner.enemies.includes(this.boss)) this.boss = null;
    const active = weather.target === def.weather;
    if (!active) {
      this.came = false;
      this.timer = null;
      if (this.boss?.ship.alive && this.boss.ai.state !== 'leave') {
        this.boss.ai.leave();
        this.events.leave(this.id);
      }
    }
    if (this.boss) {
      // Toute ta flotte a sombré : le boss disparaît dans la brume.
      const gone = !fleetAlive || (this.boss.ai.state === 'leave' && this.boss.ship.distanceTo(leader) > def.vanishDistance);
      if (gone && this.boss.ship.alive) {
        this.spawner.discard(this.boss);
        this.boss = null;
        this.events.vanish(this.id);
      }
      return;
    }
    if (!active || this.came || !leader.alive || weather.levelOf(def.weather) < def.minLevel) return;
    this.timer ??= rand(def.delay);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.boss = this.spawner.spawnBoss(this.id, leader);
    if (!this.boss) {
      this.timer = RETRY;
      return;
    }
    this.came = true;
    this.timer = null;
    this.events.appear(this.id);
  }
}

/** Tous les boss du jeu (BOSSES) : chacun guette son temps. */
export class Bosses {
  private readonly encounters: BossEncounter[];

  constructor(spawner: EnemySpawner, events: BossEvents) {
    this.encounters = BOSS_IDS.map((id) => new BossEncounter(id, spawner, events));
  }

  update(dt: number, weather: Weather, leader: Ship, fleetAlive: boolean) {
    for (const encounter of this.encounters) encounter.update(dt, weather, leader, fleetAlive);
  }

  /** Le boss dont la barre de vie s'affiche : assez près du bateau piloté, et pas caché dans la brume. */
  inSight(leader: Ship): Enemy | null {
    for (const { boss } of this.encounters) {
      if (boss?.boss && boss.ship.alive && !boss.ai.hidden && boss.ship.distanceTo(leader) < BOSSES[boss.boss].barRange) return boss;
    }
    return null;
  }
}
