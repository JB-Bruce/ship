import * as THREE from 'three';
import { WEATHER } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const bow = new THREE.Vector3();
/** Délai avant de retenter quand l'étrave n'est pas dans une crête (s). */
const RETRY = 0.5;

/**
 * Paquets de mer de grosse tempête : de temps en temps, une crête déferle sur l'avant d'un bateau, le couvre d'écume
 * et l'abîme un peu (les petits bateaux plus que les gros). `onHit` reçoit le bateau, l'étrave et les dégâts.
 */
export class HeavySeas {
  private readonly timers = new WeakMap<Ship, number>();

  constructor(private readonly onHit: (ship: Ship, bow: THREE.Vector3, damage: number) => void) {}

  /** `intensity` : 0 = mer normale, 1 = grosse tempête (WeatherProfile.seaDamage). */
  update(dt: number, intensity: number, ships: readonly Ship[], waves: Waves) {
    if (intensity <= 0.05) return;
    const h = WEATHER.heavySeas;
    const crest = waves.maxHeight * h.crest;
    for (const ship of ships) {
      if (!ship.alive) continue;
      const left = (this.timers.get(ship) ?? rand(h.interval[0], h.interval[1])) - dt * intensity;
      if (left > 0) {
        this.timers.set(ship, left);
        continue;
      }
      const reach = ship.stats.length * 0.45;
      bow.set(ship.position.x + Math.sin(ship.heading) * reach, 0, ship.position.z + Math.cos(ship.heading) * reach);
      bow.y = waves.heightAt(bow.x, bow.z);
      // Seule une vraie crête sous l'étrave déferle ; sinon on guette la suivante.
      if (bow.y < crest) {
        this.timers.set(ship, RETRY);
        continue;
      }
      const scale = Math.min(h.maxScale, h.referenceLength / ship.stats.length);
      this.onHit(ship, bow, ship.stats.maxHealth * h.damage * scale * intensity);
      this.timers.set(ship, rand(h.interval[0], h.interval[1]));
    }
  }
}
