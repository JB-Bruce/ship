import * as THREE from 'three';
import { PLAYER } from '../config';
import type { FirstPersonView } from '../camera/firstPersonView';
import type { DeckCrew } from '../deckCrew/deckCrew';
import { deckNavOf, type DeckNav } from '../deckCrew/deckNav';
import type { MastTop, TopRoute } from '../deckCrew/mastTops';
import type { Shroud } from '../deckCrew/shrouds';
import type { DeckPlan } from '../ship/deckPlan';
import type { Ship } from '../ship/ship';
import { ParchmentMenu } from '../ui/parchmentMenu';
import { footingOf } from './deckFooting';
import { PlayerBody, type FootInput } from './playerBody';

// KeyboardEvent.code : ZQSD en AZERTY = WASD en QWERTY.
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];
const JUMP = 'Space';

/**
 * Le joueur peut quitter la barre (E) et se promener sur le pont de son navire, à la première personne : Z/Q/S/D
 * pour marcher (dans la direction du regard), Maj pour courir, Espace pour sauter ; escaliers et échelles se prennent en
 * marchant, E près d'un hauban y fait grimper (Z monte, S descend) : jusque dans la hune s'il y en a une, d'où E au
 * bord fait redescendre par le hauban (ou l'on saute vers le pont) ; E devant la roue reprend la barre. Pendant ce
 * temps, un matelot tient la barre (cap droit, même voilure). Seulement sur un navire ponté (qui a un plan de pont).
 * Le navire coule, change (autre barre prise) ou est reconstruit : retour à la barre.
 */
export class OnFoot {
  private body: PlayerBody | null = null;
  private ship: Ship | null = null;
  private plan: DeckPlan | null = null;
  private nav: DeckNav | null = null;
  private readonly held = new Set<string>();
  private jumpQueued = false;
  private readonly eyePoint = new THREE.Vector3();
  private readonly input: FootInput = { moveX: 0, moveZ: 0, run: false, jump: false, forward: 0 };

  constructor(
    private readonly view: FirstPersonView,
    private readonly crew: DeckCrew,
    private readonly say: (text: string) => void,
  ) {
    window.addEventListener('keydown', (e) => {
      // Dans un menu (le jeu est en pause), les touches ne font pas marcher.
      if (!this.body || ParchmentMenu.anyOpen() || ParchmentMenu.locked) return;
      if (e.code === JUMP) {
        e.preventDefault();
        if (!e.repeat) this.jumpQueued = true;
      }
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Le joueur se promène-t-il (pas à la barre) ? */
  get walking(): boolean {
    return this.body !== null;
  }

  /**
   * E : quitter la barre ; à pied, reprendre la barre devant la roue, grimper dans un hauban ou en redescendre (aussi
   * depuis la hune, au bord, du côté d'un hauban).
   */
  interact(leader: Ship) {
    const body = this.body;
    if (!body) return this.leaveHelm(leader);
    if (body.climb?.shroud) return body.leaveClimb();
    if (body.climb) return;
    const down = this.nearTopRoute();
    if (down) return body.descend(down.top, down.route);
    if (this.nearHelm()) return this.takeHelm();
    const shroud = this.nearShroud();
    if (shroud) body.startShroud(shroud);
  }

  /** V : à la barre, passer de la première personne à la vue de loin et retour ; à pied, elle reste à la première personne. */
  toggleView() {
    if (this.body) this.say('La vue de loin ne se prend qu’à la barre');
    else this.view.setActive(!this.view.active);
  }

  /** Commande E proposée à l'écran (null = rien à faire). */
  prompt(leader: Ship): string | null {
    const body = this.body;
    if (!body) return leader.alive && leader.model.deckPlan ? 'Quitter la barre' : null;
    if (body.climb?.shroud) return 'Redescendre du hauban';
    if (body.climb) return null;
    if (this.nearTopRoute()) return 'Redescendre par le hauban';
    if (this.nearHelm()) return 'Prendre la barre';
    return this.nearShroud() ? 'Grimper au hauban' : null;
  }

  /** Revenir à la barre (navire changé, coulé…). */
  takeHelm() {
    this.body = null;
    this.ship = null;
    this.crew.player = null;
    this.held.clear();
  }

  update(dt: number, leader: Ship) {
    if (!this.body) return;
    const ship = this.ship!;
    if (ship !== leader || !ship.alive || !ship.model.deckPlan) return this.takeHelm();
    // Navire reconstruit (allongé) : nouveau pont, on reprend pied au plus près.
    if (ship.model.deckPlan !== this.plan) {
      const p = this.body.position.clone();
      this.board(ship);
      this.body!.place(p.x, p.y, p.z);
    }
    const body = this.body!;
    this.readInput();
    body.update(dt, this.input);
    this.input.jump = false;
    this.crew.player = { ship, position: body.position };
  }

  /** Les yeux du joueur à pied (repère du navire), ou null à la barre. */
  footEye(): THREE.Vector3 | null {
    return this.body ? this.body.eye(this.eyePoint) : null;
  }

  private leaveHelm(ship: Ship) {
    const plan = ship.model.deckPlan;
    if (!ship.alive || !plan) return;
    this.board(ship);
    const helm = plan.helm;
    // À côté de la roue, en arrière : le barreur reprend sa place.
    this.body!.place(helm.x, helm.y, helm.z - PLAYER.leaveBack, { x: helm.x, z: helm.z, r: PLAYER.helmClear });
    this.view.setActive(true);
  }

  /** Monte à bord du pont de `ship` (sa grille, ses appuis). */
  private board(ship: Ship) {
    const plan = ship.model.deckPlan!;
    const nav = deckNavOf(ship.model, plan);
    this.ship = ship;
    this.plan = plan;
    this.nav = nav;
    this.body = new PlayerBody(nav, footingOf(nav));
  }

  private readInput() {
    const held = (codes: readonly string[]) => codes.some((c) => this.held.has(c));
    const forward = Number(held(FORWARD)) - Number(held(BACK));
    const right = Number(held(RIGHT)) - Number(held(LEFT));
    // Repère du navire : regard (sin, cos) ; droite (tribord) = (-cos, sin).
    const yaw = this.view.heading;
    let x = Math.sin(yaw) * forward - Math.cos(yaw) * right;
    let z = Math.cos(yaw) * forward + Math.sin(yaw) * right;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    Object.assign(this.input, { moveX: x, moveZ: z, run: held(RUN), forward, jump: this.input.jump || this.jumpQueued });
    this.jumpQueued = false;
  }

  private nearHelm(): boolean {
    const helm = this.plan?.helm;
    const p = this.body?.position;
    return !!helm && !!p && Math.hypot(p.x - helm.x, p.z - helm.z) < PLAYER.helmReach && Math.abs(p.y - helm.y) < PLAYER.stepUp;
  }

  /** Debout dans une hune, au bord, du côté d'un hauban : la montée par où redescendre. */
  private nearTopRoute(): { top: MastTop; route: TopRoute } | null {
    const top = this.body?.standingTop();
    if (!top) return null;
    const p = this.body!.position;
    let best: TopRoute | null = null;
    let bestD: number = PLAYER.topReach;
    for (const route of top.routes) {
      const rim = route.points[route.points.length - 1];
      const d = Math.hypot(p.x - rim.x, p.z - rim.z);
      if (d < bestD) {
        best = route;
        bestD = d;
      }
    }
    return best ? { top, route: best } : null;
  }

  private nearShroud(): Shroud | null {
    const nav = this.nav;
    const p = this.body?.position;
    if (!nav || !p || !this.body!.grounded) return null;
    let best: Shroud | null = null;
    let bestD: number = PLAYER.shroudRange;
    for (const h of nav.shrouds) {
      const d = Math.hypot(p.x - nav.x(h.node), p.z - nav.z(h.node));
      if (d < bestD && Math.abs(p.y - nav.y(h.node)) < PLAYER.stepUp) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }
}
