import * as THREE from 'three';
import { AUDIO, FIRESHIP } from '../config';
import type { Effects } from '../fx/effects';
import { isHostile, type Ship } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import { ScreenFlash } from '../ui/screenFlash';
import { sound } from '../audio/sound';
import type { Criticals } from './criticals';

/** Ce que l'explosion d'un brûlot touche et montre. */
export interface FireshipWorld {
  readonly container: HTMLElement;
  readonly effects: Effects;
  readonly criticals: Criticals;
  /** Dégâts portés par `attacker` (null : le brûlot qui se sacrifie) ; `forced` : même sur un navire invincible (triche). */
  applyDamage(ship: Ship, damage: number, attacker: Ship | null, forced?: boolean): void;
  /** Le bateau piloté (secousse et flash selon sa distance). */
  leader(): Ship;
  shake(amount: number): void;
  /** Lueur de la scène (ciel, brume, lumière ambiante), comme un éclair. */
  sceneFlash(strength: number): void;
}

/** Le nuage de fumée d'une explosion, soufflé pendant FIRESHIP.cloud.time : d'où, et depuis combien de temps. */
interface Cloud {
  at: THREE.Vector3;
  age: number;
  acc: number;
}

const puff = new THREE.Vector3();
const debris = new THREE.Vector3();
const above = new THREE.Vector3();

/**
 * Brûlots (navires maudits) : au premier contact avec une coque adverse (world/collisions.ts), toute leur poudre saute.
 * Le navire touché prend la charge entière (`ShipTypeDef.fireship`, selon les allongements) et prend feu ; les autres
 * adversaires du brûlot dans le rayon du souffle en prennent une part (FIRESHIP) et prennent souvent feu ; le brûlot
 * sombre. L'explosion est géante : boule de feu, éclats et gerbes, nuage de fumée qui monte peu à peu et disparaît,
 * secousse de la caméra et flash (écran et scène) selon la distance. Sa fumée traîne derrière lui tant qu'il est à flot.
 */
export class Fireships {
  /** Temps jusqu'à la prochaine bouffée de fumée, par brûlot. */
  private readonly smoke = new Map<Ship, number>();
  private readonly clouds: Cloud[] = [];
  private readonly screen: ScreenFlash;

  constructor(private readonly world: FireshipWorld) {
    this.screen = new ScreenFlash(world.container);
  }

  detonate(fireship: Ship, target: Ship, ships: readonly Ship[]) {
    const charge = SHIP_TYPES[fireship.type].fireship;
    if (!charge || !fireship.alive) return;
    const k = Math.min(fireship.extension, charge.damage.length - 1);
    const damage = charge.damage[k];
    const radius = charge.radius[k];
    const { criticals } = this.world;
    this.explode(fireship.position.clone().lerp(target.position, 0.3));
    this.world.applyDamage(target, damage, fireship);
    criticals.ignite(target);
    for (const other of ships) {
      if (other === fireship || other === target || !other.alive || other.intangible || !isHostile(fireship, other)) continue;
      const d = other.distanceTo(fireship);
      if (d > radius) continue;
      this.world.applyDamage(other, damage * FIRESHIP.blastShare * (1 - (1 - FIRESHIP.edge) * (d / radius)), fireship);
      if (Math.random() < FIRESHIP.igniteChance) criticals.ignite(other);
    }
    this.world.applyDamage(fireship, fireship.health + fireship.stats.maxHealth, null, true);
  }

  /** Fumée des brûlots à flot (près de la caméra) et nuages de leurs explosions, soufflés quelques secondes. */
  update(dt: number, ships: readonly Ship[], camera: THREE.Vector3) {
    this.trail(dt, ships, camera);
    const { time, rate, scale } = FIRESHIP.cloud;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt;
      for (c.acc += dt * rate; c.acc >= 1; c.acc--) this.world.effects.smokeCloud(c.at, scale);
      if (c.age >= time) this.clouds.splice(i, 1);
    }
  }

  /** Boule de feu géante, éclats et gerbes, nuage de fumée ; secousse et flash selon la distance au bateau piloté. */
  private explode(at: THREE.Vector3) {
    const { effects } = this.world;
    const { scale, second, debris: count, debrisRange } = FIRESHIP.blast;
    effects.explosion(at, scale);
    effects.explosion(above.copy(at).setY(at.y + 4 * scale), scale * second);
    const [near, far] = debrisRange;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = near + Math.random() * (far - near);
      debris.set(at.x + Math.cos(a) * d, at.y, at.z + Math.sin(a) * d);
      effects.impact(debris);
      effects.splash(debris.x, debris.y, debris.z);
    }
    this.clouds.push({ at: at.clone().setY(at.y + FIRESHIP.cloud.lift), age: 0, acc: 0 });
    sound.at('combat/explosion', at, { ref: AUDIO.refs.explosion * 2 });
    const distance = this.world.leader().position.distanceTo(at);
    const { shake, flash } = FIRESHIP;
    if (distance < shake.range) this.world.shake(shake.amount * (1 - (distance / shake.range) * (1 - shake.far)));
    if (distance < flash.range) {
      const strength = flash.strength * (1 - distance / flash.range);
      this.screen.flash(strength, flash.time);
      this.world.sceneFlash(strength);
    }
  }

  /** Fumée qui traîne derrière les brûlots à flot à moins de FIRESHIP.smoke.range de la caméra. */
  private trail(dt: number, ships: readonly Ship[], camera: THREE.Vector3) {
    const { rate, scale, range } = FIRESHIP.smoke;
    for (const ship of ships) {
      if (!SHIP_TYPES[ship.type].fireship) continue;
      if (!ship.alive || ship.drowned > 0) {
        this.smoke.delete(ship);
        continue;
      }
      if (ship.position.distanceTo(camera) > range) continue;
      const left = (this.smoke.get(ship) ?? Math.random() / rate) - dt;
      if (left > 0) {
        this.smoke.set(ship, left);
        continue;
      }
      this.smoke.set(ship, 1 / rate);
      const spots = ship.model.fireSpots;
      if (!spots.length) continue;
      ship.model.root.updateMatrixWorld();
      puff.copy(spots[Math.floor(Math.random() * spots.length)]).applyMatrix4(ship.model.root.matrixWorld);
      this.world.effects.plume(puff, scale);
    }
    // Brûlots disparus du monde : on oublie leur minuterie.
    for (const ship of this.smoke.keys()) if (!ships.includes(ship)) this.smoke.delete(ship);
  }
}
