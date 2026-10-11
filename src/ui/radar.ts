import { RADAR } from '../config';
import type { Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import type { FishSchool } from '../world/fishSchools';
import { ISLAND_LIST, type Island } from '../world/island';
import type { Wind } from '../world/wind';

const COLORS = {
  background: 'rgba(6, 28, 38, 0.72)',
  grid: 'rgba(120, 230, 200, 0.22)',
  sweep: 'rgba(120, 230, 200, 0.14)',
  sweepLine: 'rgba(120, 230, 200, 0.6)',
  player: '#f2e8d0',
  hunting: '#ff4a3a',
  patrolling: '#ffae3a',
  fleeing: '#c9a0ff',
  boss: '#ff2a1a',
  ally: '#6fe08a',
  fish: '#8fe3ff',
  merchant: '#f2c94c',
  pirate: '#4a9bff',
  wind: 'rgba(205, 238, 255, 0.9)',
  land: 'rgba(214, 190, 128, 0.85)',
  coast: 'rgba(250, 240, 210, 0.9)',
  port: '#ffffff',
  north: 'rgba(242, 232, 208, 0.85)',
};

/**
 * Radar circulaire qui tourne avec le bateau : le haut = devant toi.
 * Vert = navire de ta flotte. Rouge = ennemi qui te chasse, orange = en patrouille, violet = en fuite, gros point
 * rouge cerclé = boss, poisson bleu = banc de poissons. Le butin n'y figure pas (il encombrait le radar).
 * Hors de portée : point pâle au bord, dans sa direction. La portée grandit près de l'île avec le phare.
 * La flèche claire montre où souffle le vent ; la légende au-dessus donne sa force et son effet sur ta vitesse.
 */
export class Radar {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly windLabel: HTMLElement;
  private lastWindText = '';
  private sweep = 0;
  /** Temps écoulé depuis le dernier dessin (s). */
  private sinceDraw = Infinity;
  /** Portée actuelle (m) : plus grande près de l'île quand le phare est amélioré. */
  range = RADAR.range;

  constructor(parent: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.className = 'radar';
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = canvas.height = RADAR.size * dpr;
    canvas.style.width = canvas.style.height = `${RADAR.size}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.windLabel = document.createElement('div');
    this.windLabel.className = 'radar-wind';
    parent.append(canvas, this.windLabel);
  }

  /** `ships` : tous les bateaux (les alliés y sont repérés par leur camp). */
  /** `escorts` : navires alliés escortés (en jaune) ; les autres alliés hors de ta flotte sont des pirates (en bleu). */
  update(dt: number, player: Ship, enemies: readonly Enemy[], wind: Wind, ships: readonly Ship[], schools: readonly FishSchool[], escorts: readonly Ship[]) {
    // Redessiner un dessin 2D à chaque image coûte cher : RADAR.refreshRate fois par seconde suffit.
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / RADAR.refreshRate) return;
    dt = Math.min(this.sinceDraw, 0.25);
    this.sinceDraw = 0;
    const ctx = this.ctx;
    const c = RADAR.size / 2;
    const r = c - 3;
    ctx.clearRect(0, 0, RADAR.size, RADAR.size);

    ctx.fillStyle = COLORS.background;
    this.circle(c, c, r);
    ctx.fill();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (const k of [1 / 3, 2 / 3, 1]) {
      this.circle(c, c, r * k);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c - r, c);
    ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r);
    ctx.lineTo(c, c + r);
    ctx.stroke();

    for (const island of ISLAND_LIST) this.drawIsland(c, r, player, island);

    // Balayage : un secteur qui s'estompe derrière la ligne.
    this.sweep = (this.sweep + dt * RADAR.sweepSpeed) % (Math.PI * 2);
    ctx.fillStyle = COLORS.sweep;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, this.sweep - 0.7, this.sweep);
    ctx.fill();
    ctx.strokeStyle = COLORS.sweepLine;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(this.sweep) * r, c + Math.sin(this.sweep) * r);
    ctx.stroke();

    // Monde → radar : avant du bateau vers le haut, bâbord vers la gauche.
    const sin = Math.sin(player.heading);
    const cos = Math.cos(player.heading);
    const scale = r / this.range;

    ctx.fillStyle = COLORS.north;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', c + sin * (r - 10), c - cos * (r - 10));

    // Monde → radar, ramené sur le bord si hors de portée.
    const place = (wx: number, wz: number) => {
      const dx = wx - player.position.x;
      const dz = wz - player.position.z;
      let x = -(dx * cos - dz * sin) * scale;
      let y = -(dx * sin + dz * cos) * scale;
      const d = Math.hypot(x, y);
      const outside = d > r - 5;
      if (outside) {
        x *= (r - 5) / d;
        y *= (r - 5) / d;
      }
      ctx.globalAlpha = outside ? 0.45 : 1;
      return { x: c + x, y: c + y, outside };
    };

    ctx.fillStyle = COLORS.fish;
    for (const school of schools) {
      if (school.diving) continue;
      const p = place(school.x, school.z);
      this.fish(p.x, p.y);
    }
    for (const ship of ships) {
      if (ship === player || ship.faction === 'enemy' || !ship.alive) continue;
      // Vert : ta flotte ; jaune : marchands alliés (escorté ou de tes îles) ; bleu : pirate allié.
      ctx.fillStyle = ship.faction === 'player' ? COLORS.ally : escorts.includes(ship) ? COLORS.merchant : COLORS.pirate;
      const p = place(ship.position.x, ship.position.z);
      this.circle(p.x, p.y, p.outside ? 3 : 4);
      ctx.fill();
    }
    for (const { ship, ai, boss } of enemies) {
      // Un boss caché dans la brume (harcèlement) n'apparaît pas.
      if (!ship.alive || ai.hidden) continue;
      const p = place(ship.position.x, ship.position.z);
      ctx.fillStyle = boss ? COLORS.boss : ai.state === 'patrol' ? COLORS.patrolling : ai.state === 'flee' ? COLORS.fleeing : COLORS.hunting;
      this.circle(p.x, p.y, boss ? 6.5 : p.outside ? 3 : 4.5);
      ctx.fill();
      if (!boss) continue;
      ctx.strokeStyle = '#1a0505';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;

    this.drawWind(c, r, player, wind);

    // Le joueur, au centre, pointe toujours vers le haut.
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(c, c - 7);
    ctx.lineTo(c + 5, c + 5);
    ctx.lineTo(c, c + 2);
    ctx.lineTo(c - 5, c + 5);
    ctx.closePath();
    ctx.fill();
  }

  /** Une île (côte dessinée point par point) et son port, découpés au bord du radar. */
  private drawIsland(c: number, r: number, player: Ship, island: Island) {
    const ctx = this.ctx;
    const sin = Math.sin(player.heading);
    const cos = Math.cos(player.heading);
    const scale = r / this.range;
    const dxIsland = island.cx - player.position.x;
    const dzIsland = island.cz - player.position.z;
    if (Math.hypot(dxIsland, dzIsland) > this.range + island.outerRadius) return;
    const toX = (dx: number, dz: number) => c - (dx * cos - dz * sin) * scale;
    const toY = (dx: number, dz: number) => c - (dx * sin + dz * cos) * scale;
    ctx.save();
    this.circle(c, c, r - 1);
    ctx.clip();
    ctx.beginPath();
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const rc = island.coastRadius(t);
      const dx = dxIsland + Math.sin(t) * rc;
      const dz = dzIsland + Math.cos(t) * rc;
      if (i === 0) ctx.moveTo(toX(dx, dz), toY(dx, dz));
      else ctx.lineTo(toX(dx, dz), toY(dx, dz));
    }
    ctx.closePath();
    ctx.fillStyle = COLORS.land;
    ctx.fill();
    ctx.strokeStyle = COLORS.coast;
    ctx.stroke();
    const px = island.port.x - player.position.x;
    const pz = island.port.z - player.position.z;
    ctx.fillStyle = COLORS.port;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚓', toX(px, pz), toY(px, pz));
    ctx.restore();
  }

  /** Flèche du vent, côté d'où il vient, pointant vers où il va ; plus longue quand il forcit. */
  private drawWind(c: number, r: number, player: Ship, wind: Wind) {
    const ctx = this.ctx;
    const relative = wind.direction - player.heading;
    // Direction du vent à l'écran (le radar tourne avec le bateau : vent de dos = flèche vers le haut).
    const wx = -Math.sin(relative);
    const wy = -Math.cos(relative);
    const length = 14 + 18 * wind.strength;
    const tailX = c - wx * (r - 8);
    const tailY = c - wy * (r - 8);
    const headX = tailX + wx * length;
    const headY = tailY + wy * length;
    ctx.strokeStyle = ctx.fillStyle = COLORS.wind;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headX + wx * 7, headY + wy * 7);
    ctx.lineTo(headX - wy * 5, headY + wx * 5);
    ctx.lineTo(headX + wy * 5, headY - wx * 5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;

    const effect = Math.round((wind.speedFactor(player.heading) - 1) * 100);
    const text = `Vent ${wind.knots} nœuds · ${effect >= 0 ? '+' : '−'}${Math.abs(effect)} % de vitesse`;
    if (text !== this.lastWindText) {
      this.lastWindText = text;
      this.windLabel.textContent = text;
    }
  }

  /** Petit poisson (banc), queue à gauche. */
  private fish(x: number, y: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.moveTo(x - 1.5, y);
    ctx.lineTo(x - 5, y - 3);
    ctx.lineTo(x - 5, y + 3);
    ctx.closePath();
    ctx.fill();
  }

  private circle(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
}
