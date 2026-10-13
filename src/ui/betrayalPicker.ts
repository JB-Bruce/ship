import * as THREE from 'three';
import { BETRAYAL } from '../config';
import type { Ship } from '../ship/ship';
import { SHIP_TYPES, typeName } from '../shipTypes';
import type { Betrayal } from '../world/betrayal';
import type { Hud } from './hud';
import { ParchmentMenu } from './parchmentMenu';
import type { Radar } from './radar';

const corner = new THREE.Vector3();
/** Boîte d'un navire à l'écran (px), recalculée sans allocation. */
const box = { minX: 0, maxX: 0, minY: 0, maxY: 0, depth: 0 };
const NOBODY: readonly Ship[] = [];

/**
 * Mode « Trahir » : le bouton (ou la touche R) arme la visée — curseur en viseur, alliés trahissables surlignés —, un
 * clic sur l'un d'eux le fait passer à l'ennemi ; un clic dans le vide, Échap, ou un menu qui s'ouvre l'annule.
 */
export class BetrayalPicker {
  /** Visée en cours. */
  active = false;
  /** L'allié sous le curseur pendant la visée, ou null. */
  hovered: Ship | null = null;
  private pointerX = -1;
  private pointerY = -1;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly betrayal: Betrayal,
    private readonly hud: Hud,
    private readonly radar: Radar,
  ) {
    viewport.addEventListener('pointermove', (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    viewport.addEventListener('pointerleave', () => (this.pointerX = this.pointerY = -1));
    ParchmentMenu.escapeHandler = () => this.cancel();
  }

  /** Arme ou désarme la visée (bouton ou touche). Jamais pendant qu'un menu est ouvert. */
  toggle() {
    if (this.active) {
      this.cancel();
      return;
    }
    if (ParchmentMenu.anyOpen()) return;
    if (!this.betrayal.candidates.length) {
      this.hud.toast('Aucun pirate ni marchand allié à portée', 2);
      return;
    }
    this.active = true;
    this.viewport.classList.add('aiming');
  }

  /** Désarme la visée ; renvoie true si elle était armée (Échap est alors consommé). */
  cancel(): boolean {
    if (!this.active) return false;
    this.active = false;
    this.hovered = null;
    this.viewport.classList.remove('aiming');
    return true;
  }

  /** Clic dans la vue (pas un glisser de caméra) : trahit l'allié visé, ou annule si le clic tombe à côté. */
  click(x: number, y: number, camera: THREE.Camera) {
    if (!this.active) return;
    const target = this.pick(x, y, camera);
    this.cancel();
    if (!target) return;
    const wasPirate = this.betrayal.isPirate(target);
    const enemy = this.betrayal.betray(target);
    if (!enemy) return;
    const { feminine } = SHIP_TYPES[enemy.ship.type];
    const kind = wasPirate ? 'pirate' : feminine ? 'marchande' : 'marchand';
    const type = typeName(enemy.ship.type, enemy.ship.extension).toLowerCase();
    this.hud.toast(`${feminine ? 'Cette' : 'Ce'} ${type} ${kind} passe à l'ennemi !`, BETRAYAL.toastSeconds, 'danger');
    this.radar.ping(enemy.ship, BETRAYAL.toastSeconds);
  }

  /**
   * Chaque image : recense les alliés trahissables autour du navire piloté (`visibility` : portée de la brume), annule
   * la visée si un menu s'ouvre ou s'il n'y a plus personne, et repère l'allié survolé.
   */
  update(camera: THREE.Camera, leader: Ship, visibility: number) {
    this.betrayal.refresh(leader, visibility);
    if (!this.active) return;
    if (ParchmentMenu.anyOpen() || !this.betrayal.candidates.length) {
      this.cancel();
      return;
    }
    this.hovered = this.pointerX < 0 ? null : this.pick(this.pointerX, this.pointerY, camera);
  }

  /** Alliés à surligner (ceux qu'on peut trahir, pendant la visée seulement). */
  get marked(): readonly Ship[] {
    return this.active ? this.betrayal.candidates : NOBODY;
  }

  /** Libellé de la commande à l'écran (null = cachée), et consigne pendant la visée. */
  get prompt(): string | null {
    return this.active ? 'Annuler' : this.betrayal.candidates.length ? 'Trahir' : null;
  }

  get status(): string | null {
    return this.active ? 'Clique sur un pirate ou un marchand allié pour le trahir · Échap pour annuler' : null;
  }

  /** L'allié trahissable dont la silhouette à l'écran contient (x, y), le plus proche de la caméra s'ils se recouvrent. */
  private pick(x: number, y: number, camera: THREE.Camera): Ship | null {
    let best: Ship | null = null;
    let bestDepth = Infinity;
    for (const ship of this.betrayal.candidates) {
      if (!screenBox(ship, camera)) continue;
      const m = BETRAYAL.pickMargin;
      if (x < box.minX - m || x > box.maxX + m || y < box.minY - m || y > box.maxY + m || box.depth >= bestDepth) continue;
      best = ship;
      bestDepth = box.depth;
    }
    return best;
  }
}

/**
 * Boîte à l'écran d'un navire (dans `box`) : proue et poupe à la flottaison, et le haut de sa mâture. Renvoie false s'il
 * est derrière la caméra. Mêmes coordonnées que les barres de vie (fenêtre entière : la vue est en plein écran).
 */
function screenBox(ship: Ship, camera: THREE.Camera): boolean {
  const half = ship.stats.length / 2;
  const fx = Math.sin(ship.heading) * half;
  const fz = Math.cos(ship.heading) * half;
  const { x, y, z } = ship.position;
  box.minX = box.minY = Infinity;
  box.maxX = box.maxY = -Infinity;
  box.depth = Infinity;
  for (let i = 0; i < 4; i++) {
    // Proue, poupe, puis le haut de la mâture au-dessus de chacune (la silhouette entière, voiles comprises).
    const s = i % 2 === 0 ? 1 : -1;
    corner.set(x + fx * s, y + (i < 2 ? 0 : ship.model.barHeight), z + fz * s).project(camera);
    if (corner.z > 1) return false;
    const sx = (corner.x * 0.5 + 0.5) * innerWidth;
    const sy = (-corner.y * 0.5 + 0.5) * innerHeight;
    box.minX = Math.min(box.minX, sx);
    box.maxX = Math.max(box.maxX, sx);
    box.minY = Math.min(box.minY, sy);
    box.maxY = Math.max(box.maxY, sy);
    box.depth = Math.min(box.depth, corner.z);
  }
  return true;
}
