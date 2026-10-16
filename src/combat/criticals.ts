import * as THREE from 'three';
import type { ChaseCamera } from '../camera/chaseCamera';
import { BOSS_SINK, CRIT } from '../config';
import { CritFx } from '../fx/critFx';
import type { Effects } from '../fx/effects';
import { FallingSails } from '../fx/fallingSails';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import type { CritKind } from '../ship/shipCrits';
import type { Hud } from '../ui/hud';

const ORDER: readonly CritKind[] = ['magazine', 'fire', 'rudder', 'rigging'];
const point = new THREE.Vector3();

const CRIT_TEXT: Record<CritKind, string> = {
  magazine: '💥 Sainte-barbe !',
  fire: '🔥 Incendie à bord !',
  rudder: '☸ Gouvernail touché !',
  rigging: '⛵ Gréement touché !',
};

/** Ce que les coups critiques montrent et secouent. */
export interface CriticalsWorld {
  readonly container: HTMLElement;
  readonly effects: Effects;
  readonly hud: Hud;
  readonly camera: ChaseCamera;
  readonly scene: THREE.Scene;
  /** Le bateau piloté. */
  leader(): Ship;
  /** Un coup critique vient de toucher `ship` (le jeu lui fait lâcher du butin s'il n'est pas de ta flotte). */
  struck(ship: Ship): void;
}

/**
 * Coups critiques : chaque boulet qui touche un navire à flot a une petite chance d'en provoquer un (CRIT.chance, tirés
 * dans l'ordre, un seul par coup). La réserve de poudre explose tout de suite (le jeu applique les dégâts) ; les autres
 * laissent une avarie (ShipCrits) jusqu'à la réparation en mer. Rien d'écrit au-dessus du navire touché : ce qui se
 * voit (explosion, incendie, voile qui tombe) suffit ; un petit message s'affiche si c'est le tien, la caméra tremble si
 * la poudre saute près de toi.
 */
export class Criticals {
  private readonly fx: CritFx;
  private readonly sails: FallingSails;

  constructor(private readonly world: CriticalsWorld) {
    this.fx = new CritFx(world.effects);
    this.sails = new FallingSails(world.scene);
  }

  update(dt: number, ships: readonly Ship[], waves: Waves) {
    this.fx.update(dt, ships);
    this.sails.update(dt, waves);
  }

  /** Tire un éventuel coup critique sur `ship`. Renvoie lequel, ou null. */
  strike(ship: Ship): CritKind | null {
    if (!ship.alive) return null;
    for (const kind of ORDER) {
      if (Math.random() >= CRIT.chance[kind]) continue;
      const { effects, hud, camera } = this.world;
      if (kind === 'magazine') {
        this.fx.magazine(ship, deckPoint(ship));
      } else {
        if (!ship.crits.inflict(kind, ship.model.root, ship.model.fireSpots.length)) continue;
        // Une voile qui tombe : éclats de bois, et la voile qui s'abat à l'eau en tournoyant.
        if (kind === 'rigging' && ship.crits.lastDropped) {
          effects.impact(deckPoint(ship));
          this.sails.drop(ship.crits.lastDropped);
        }
      }
      this.world.struck(ship);
      const leader = this.world.leader();
      // Sur ton navire : la sainte-barbe au centre, les autres avaries en petit message.
      if (ship === leader) {
        if (kind === 'magazine') hud.message(CRIT_TEXT[kind], 2.5, true);
        else hud.toast(CRIT_TEXT[kind], 3, 'danger');
      }
      if (kind === 'magazine' && ship.distanceTo(leader) < BOSS_SINK.shakeRange) camera.shake(CRIT.magazineShake);
      return kind;
    }
    return null;
  }
}

/** Un foyer du pont du navire, en coordonnées monde. */
function deckPoint(ship: Ship): THREE.Vector3 {
  const spots = ship.model.fireSpots;
  if (!spots.length) return point.copy(ship.position).setY(ship.position.y + 1.5);
  ship.model.root.updateMatrixWorld();
  return point.copy(spots[Math.floor(Math.random() * spots.length)]).applyMatrix4(ship.model.root.matrixWorld);
}
