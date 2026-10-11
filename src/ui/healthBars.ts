import * as THREE from 'three';
import type { Ship } from '../ship/ship';

/** Distance au-delà de laquelle on n'affiche plus la barre (m). */
const MAX_DISTANCE = 300;
const projected = new THREE.Vector3();

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  seen: number;
}

/**
 * Barres de vie flottant au-dessus des autres bateaux (éléments HTML positionnés chaque image) :
 * rouges pour les ennemis, vertes pour les navires de ta flotte.
 */
export class HealthBars {
  private readonly bars = new Map<Ship, Bar>();
  private frame = 0;

  constructor(private readonly parent: HTMLElement) {}

  /** `visibility` : au-delà (brume), un navire est invisible et sa barre aussi. */
  update(camera: THREE.Camera, ships: readonly Ship[], player: Ship, visibility: number) {
    this.frame++;
    const range = Math.min(MAX_DISTANCE, visibility);
    for (const ship of ships) {
      if (ship === player || !ship.alive || ship.distanceTo(player) > range) continue;
      projected.set(ship.position.x, ship.position.y + ship.model.barHeight, ship.position.z).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) continue;

      const bar = this.bars.get(ship) ?? this.create(ship);
      bar.seen = this.frame;
      const x = (projected.x * 0.5 + 0.5) * innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * innerHeight;
      bar.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      bar.fill.style.width = `${(ship.health / ship.stats.maxHealth) * 100}%`;
    }
    // Retire les barres des bateaux non affichés à cette image (hors champ, coulés, trop loin).
    for (const [ship, bar] of this.bars) {
      if (bar.seen === this.frame) continue;
      bar.root.remove();
      this.bars.delete(ship);
    }
  }

  private create(ship: Ship): Bar {
    const root = document.createElement('div');
    root.className = ship.faction === 'enemy' ? 'ship-bar' : 'ship-bar ally';
    const fill = root.appendChild(document.createElement('div'));
    fill.className = 'ship-bar-fill';
    this.parent.appendChild(root);
    const bar = { root, fill, seen: this.frame };
    this.bars.set(ship, bar);
    return bar;
  }
}
