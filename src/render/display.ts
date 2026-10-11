import * as THREE from 'three';
import { GRAPHICS, type GraphicsSettings } from '../config';
import { DynamicResolution } from './dynamicResolution';

/** Au-delà de cet intervalle entre deux images (s), le jeu était caché (Alt+Tab, onglet) : les mesures sont faussées. */
const STALL = 0.25;

/**
 * L'affichage : le moteur de rendu WebGL et sa toile, dans un conteneur fixe (la caméra y écoute la souris, même quand
 * la toile change). Gère la résolution (choisie × échelle dynamique, plafonnée à la densité de l'écran), l'anticrénelage
 * (qui demande de recréer le moteur), la limite d'images par seconde, le compteur d'images et la précompilation des
 * shaders (pas d'à-coup à la première apparition d'un effet).
 */
export class Display {
  renderer: THREE.WebGLRenderer;
  /** Conteneur de la toile, qui ne change jamais. */
  readonly viewport = document.createElement('div');
  /** Images affichées par seconde (mesurées sur la dernière demi-seconde). */
  fps = 0;
  private settings: GraphicsSettings;
  private dynamic: DynamicResolution;
  private loop: ((time: number) => void) | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  /** Prochaine image autorisée par la limite d'images (ms), dernière image affichée. */
  private nextFrame = 0;
  private lastFrame = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  /** La taille de la toile est à revoir, juste avant la prochaine image. */
  private resizePending = false;

  constructor(container: HTMLElement, settings: GraphicsSettings) {
    this.settings = { ...settings };
    this.viewport.className = 'viewport';
    container.appendChild(this.viewport);
    this.renderer = this.createRenderer(settings.antialias);
    this.dynamic = new DynamicResolution(this.renderer.getContext() as WebGL2RenderingContext);
    this.applySize();
  }

  /** Lance la boucle : `loop` reçoit l'heure (ms) de chaque image affichée. */
  start(scene: THREE.Scene, camera: THREE.Camera, loop: (time: number) => void) {
    this.scene = scene;
    this.camera = camera;
    this.loop = loop;
    this.precompile();
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  /** Nouveaux réglages : résolution, limite d'images, résolution dynamique, et l'anticrénelage (moteur recréé). */
  apply(settings: GraphicsSettings) {
    const antialiasChanged = settings.antialias !== this.settings.antialias;
    this.settings = { ...settings };
    if (!settings.dynamicResolution) this.dynamic.scale = 1;
    if (antialiasChanged) this.recreate();
    this.resizePending = true;
  }

  /** Rendu principal de l'image (mesuré pour la résolution dynamique). */
  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.settings.dynamicResolution) this.dynamic.begin();
    this.renderer.render(scene, camera);
    if (this.settings.dynamicResolution) this.dynamic.end();
  }

  /** La fenêtre a changé de taille : la toile suivra juste avant la prochaine image (voir tick). */
  resize() {
    this.resizePending = true;
  }

  /** Pixels de rendu par pixel d'écran : la résolution choisie (jamais au-delà de la densité de l'écran) × l'échelle dynamique. */
  get pixelRatio(): number {
    return Math.min(this.settings.resolution, maxResolution()) * this.dynamic.scale;
  }

  private tick(time: number) {
    // Limite d'images : on saute les rafraîchissements de l'écran en trop.
    const limit = this.settings.fpsLimit;
    if (limit > 0) {
      if (time < this.nextFrame - 1) return;
      this.nextFrame = Math.max(this.nextFrame + 1000 / limit, time);
    }
    const elapsed = this.lastFrame ? (time - this.lastFrame) / 1000 : 0;
    this.lastFrame = time;
    // Retour après une absence (Alt+Tab, onglet caché) : les images lentes de la reprise ne disent rien du jeu.
    if (elapsed > STALL) this.dynamic.forget();
    else if (this.settings.dynamicResolution) {
      const budget = 1000 / (limit || GRAPHICS.dynamic.targetFps);
      if (this.dynamic.update(elapsed, budget)) this.resizePending = true;
    }
    // La toile change de taille avant de dessiner l'image, jamais après : la redimensionner l'efface, et c'est l'image
    // vide qui s'afficherait (un éclair).
    if (this.resizePending) {
      this.resizePending = false;
      this.applySize();
    }
    this.countFps(elapsed);
    this.loop?.(time);
  }

  private countFps(elapsed: number) {
    this.fpsFrames++;
    this.fpsTime += elapsed;
    if (this.fpsTime < 0.5) return;
    this.fps = Math.round(this.fpsFrames / this.fpsTime);
    this.fpsFrames = 0;
    this.fpsTime = 0;
  }

  private applySize() {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  private createRenderer(antialias: boolean): THREE.WebGLRenderer {
    // « high-performance » : sur un portable à deux puces graphiques, la plus puissante.
    const renderer = new THREE.WebGLRenderer({ antialias, powerPreference: 'high-performance' });
    this.viewport.appendChild(renderer.domElement);
    return renderer;
  }

  /** L'anticrénelage ne se change qu'en recréant le moteur de rendu (et sa toile) ; tout est renvoyé à la carte graphique. */
  private recreate() {
    const old = this.renderer;
    old.setAnimationLoop(null);
    this.dynamic.dispose();
    old.domElement.remove();
    old.dispose();
    old.forceContextLoss();
    this.renderer = this.createRenderer(this.settings.antialias);
    this.dynamic = new DynamicResolution(this.renderer.getContext() as WebGL2RenderingContext);
    this.applySize();
    if (this.loop) {
      this.precompile();
      this.renderer.setAnimationLoop((time) => this.tick(time));
    }
  }

  /**
   * Compile d'avance les shaders de tout ce qui est dans la scène, même caché (pluie, éclairs…) : sinon le premier
   * affichage d'un effet fige le jeu le temps de sa compilation.
   */
  private precompile() {
    const { scene, camera } = this;
    if (!scene || !camera) return;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
  }
}

/** Densité de l'écran : au-delà, on dessinerait plus de pixels que l'écran n'en montre. */
export function maxResolution(): number {
  return Math.max(1, devicePixelRatio);
}

/** Taille de l'image dessinée (pixels) pour une résolution donnée. */
export function renderSize(resolution: number): { width: number; height: number } {
  const r = Math.min(resolution, maxResolution());
  return { width: Math.round(innerWidth * r), height: Math.round(innerHeight * r) };
}
