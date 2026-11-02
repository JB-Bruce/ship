import { FEEDBACK } from '../config';

const S = FEEDBACK.screen;
const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

interface Drop {
  x: number;
  y: number;
  r: number;
  /** Vitesse de glissement (px/s), qui augmente : la goutte finit par couler. */
  vy: number;
  life: number;
  age: number;
}

/**
 * Embruns sur l'écran : quand l'étrave plonge dans une vague, une gerbe de gouttes éclabousse la vue ; sous la pluie,
 * des gouttes tombent en continu. Elles glissent, s'étirent et s'effacent. Dessinées à demi-résolution sur une toile
 * 2D posée sur la vue (rien à faire quand il n'y en a pas) ; en vue de loin, bien moins nombreuses.
 */
export class ScreenSpray {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly drops: Drop[] = [];
  private lastPitch = 0;
  private cooldown = 0;
  private rainCarry = 0;
  private dirty = false;

  constructor(parent: HTMLElement) {
    this.canvas.className = 'screen-spray';
    this.ctx = this.canvas.getContext('2d')!;
    parent.appendChild(this.canvas);
  }

  /**
   * `firstPerson` : à la barre ou à pied ; `pitch` : tangage du navire piloté (rad, proue haute positive) ; `speed`
   * (m/s) ; `rain` : 0 à 1 ; `seas` : force de la houle (0 à 1, plus de gerbes par gros temps).
   */
  update(dt: number, firstPerson: boolean, pitch: number, speed: number, rain: number, seas: number) {
    if (dt <= 0) return;
    const factor = firstPerson ? 1 : S.thirdPerson;
    const pitchRate = (pitch - this.lastPitch) / dt;
    this.lastPitch = pitch;
    this.cooldown -= dt;
    // L'étrave plonge : plus la mer est grosse et le navire rapide, plus la gerbe est forte.
    if (speed > S.minSpeed && pitchRate < -S.plunge * (1.4 - seas) && this.cooldown <= 0) {
      this.cooldown = S.cooldown;
      this.splash(Math.round(rand(S.burst) * factor * (0.6 + 0.6 * seas)));
    }
    this.rainCarry += dt * S.rain * rain * factor;
    while (this.rainCarry >= 1) {
      this.rainCarry -= 1;
      this.spawn(Math.random(), Math.random() * 0.9, 0.6);
    }
    this.draw(dt);
  }

  /** Une gerbe : surtout en bas et sur les côtés de l'écran (l'eau vient de devant et d'en bas). */
  private splash(count: number) {
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? rand([0, 0.35]) : rand([0.65, 1]);
      this.spawn(Math.random() < 0.6 ? side : Math.random(), rand([0.35, 1]), 1);
    }
  }

  private spawn(u: number, v: number, sizeFactor: number) {
    if (this.drops.length >= S.max) return;
    this.resize();
    this.drops.push({ x: u * this.canvas.width, y: v * this.canvas.height, r: rand(S.size) * sizeFactor, vy: rand([2, 10]), life: rand(S.life), age: 0 });
  }

  private resize() {
    const w = Math.max(1, Math.round(innerWidth / 2));
    const h = Math.max(1, Math.round(innerHeight / 2));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private draw(dt: number) {
    if (!this.drops.length) {
      if (this.dirty) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.dirty = false;
      return;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age >= d.life) {
        this.drops.splice(i, 1);
        continue;
      }
      d.vy += dt * 18;
      d.y += d.vy * dt;
      const fade = 1 - d.age / d.life;
      const tail = Math.min(d.r * 4, d.vy * 0.5);
      // Une goutte sur la vitre : presque transparente, bord clair en bas (la lumière la traverse), bord sombre en
      // haut, un point de reflet, et une fine traînée mouillée au-dessus quand elle glisse.
      ctx.globalAlpha = 0.07 * fade;
      ctx.fillStyle = '#e8f6fb';
      ctx.fillRect(d.x - d.r * 0.25, d.y - tail, d.r * 0.5, tail);
      ctx.globalAlpha = 0.1 * fade;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(0.6, d.r * 0.18);
      ctx.globalAlpha = 0.45 * fade;
      ctx.strokeStyle = '#f4fbff';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.85, d.r * 0.95, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.globalAlpha = 0.18 * fade;
      ctx.strokeStyle = '#0b2430';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r * 0.9, d.r, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.globalAlpha = 0.6 * fade;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
