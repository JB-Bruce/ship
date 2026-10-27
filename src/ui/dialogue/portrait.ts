import * as THREE from 'three';
import { DIALOGUE } from '../../config';
import type { CharacterLook } from '../../story/dialogueTypes';
import { buildBust, type Bust } from './portraitBust';

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Le portrait de celui qui parle : son buste en 3D, dessiné dans sa propre petite toile (un moteur de rendu à part,
 * créé à la première conversation), qui respire, tourne un peu la tête, cligne des yeux et remue la bouche tant que
 * le texte s'écrit. La boucle ne tourne que pendant une conversation.
 */
export class Portrait {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(DIALOGUE.portrait.fov, DIALOGUE.portrait.width / DIALOGUE.portrait.height, 0.1, 20);
  private bust: Bust | null = null;
  private frame = 0;
  private last = 0;
  private time = 0;
  private blink = rand(DIALOGUE.blink);
  talking = false;

  constructor() {
    this.canvas.className = 'dialogue-portrait';
    const p = DIALOGUE.portrait;
    this.camera.position.set(...p.camera);
    this.camera.lookAt(0, p.lookAt, 0);
    this.scene.add(new THREE.HemisphereLight(0xffe8c8, 0x3a2a1c, 1.1));
    const key = new THREE.DirectionalLight(0xffd9a8, 1.6);
    key.position.set(-1.5, 2, 2.5);
    const rim = new THREE.DirectionalLight(0x9ab8d8, 0.8);
    rim.position.set(2, 1.5, -2);
    this.scene.add(key, rim);
  }

  /** Montre un autre personnage (son buste est refait). */
  show(look: CharacterLook) {
    if (this.bust) {
      this.scene.remove(this.bust.group);
      this.bust.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.bust = buildBust(look);
    this.scene.add(this.bust.group);
  }

  start() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setSize(DIALOGUE.portrait.width, DIALOGUE.portrait.height, false);
    }
    if (this.frame) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop);
      this.animate(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.renderer!.render(this.scene, this.camera);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private animate(dt: number) {
    const b = this.bust;
    if (!b) return;
    const a = DIALOGUE.idle;
    this.time += dt;
    const t = this.time;
    b.group.scale.y = 1 + Math.sin(t * a.breath) * a.breathAmount;
    b.head.rotation.y = Math.sin(t * a.turn) * a.turnAmount;
    b.head.rotation.x = Math.sin(t * a.nod) * a.nodAmount;
    b.mouth.scale.y = this.talking ? 1 + Math.abs(Math.sin(t * a.talk)) * a.talkAmount : 1;
    this.blink -= dt;
    const closed = this.blink < 0;
    for (const eye of b.eyes) eye.scale.y = closed ? 0.15 : 1;
    if (this.blink < -a.blinkTime) this.blink = rand(DIALOGUE.blink);
  }
}
