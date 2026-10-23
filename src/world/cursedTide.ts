import * as THREE from 'three';
import { CURSED } from '../config';
import type { Effects } from '../fx/effects';
import type { FleetMember } from '../fleet/fleet';
import { findOpenSea } from '../missions/openSea';
import type { Ship } from '../ship/ship';
import { maxRank, SHIP_SIZE_ORDER, sizeRank, typeOfRank, type ShipType } from '../shipTypes';
import type { Enemy, EnemySpawner } from './enemySpawner';
import { conditions } from './weather';

/** Un navire maudit et où il en est : il sort de l'eau, se bat, ou replonge. */
interface Ghost {
  enemy: Enemy;
  phase: 'rise' | 'fight' | 'dive';
  /** Temps écoulé dans la phase (s). */
  t: number;
  /** Temps passé en surface (s). */
  age: number;
  /** Profondeur d'où il sort (m) : tout le navire, mâts compris, est sous l'eau. */
  depth: number;
  /** Bouffées de brume à émettre. */
  mist: number;
}

/** Ce que la marée maudite fait savoir. */
export interface CursedEvents {
  toast(text: string): void;
}

/** Mer libre autour du point où surgit un navire maudit (m). */
const ROOM = 30;
/** Seuil de `conditions.night` au-delà duquel il fait nuit. */
const NIGHT = 0.5;

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const ease = (k: number) => k * k * (3 - 2 * k);
const box = new THREE.Box3();
const spot = new THREE.Vector3();

/**
 * Navires maudits, envoyés du dieu des océans : une nuit sur trois environ, ils sortent des flots tout près de ta
 * flotte (bien plus près que les autres ennemis), se battent à mort contre tout ce qui flotte, puis replongent au
 * lever du jour, quand tu t'éloignes ou au bout d'un temps. Pendant qu'ils surgissent ou replongent, rien ne les vise et
 * ils ne tirent pas (ils sortent de l'eau et y replongent la proue la première). `summon` les fait surgir à la demande (triche K, événements de l'histoire).
 */
export class CursedTide {
  private readonly ghosts: Ghost[] = [];
  private wasNight = false;
  /** Temps avant l'apparition de cette nuit (s), ou null si cette nuit reste calme. */
  private pending: number | null = null;

  constructor(
    private readonly spawner: EnemySpawner,
    private readonly effects: Effects,
    private readonly best: () => ShipType,
    private readonly events: CursedEvents,
  ) {}

  get night(): boolean {
    return conditions.night > NIGHT;
  }

  /** `fleet` : ta flotte en mer (pour savoir si tu t'es éloigné). */
  update(dt: number, leader: Ship, fleet: readonly FleetMember[]) {
    const night = this.night;
    if (night && !this.wasNight) this.pending = Math.random() < CURSED.nightChance ? rand(CURSED.delay) : null;
    if (!night) this.pending = null;
    this.wasNight = night;
    if (this.pending !== null) {
      this.pending -= dt;
      if (this.pending <= 0) {
        this.pending = null;
        const [min, max] = CURSED.count;
        this.summon(leader, min + Math.floor(Math.random() * (max - min + 1)), CURSED.rankBonus);
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (!this.spawner.enemies.includes(g.enemy)) this.ghosts.splice(i, 1);
      else if (this.step(g, dt, night, fleet)) {
        this.spawner.discard(g.enemy);
        this.ghosts.splice(i, 1);
      }
    }
  }

  /**
   * Fait surgir `count` navires maudits autour de `near` (navire piloté), jusqu'à ton plus gros navire + `rankBonus`
   * crans. Renvoie le nombre de navires surgis.
   */
  summon(near: Ship, count: number, rankBonus: number): number {
    const top = Math.min(maxRank(), sizeRank(this.best()) + rankBonus);
    const low = Math.max(sizeRank(SHIP_SIZE_ORDER[0]), top - CURSED.rankSpan);
    for (let k = 0; k < count; k++) {
      const p = findOpenSea(near.position.x, near.position.z, CURSED.distance, ROOM);
      const type = typeOfRank(low + Math.floor(Math.random() * (top - low + 1)));
      const enemy = this.spawner.spawnCursed(type, p.x, p.z, Math.atan2(near.position.x - p.x, near.position.z - p.z));
      box.setFromObject(enemy.ship.model.root);
      const depth = box.max.y + CURSED.depth;
      enemy.ship.drowned = depth;
      enemy.ship.intangible = true;
      this.ghosts.push({ enemy, phase: 'rise', t: 0, age: 0, depth, mist: 0 });
    }
    return count;
  }

  /** Fait avancer un navire maudit ; renvoie vrai quand il a fini de replonger (à retirer). */
  private step(g: Ghost, dt: number, night: boolean, fleet: readonly FleetMember[]): boolean {
    const ship = g.enemy.ship;
    g.t += dt;
    this.emit(g, dt);
    if (!ship.alive) {
      // Coulé : il sombre comme les autres (le naufrage s'en charge).
      ship.intangible = false;
      return false;
    }
    if (g.phase === 'rise') {
      const k = Math.min(1, g.t / CURSED.riseTime);
      // Il sort de l'eau la proue la première, puis se redresse.
      ship.drowned = g.depth * (1 - ease(k));
      ship.plunge = -CURSED.plunge * (1 - ease(k));
      if (k < 1) return false;
      g.phase = 'fight';
      ship.drowned = 0;
      ship.plunge = 0;
      ship.intangible = false;
      return false;
    }
    if (g.phase === 'fight') {
      g.age += dt;
      const away = !fleet.some((m) => m.ship.alive && m.ship.distanceTo(ship) < CURSED.leaveDistance);
      if (night && !away && g.age < CURSED.lifetime) return false;
      if (!night) this.events.toast('Le jour se lève : les maudits retournent aux abysses');
      g.phase = 'dive';
      g.t = 0;
      ship.intangible = true;
      return false;
    }
    const k = Math.min(1, g.t / CURSED.diveTime);
    // Il pique du nez et s'enfonce la proue la première.
    ship.drowned = g.depth * ease(k);
    ship.plunge = CURSED.plunge * ease(k);
    return k >= 1;
  }

  /** Brume pâle autour de la coque, et l'eau qui bouillonne quand il sort des flots ou y replonge. */
  private emit(g: Ghost, dt: number) {
    const ship = g.enemy.ship;
    if (ship.far) return;
    const p = ship.position;
    const half = ship.stats.length / 2;
    g.mist += dt * CURSED.mist * (g.phase === 'fight' ? 1 : 2);
    while (g.mist >= 1) {
      g.mist -= 1;
      const along = (Math.random() * 2 - 1) * half;
      spot.set(p.x + Math.sin(ship.heading) * along, p.y + ship.drowned + 0.3, p.z + Math.cos(ship.heading) * along);
      if (g.phase === 'fight') this.effects.ghostMist(spot.x, spot.y, spot.z);
      else this.effects.seethe(spot.x, spot.y - 0.3, spot.z, ship.stats.width);
    }
  }
}
