import type * as THREE from 'three';
import { CRIT } from '../config';

/** Coups critiques : réserve de poudre, incendie, gouvernail, gréement. */
export type CritKind = 'magazine' | 'fire' | 'rudder' | 'rigging';

/**
 * Avaries d'un navire après un coup critique : chacune garde le temps de réparation qu'il lui faut encore (0 = intacte).
 * Elles tiennent jusqu'à la réparation en mer, qui éteint d'abord l'incendie puis répare gouvernail et gréement.
 * Gréement touché : une voile du modèle disparaît, jusqu'à la réparation ; d'autres coups peuvent en abattre d'autres,
 * tant qu'il en reste au moins la moitié (CRIT.minSailsLeft).
 */
export class ShipCrits {
  fire = 0;
  rudder = 0;
  rigging = 0;
  /** Foyer (index dans ShipModel.fireSpots) où brûle l'incendie. */
  fireSpot = 0;
  private readonly droppedSails: THREE.Object3D[] = [];

  get any(): boolean {
    return this.fire > 0 || this.rudder > 0 || this.rigging > 0;
  }

  get speedFactor(): number {
    return 1 - Math.min(CRIT.riggingMaxLoss, CRIT.riggingSpeedLoss * this.droppedSails.length);
  }

  get turnFactor(): number {
    return this.rudder > 0 ? 1 - CRIT.rudderTurnLoss : 1;
  }

  /** Pictogrammes des avaries en cours (« 🔥⛵ »), ou chaîne vide. */
  get icons(): string {
    return `${this.fire > 0 ? '🔥' : ''}${this.rudder > 0 ? '☸' : ''}${this.rigging > 0 ? '⛵' : ''}`;
  }

  /** Voiles abattues en ce moment. */
  get sailsDown(): number {
    return this.droppedSails.length;
  }

  /**
   * Une avarie (pas la réserve de poudre, instantanée). Renvoie false si elle est déjà là (le gréement peut perdre une
   * voile de plus), ou impossible (plus assez de voiles). `root` : le modèle du navire, où l'on choisit la voile qui tombe ; `spots` : ses foyers.
   */
  inflict(kind: Exclude<CritKind, 'magazine'>, root: THREE.Object3D, spots: number): boolean {
    if (kind === 'rigging') {
      const sails: THREE.Object3D[] = [];
      root.traverse((o) => {
        const material = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (o.visible && material && !Array.isArray(material) && material.userData.sail) sails.push(o);
      });
      // Toujours au moins la moitié des voiles en place (abattues comprises dans le total).
      const total = sails.length + this.droppedSails.length;
      if (sails.length - 1 < total * CRIT.minSailsLeft) return false;
      const sail = sails[Math.floor(Math.random() * sails.length)];
      sail.visible = false;
      this.droppedSails.push(sail);
    } else if (this[kind] > 0) return false;
    if (kind === 'fire') this.fireSpot = Math.floor(Math.random() * Math.max(1, spots));
    this[kind] = CRIT.repairTime[kind];
    return true;
  }

  /** Avance la réparation (`repairing` : la réparation en mer a commencé). Renvoie les dégâts de l'incendie (fraction de vie max). */
  update(dt: number, repairing: boolean): number {
    const burn = this.fire > 0 ? CRIT.fireDamage * dt : 0;
    if (!repairing) return burn;
    if (this.fire > 0) {
      this.fire = Math.max(0, this.fire - dt);
      return burn;
    }
    this.rudder = Math.max(0, this.rudder - dt);
    if (this.rigging > 0) {
      this.rigging = Math.max(0, this.rigging - dt);
      if (this.rigging === 0) this.restoreSail();
    }
    return 0;
  }

  /** Navire remis à flot : plus aucune avarie. */
  reset() {
    this.fire = this.rudder = this.rigging = 0;
    this.restoreSail();
  }

  private restoreSail() {
    for (const sail of this.droppedSails) sail.visible = true;
    this.droppedSails.length = 0;
  }
}
