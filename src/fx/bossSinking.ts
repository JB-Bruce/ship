import * as THREE from 'three';
import type { ChaseCamera } from '../camera/chaseCamera';
import { AUDIO, BOSS_SINK } from '../config';
import type { Ship } from '../ship/ship';
import type { Effects } from './effects';
import { sound } from '../audio/sound';

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const point = new THREE.Vector3();

/** Un des foyers d'incendie du modèle (sur le pont, au-dessus de la coque qui cacherait l'explosion), en coordonnées monde. */
function deckPoint(ship: Ship): THREE.Vector3 {
  const spots = ship.model.fireSpots;
  if (!spots.length) return point.copy(ship.position).setY(ship.position.y + 2);
  ship.model.root.updateMatrixWorld();
  return point.copy(spots[Math.floor(Math.random() * spots.length)]).applyMatrix4(ship.model.root.matrixWorld);
}

/**
 * Mise en scène du naufrage d'un boss : au coup fatal, grosse explosion, secousse (s'il est assez près) et léger zoom de
 * la caméra ; puis quelques explosions le long de l'épave pendant qu'elle coule.
 */
export class BossSinking {
  private readonly wrecks: { ship: Ship; left: number; next: number }[] = [];

  constructor(
    private readonly effects: Effects,
    private readonly camera: ChaseCamera,
  ) {}

  /** Le boss `ship` vient de recevoir le coup fatal ; `viewer` : le bateau piloté. */
  start(ship: Ship, viewer: Ship) {
    this.effects.explosion(deckPoint(ship), 1.6);
    sound.at('combat/explosion', ship.position, { ref: AUDIO.refs.explosion });
    if (ship.distanceTo(viewer) < BOSS_SINK.shakeRange) this.camera.shake(BOSS_SINK.shake);
    this.camera.punch(BOSS_SINK.zoom, BOSS_SINK.zoomTime);
    this.wrecks.push({ ship, left: BOSS_SINK.aftershocks, next: rand(BOSS_SINK.aftershockInterval) });
  }

  update(dt: number) {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.next -= dt;
      if (w.next > 0) continue;
      this.effects.explosion(deckPoint(w.ship), 0.9);
      w.left--;
      w.next = rand(BOSS_SINK.aftershockInterval);
      if (w.left <= 0) this.wrecks.splice(i, 1);
    }
  }
}
