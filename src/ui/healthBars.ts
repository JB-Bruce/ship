import * as THREE from 'three';
import type { Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import { enemyTagHtml, threatOf, type Threat } from './enemyTags';

/** Distance au-delà de laquelle on n'affiche plus la barre (m). */
const MAX_DISTANCE = 300;
const projected = new THREE.Vector3();

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  /** Étiquette d'un ennemi (type, élite, menace), ou null pour un allié. */
  tag: HTMLElement | null;
  threat: Threat | null;
  seen: number;
}

/**
 * Barres de vie flottant au-dessus des autres bateaux (éléments HTML positionnés chaque image) :
 * rouges pour les ennemis, vertes pour les navires de ta flotte. Au-dessus d'un ennemi, une étiquette : son type (ou
 * son nom), sa couronne s'il est d'élite, et une couleur selon sa menace pour le navire piloté (voir enemyTags.ts).
 */
export class HealthBars {
  private readonly bars = new Map<Ship, Bar>();
  private frame = 0;

  constructor(private readonly parent: HTMLElement) {}

  /** `visibility` : au-delà (brume), un navire est invisible et sa barre aussi. */
  update(camera: THREE.Camera, ships: readonly Ship[], player: Ship, visibility: number, enemies: readonly Enemy[]) {
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
      const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      bar.root.style.transform = transform;
      bar.fill.style.width = `${(ship.health / ship.stats.maxHealth) * 100}%`;
      if (bar.tag) this.updateTag(bar, bar.tag, transform, ship, player, enemies);
    }
    // Retire les barres des bateaux non affichés à cette image (hors champ, coulés, trop loin).
    for (const [ship, bar] of this.bars) {
      if (bar.seen === this.frame) continue;
      bar.root.remove();
      bar.tag?.remove();
      this.bars.delete(ship);
    }
  }

  /** Place l'étiquette au-dessus de la barre ; son texte et sa couleur changent avec la menace (changement de barre). */
  private updateTag(bar: Bar, tag: HTMLElement, transform: string, ship: Ship, player: Ship, enemies: readonly Enemy[]) {
    tag.style.transform = transform;
    const enemy = enemies.find((e) => e.ship === ship);
    if (!enemy) return;
    const threat = threatOf(enemy, player);
    if (threat === bar.threat) return;
    bar.threat = threat;
    tag.className = `ship-tag ${threat}`;
    tag.innerHTML = enemyTagHtml(enemy, threat);
  }

  private create(ship: Ship): Bar {
    const root = document.createElement('div');
    root.className = ship.faction === 'enemy' ? 'ship-bar' : 'ship-bar ally';
    const fill = root.appendChild(document.createElement('div'));
    fill.className = 'ship-bar-fill';
    this.parent.appendChild(root);
    const tag = ship.faction === 'enemy' ? this.parent.appendChild(document.createElement('div')) : null;
    if (tag) tag.className = 'ship-tag';
    const bar: Bar = { root, fill, tag, threat: null, seen: this.frame };
    this.bars.set(ship, bar);
    return bar;
  }
}
