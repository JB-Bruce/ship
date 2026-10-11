import { SAIL } from '../config';
import type { ShipControls } from '../ship/ship';

// KeyboardEvent.code désigne la position physique de la touche :
// ZQSD sur un clavier AZERTY = WASD sur un clavier QWERTY, sans rien configurer.
const SAIL_UP = ['KeyW', 'ArrowUp'];
const SAIL_DOWN = ['KeyS', 'ArrowDown'];
const PORT = ['KeyA', 'ArrowLeft'];
const STARBOARD = ['KeyD', 'ArrowRight'];
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Pilote un bateau au clavier : Z/S maintenues montent ou baissent la jauge de voile, Q/D tiennent la barre. */
export class KeyboardController {
  /** Désactivé quand un menu est ouvert : les touches ne pilotent plus le bateau. */
  enabled = true;
  /** Ordres du bateau piloté (on change de cible quand le joueur prend une autre barre). */
  controls: ShipControls;
  private readonly held = new Set<string>();

  constructor(controls: ShipControls) {
    this.controls = controls;
    window.addEventListener('keydown', (e) => {
      if (ARROWS.includes(e.code)) e.preventDefault();
      if (this.enabled) this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  update(dt: number) {
    const c = this.controls;
    if (!this.enabled) {
      this.held.clear();
      c.rudder = 0;
      return;
    }
    const isHeld = (codes: string[]) => codes.some((code) => this.held.has(code));
    const change = (Number(isHeld(SAIL_UP)) - Number(isHeld(SAIL_DOWN))) * SAIL.changeRate * dt;
    c.sail = Math.min(1, Math.max(0, c.sail + change));
    c.rudder = Number(isHeld(PORT)) - Number(isHeld(STARBOARD));
  }
}
