import * as THREE from 'three';
import { STORY_SCENES } from '../config';
import type { ChaseCamera } from '../camera/chaseCamera';
import type { SaveManager } from '../save/saveManager';
import { MainMenu } from '../ui/mainMenu/mainMenu';
import { ParchmentMenu } from '../ui/parchmentMenu';
import { showWelcome } from '../ui/welcomeScreen';
import type { DayCycle } from '../world/dayCycle';
import type { StoryDirector } from './storyDirector';

export interface GameStartDeps {
  container: HTMLElement;
  saves: SaveManager;
  camera: ChaseCamera;
  dayCycle: DayCycle;
  story: StoryDirector;
  /** Ouvre le menu des paramètres (Options du menu principal). */
  openOptions(): void;
}

type View = (typeof STORY_SCENES)['menuView'];
const focus = (v: View) => ({ point: new THREE.Vector3(0, v.height, 0), yaw: v.yaw, pitch: v.pitch, distance: v.distance });

/**
 * Le début d'une partie. Partie chargée : la petite carte « Larguer les amarres » (le son demande un geste), puis la
 * barre. Sinon, le menu principal sur le monde en direct (la caméra tourne autour de la chaloupe) ; « Nouvelle partie »
 * (ou une nouvelle partie demandée en jeu, qui recharge la page) joue la scène d'ouverture : l'aube sur le quai de la
 * Tortue, la caméra sur le côté du navire, et Kerdal qui parle. Tant que l'un ou l'autre dure (`busy`), on ne pilote
 * pas et les menus se taisent (`ParchmentMenu.locked`).
 */
export class GameStart {
  private readonly menu: MainMenu;
  private inOpening = false;

  constructor(
    private readonly d: GameStartDeps,
    loaded: boolean,
  ) {
    this.menu = new MainMenu(d.container, {
      newGame: () => this.newGame(),
      saves: () => d.saves.entries(),
      load: (id) => d.saves.load(id),
      options: () => {
        this.menu.dimmed = true;
        ParchmentMenu.locked = false;
        d.openOptions();
      },
    });
    if (loaded) showWelcome(d.container, () => d.camera.firstPerson.capture());
    else if (d.saves.freshStart) void this.opening();
    else this.showMenu();
  }

  /** Menu principal ou scène d'ouverture en cours : pas de barre, pas de touches du jeu. */
  get busy(): boolean {
    return this.menu.active || this.inOpening || this.d.story.talking;
  }

  /**
   * Tous les menus parchemin viennent de se fermer. Renvoie true si c'est le menu principal qui reprend (Options
   * refermées) : la souris n'est alors pas capturée.
   */
  menusClosed(): boolean {
    if (!this.menu.active) return false;
    this.menu.dimmed = false;
    ParchmentMenu.locked = true;
    return true;
  }

  private showMenu() {
    ParchmentMenu.locked = true;
    this.d.camera.showcase.look(focus(STORY_SCENES.menuView));
    this.d.camera.showcaseTurning = true;
    this.menu.show();
  }

  private newGame() {
    this.menu.hide();
    void this.opening();
  }

  private async opening() {
    const { camera, dayCycle, story } = this.d;
    this.inOpening = true;
    ParchmentMenu.locked = true;
    dayCycle.setHour(STORY_SCENES.openingHour);
    camera.showcaseTurning = false;
    camera.showcase.look(focus(STORY_SCENES.openingView));
    await new Promise((resolve) => setTimeout(resolve, STORY_SCENES.openingDelay * 1000));
    await story.opening();
    camera.showcase.close();
    this.inOpening = false;
    ParchmentMenu.locked = false;
    camera.firstPerson.capture();
  }
}
