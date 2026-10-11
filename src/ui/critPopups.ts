import * as THREE from 'three';
import { CRIT } from '../config';
import type { Ship } from '../ship/ship';

const projected = new THREE.Vector3();
/** Montée du texte pendant sa vie (px). */
const RISE = 28;

/** Textes flottants au-dessus d'un navire qui vient de subir un coup critique (« 🔥 Incendie à bord ! »). */
export class CritPopups {
  private readonly popups: { ship: Ship; el: HTMLElement; age: number }[] = [];

  constructor(private readonly parent: HTMLElement) {}

  show(ship: Ship, text: string) {
    const el = document.createElement('div');
    el.className = `crit-popup${ship.faction === 'enemy' ? '' : ' ally'}`;
    el.textContent = text;
    this.parent.appendChild(el);
    this.popups.push({ ship, el, age: 0 });
  }

  update(dt: number, camera: THREE.Camera) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      if (p.age >= CRIT.popupTime) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const { position } = p.ship;
      projected.set(position.x, position.y + p.ship.model.barHeight, position.z).project(camera);
      const visible = projected.z <= 1 && Math.abs(projected.x) <= 1.1 && Math.abs(projected.y) <= 1.1;
      p.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const t = p.age / CRIT.popupTime;
      const x = (projected.x * 0.5 + 0.5) * innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * innerHeight - 30 - t * RISE;
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      p.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }
}
