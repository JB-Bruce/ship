import type * as THREE from 'three';
import { DECK_CREW } from '../config';
import { isHostile, type Ship } from '../ship/ship';
import { SailorMeshes } from './sailorMeshes';
import { hasDeckNav } from './deckNav';
import { ShipCrew } from './shipCrew';

/** Intervalle entre deux vérifications « un ennemi est-il proche ? » pour un navire (s). */
const COMBAT_CHECK = 0.5;

/**
 * Équipages animés de tous les navires pontés (ceux dont le modèle a un DeckPlan). Seuls les navires proches de la
 * caméra et hors de la brume sont animés et dessinés ; un équipage est créé à la première approche et oublié quand son
 * navire quitte le monde. Tous les marins sont dessinés en quelques lots partagés (SailorMeshes).
 */
export class DeckCrew {
  private readonly meshes = new SailorMeshes(DECK_CREW.maxSailors);
  private readonly crews = new Map<Ship, ShipCrew>();
  /** Un ennemi est-il proche du navire (vérifié de temps en temps) : prochaine vérification et résultat. */
  private readonly combat = new Map<Ship, { timer: number; value: boolean }>();
  private frame = 0;
  /** Navire dont on ne dessine pas le barreur : on regarde par ses yeux (vue du barreur). */
  hiddenHelm: Ship | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly splash: (x: number, y: number, z: number) => void,
  ) {
    scene.add(this.meshes.group);
  }

  update(dt: number, camera: THREE.Camera, ships: readonly Ship[]) {
    this.frame++;
    this.meshes.begin();
    // Calculer le pont d'un nouveau type de navire coûte quelques dizaines de ms : un seul par image.
    let built = false;
    const range = DECK_CREW.drawDistance * DECK_CREW.drawDistance;
    for (const ship of ships) {
      if (!ship.model.deckPlan) continue;
      const near = ship.model.root.visible && ship.position.distanceToSquared(camera.position) < range;
      let crew = this.crews.get(ship);
      if (!crew) {
        if (!near) continue;
        if (!hasDeckNav(ship.model.deckPlan)) {
          if (built) continue;
          built = true;
        }
        crew = new ShipCrew(ship, this.splash);
        this.crews.set(ship, crew);
      }
      crew.lastSeen = this.frame;
      if (!near) continue;
      crew.update(dt, this.enemyNear(ship, ships, dt));
      ship.model.root.updateMatrixWorld();
      crew.draw(this.meshes, ship === this.hiddenHelm);
    }
    this.meshes.end();
    this.crews.forEach(this.forget);
  }

  /** Oublie l'équipage d'un navire qui a quitté le monde (coulé, vendu, disparu au large). */
  private readonly forget = (crew: ShipCrew, ship: Ship) => {
    if (crew.lastSeen === this.frame) return;
    this.crews.delete(ship);
    this.combat.delete(ship);
  };

  /** Un ennemi à flot est-il à moins de DECK_CREW.combatRange du navire ? */
  private enemyNear(ship: Ship, ships: readonly Ship[], dt: number): boolean {
    let state = this.combat.get(ship);
    if (!state) this.combat.set(ship, (state = { timer: 0, value: false }));
    state.timer -= dt;
    if (state.timer > 0) return state.value;
    state.timer = COMBAT_CHECK;
    state.value = false;
    const range = DECK_CREW.combatRange * DECK_CREW.combatRange;
    for (const other of ships) {
      if (state.value) break;
      if (other.alive && isHostile(ship, other) && other.position.distanceToSquared(ship.position) < range) state.value = true;
    }
    return state.value;
  }
}
