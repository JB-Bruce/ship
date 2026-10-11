import { FISHING } from '../config';
import { ISLAND_LIST, land } from './island';

export interface FishSchool {
  readonly x: number;
  readonly z: number;
  /** Poissons restants et poissons au départ. */
  fish: number;
  readonly initial: number;
  age: number;
  readonly lifetime: number;
  /** Visibilité (0..1) : fondu à l'apparition et quand le banc plonge. */
  fade: number;
  /** Épuisé ou trop vieux : il plonge et va disparaître. */
  diving: boolean;
  /** Graine des effets (sauts, mouettes, remous), propre à chaque banc. */
  readonly seed: number;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));
/** Tirages pour trouver un emplacement valable. */
const TRIES = 20;

/**
 * Les bancs de poissons en mer, entre 100 et 600 m de la côte d'une île : 2 ou 3 à la fois. Un banc épuisé ou trop vieux
 * plonge, et un autre apparaît ailleurs un peu plus tard. La pêche elle-même est gérée par la flotte (`Fishing`).
 */
export class FishSchools {
  readonly list: FishSchool[] = [];
  private wanted = randInt(FISHING.schools);
  private timer = 0;

  constructor() {
    // Au début de la partie, les bancs sont déjà là ; ensuite, ils reviennent un par un.
    for (let i = 0; i < this.wanted; i++) this.spawn();
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age += dt;
      if (s.fish <= 0 || s.age > s.lifetime) s.diving = true;
      s.fade = Math.min(1, Math.max(0, s.fade + (s.diving ? -dt : dt) / FISHING.fadeTime));
      if (s.diving && s.fade === 0) {
        this.list.splice(i, 1);
        this.wanted = randInt(FISHING.schools);
        this.timer = rand(FISHING.respawnDelay);
      }
    }
    if (this.list.length >= this.wanted) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.spawn() ? rand(FISHING.respawnDelay) : 2;
  }

  /** Le banc vivant le plus proche de (x, z) à moins de `range` mètres, ou null. */
  nearest(x: number, z: number, range: number): FishSchool | null {
    let best: FishSchool | null = null;
    let bestDistance = range;
    for (const s of this.list) {
      if (s.diving) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestDistance) {
        best = s;
        bestDistance = d;
      }
    }
    return best;
  }

  private spawn(): boolean {
    for (let t = 0; t < TRIES; t++) {
      const island = ISLAND_LIST[Math.floor(Math.random() * ISLAND_LIST.length)];
      const angle = Math.random() * Math.PI * 2;
      const r = island.def.radius + rand(FISHING.coastDistance);
      const x = island.cx + Math.sin(angle) * r;
      const z = island.cz + Math.cos(angle) * r;
      const coast = land.sdf(x, z);
      if (coast < FISHING.coastDistance[0] || coast > FISHING.coastDistance[1]) continue;
      if (this.list.some((s) => Math.hypot(s.x - x, s.z - z) < FISHING.spacing)) continue;
      const fish = randInt(FISHING.fish);
      this.list.push({ x, z, fish, initial: fish, age: 0, lifetime: rand(FISHING.lifetime), fade: 0, diving: false, seed: Math.random() * 100 });
      return true;
    }
    return false;
  }
}
