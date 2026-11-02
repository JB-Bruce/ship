import * as THREE from 'three';
import { AUDIO, KRAKEN } from '../../config';
import type { Ball } from '../../combat/projectiles';
import type { Effects } from '../../fx/effects';
import type { WakeMap } from '../../ocean/wakeMap';
import type { Waves } from '../../ocean/waves';
import type { Ship } from '../../ship/ship';
import { sizeRank, type ShipType } from '../../shipTypes';
import { sound } from '../../audio/sound';
import { land } from '../island';
import { Kraken, type KrakenActs } from './kraken';
import type { KrakenHead } from './krakenHead';
import type { Tentacle } from './tentacle';
import { TentacleMesh } from './tentacleMesh';

/** Une partie du Kraken que les canons visent et que les boulets touchent. */
export type KrakenPart = Tentacle | KrakenHead;

/** Ce que les Krakens lisent du monde et ce qu'ils y font : fourni par Game. */
export interface KrakenWorld {
  readonly scene: THREE.Scene;
  readonly effects: Effects;
  readonly wakes: WakeMap;
  readonly waves: Waves;
  readonly ships: readonly Ship[];
  /** Le bateau piloté, ta flotte en mer, ton plus gros type. */
  leader(): Ship;
  hand(): readonly Ship[];
  best(): ShipType;
  /** Obscurité (nuit ou ciel d'orage, 0 à 1). */
  darkness(): number;
  damage(ship: Ship, amount: number): void;
  tearSail(ship: Ship): void;
  knockCrew(ship: Ship, count: number): void;
  shake(amount: number): void;
  alert(text: string): void;
  toast(text: string, tone: 'info' | 'good' | 'danger'): void;
}

/** Une minute : le tirage de la rencontre rare se fait à ce rythme (s). */
const ROLL = 60;
const SKIN = new THREE.Color(1, 1, 1);
const WOUND = new THREE.Color(KRAKEN.woundTint);
const tint = new THREE.Color();
const belly = new THREE.Vector3();
const from = new THREE.Vector3();

/**
 * Les Krakens du monde (au plus un à la fois) : rencontre rare en eau profonde, de nuit ou sous l'orage, ou appelé par
 * l'histoire (`summon`). Ils dessinent toutes leurs tentacules dans un seul InstancedMesh, leur ombre sous l'eau, et
 * reçoivent les boulets (`hit`). `onRepelled` : l'histoire apprend qu'un Kraken a fui.
 */
export class Krakens {
  readonly list: Kraken[] = [];
  /** Toutes leurs parties (cibles des canons, ouvrages des boulets), tenues à jour sans allocation. */
  readonly parts: KrakenPart[] = [];
  onRepelled: (() => void) | null = null;
  private readonly mesh = new TentacleMesh(KRAKEN.tentacles * KRAKEN.segments * 2);
  private cooldown: number = KRAKEN.encounter.firstDelay;
  private roll = ROLL;
  private bubbles = 0;
  private readonly acts: KrakenActs;

  constructor(private readonly world: KrakenWorld) {
    world.scene.add(this.mesh.mesh);
    this.acts = {
      damage: (ship, amount) => world.damage(ship, amount),
      tearSail: (ship) => world.tearSail(ship),
      knockCrew: (ship, count) => world.knockCrew(ship, count),
      shake: (ship, amount) => {
        if (ship === world.leader()) world.shake(amount);
      },
      burst: (x, y, z, scale) => world.effects.kraken.burst(x, y, z, scale),
      sound: (name, at, volume = 1) => sound.at(name, at, { ref: AUDIO.refs.explosion, volume }),
      prey: (x, z, range) => this.prey(x, z, range),
      event: (kind, ship) => this.event(kind, ship),
    };
  }

  /** Un Kraken tient un navire de ta flotte, ou en approche (musique de boss). */
  get threatening(): boolean {
    const hand = this.world.hand();
    return this.list.some((k) => k.target !== null && hand.includes(k.target) && k.phase !== 'flee' && k.phase !== 'gone');
  }

  /**
   * Un Kraken surgit des profondeurs à `distance` m de `target` et nage vers lui (histoire, triche, rencontre rare).
   * Ses tentacules sont d'autant plus coriaces que ta flotte est forte.
   */
  summon(target: Ship, distance = THREE.MathUtils.randFloat(...KRAKEN.approach)): Kraken | null {
    if (this.list.length) return null;
    const angle = Math.random() * Math.PI * 2;
    from.set(target.position.x + Math.sin(angle) * distance, 0, target.position.z + Math.cos(angle) * distance);
    const rank = THREE.MathUtils.clamp(sizeRank(this.world.best()), 1, KRAKEN.tentacleHealth.length);
    const kraken = new Kraken(target, from, KRAKEN.tentacleHealth[rank - 1], this.acts);
    this.world.scene.add(kraken.head.group);
    this.list.push(kraken);
    this.refreshParts();
    if (this.world.hand().includes(target)) this.world.alert('Une ombre immense glisse sous les flots…');
    return kraken;
  }

  update(dt: number, camera: THREE.Camera) {
    this.encounter(dt);
    const { effects, wakes, waves } = this.world;
    this.mesh.begin();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.update(dt);
      if (k.phase === 'gone') {
        this.remove(i);
        continue;
      }
      if (k.shadow > 0.02) wakes.shadow(k.position.x, k.position.z, k.heading, KRAKEN.shadow.half, KRAKEN.shadow.width, k.seed, k.shadow);
      if (k.shadow > 0.3) {
        for (this.bubbles += dt * 6 * k.shadow; this.bubbles >= 1; this.bubbles--) effects.seethe(k.position.x, waves.heightAt(k.position.x, k.position.z), k.position.z, KRAKEN.shadow.width);
      }
      for (let j = k.pieces.length - 1; j >= 0; j--) {
        if (!k.pieces[j].update(dt, waves, (x, y, z) => effects.kraken.burst(x, y, z, 0.7))) k.pieces.splice(j, 1);
      }
      if (camera.position.distanceTo(k.position) < KRAKEN.animRange) this.draw(k);
    }
    this.mesh.end();
  }

  /** Un boulet dans une tentacule ou dans la tête : la chair saigne ; une tentacule sans vie est tranchée. */
  hit(part: KrakenPart, ball: Ball) {
    const kraken = this.list.find((k) => k.parts.includes(part));
    if (!kraken) return;
    part.health -= ball.damage;
    part.hurt = 1;
    this.world.effects.kraken.ichor(ball.position, part.kind === 'tentacle' ? 1 : 1.6);
    sound.at('combat/hit_wood', ball.position, { ref: AUDIO.refs.hit, volume: 0.6 });
    if (part.kind === 'tentacle' && part.health <= 0 && !part.cut) {
      kraken.sever(part, ball.position);
      this.world.effects.kraken.ichor(ball.position, 2);
    }
  }

  /** Tentacules et morceaux tranchés du Kraken, teintés selon leurs blessures. */
  private draw(k: Kraken) {
    const target = k.target;
    for (const t of k.tentacles) {
      if (t.rise <= 0) continue;
      // Le ventre (et ses ventouses) se tourne vers le navire tenu.
      belly.subVectors(target ? target.position : k.position, t.points[0]).setY(0).normalize();
      tint.lerpColors(SKIN, WOUND, t.wound * 0.7);
      if (t.hurt > 0) tint.lerp(SKIN, t.hurt * 0.6);
      this.mesh.chain(t.points, 0, t.cut ? t.cutAt : KRAKEN.segments, 0, belly, tint);
      if (Math.random() < 0.15) this.world.effects.kraken.drip(t.points[Math.floor(KRAKEN.segments * (0.3 + Math.random() * 0.6))]);
    }
    for (const piece of k.pieces) this.mesh.chain(piece.points, 0, piece.points.length - 1, piece.from, piece.belly, WOUND);
  }

  /** La proie la plus proche de (x, z) à moins de `range` m : n'importe quel navire à flot. */
  private prey(x: number, z: number, range: number): Ship | null {
    let best: Ship | null = null;
    let bestDistance = range;
    for (const ship of this.world.ships) {
      if (!ship.alive || ship.intangible) continue;
      const d = Math.hypot(ship.position.x - x, ship.position.z - z);
      if (d < bestDistance) {
        best = ship;
        bestDistance = d;
      }
    }
    return best;
  }

  private event(kind: 'grab' | 'head' | 'flee', ship: Ship | null) {
    const ours = ship !== null && this.world.hand().includes(ship);
    if (kind === 'grab' && ours) this.world.alert('🐙 Le Kraken surgit des profondeurs !');
    else if (kind === 'head') this.world.toast('La tête du Kraken sort de l\'eau : visez-la !', 'danger');
    else if (kind === 'flee') {
      this.world.toast('Le Kraken lâche prise et s\'enfonce dans les abysses…', 'good');
      this.onRepelled?.();
    }
  }

  /**
   * Rencontre rare : une fois par minute, en eau profonde, de nuit ou sous l'orage, si ta flotte est assez forte et
   * qu'aucun Kraken n'est déjà là, une chance qu'il vienne (au plus une fois par `cooldown`).
   */
  private encounter(dt: number) {
    const e = KRAKEN.encounter;
    this.cooldown -= dt;
    this.roll -= dt;
    if (this.roll > 0) return;
    this.roll = ROLL;
    if (this.cooldown > 0 || this.list.length) return;
    const leader = this.world.leader();
    if (!leader.alive || this.world.darkness() < e.darkness || sizeRank(this.world.best()) < e.minRank) return;
    if (land.sdf(leader.position.x, leader.position.z) < e.deep || Math.random() > e.chance) return;
    if (this.summon(leader)) this.cooldown = e.cooldown;
  }

  private remove(i: number) {
    const k = this.list[i];
    k.release();
    this.world.scene.remove(k.head.group);
    k.head.dispose();
    this.list.splice(i, 1);
    this.refreshParts();
  }

  private refreshParts() {
    this.parts.length = 0;
    for (const k of this.list) for (const t of k.tentacles) this.parts.push(t);
    for (const k of this.list) this.parts.push(k.head);
  }
}
