import { BLUEPRINTS, RADAR, WIND } from '../config';
import type { Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import type { FishSchool } from '../world/fishSchools';
import { isIsland, LAND_LIST, type Landmass } from '../world/island';
import type { Wind } from '../world/wind';
import { paintDiamond } from './mapGlyphs';

const COLORS = {
  background: 'rgba(6, 28, 38, 0.72)',
  grid: 'rgba(120, 230, 200, 0.22)',
  player: '#f2e8d0',
  hunting: '#ff4a3a',
  patrolling: '#ffae3a',
  fleeing: '#c9a0ff',
  boss: '#ff2a1a',
  ally: '#6fe08a',
  /** Tes navires en commerce : vert plus foncé. */
  trader: '#3c9d56',
  fish: '#8fe3ff',
  escort: '#a6ecff',
  pirate: '#4a9bff',
  wind: 'rgba(205, 238, 255, 0.95)',
  windEdge: 'rgba(6, 28, 38, 0.9)',
  land: 'rgba(214, 190, 128, 0.85)',
  coast: 'rgba(250, 240, 210, 0.9)',
  port: '#ffffff',
  north: 'rgba(242, 232, 208, 0.85)',
};

/** Filets de vent, du plus faible (en bas) au plus fort (en haut) : départ (x, y), longueur, et boucle au bout (ou non). */
const GUSTS: readonly [number, number, number, boolean][] = [
  [8, 20, 10, false],
  [2, 15.5, 20, true],
  [10, 11, 8, false],
  [0, 6.5, 24, true],
  [6, 2, 14, false],
];

/** Pictogramme de la force du vent : 1 à 5 filets allumés selon la force (jaunes à 4, rouges à 5). */
function gustsIcon(level: number): string {
  const paths = GUSTS.map(([x, y, length, curl], i) => {
    const d = `M${x} ${y} h${length}${curl ? ' a1.8 1.8 0 1 0 -1.8 -1.8' : ''}`;
    return `<path class="${i < level ? 'on' : ''}" d="${d}"/>`;
  }).join('');
  return `<svg class="wind-gusts level-${level}" viewBox="0 0 28 22" width="28" height="22" role="img" aria-label="Force du vent : ${level} / 5"><title>Force du vent : ${level} / 5</title>${paths}</svg>`;
}

/**
 * Radar circulaire qui tourne avec le bateau : le haut = devant toi.
 * Vert = navire de ta flotte, vert plus foncé = ton navire en commerce, bleu = autre allié (pirate, marchand), bleu ciel cerclé de blanc = navire à protéger. Rouge = ennemi qui te chasse, orange = en patrouille, violet = en fuite, gros point
 * rouge cerclé = boss, poisson bleu = banc de poissons, losange rose = rouleau de plan de navire. Le reste du butin n'y
 * figure pas (il encombrait le radar).
 * Hors de portée : point pâle au bord, dans sa direction. La portée grandit près de l'île avec le phare.
 * Le triangle clair sur le bord montre d'où vient le vent ; au-dessus, ses crans de force (1 à 5), ses nœuds et son effet sur ta vitesse.
 */
export class Radar {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly windLabel: HTMLElement;
  private lastWindText = '';
  /** Temps écoulé depuis le dernier dessin (s). */
  private sinceDraw = Infinity;
  /** Ennemis signalés (« Voile à l'horizon ! ») : temps restant de l'anneau qui pulse autour d'eux (s). */
  private readonly pings = new Map<Ship, number>();
  private time = 0;
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

  /** Fait pulser un anneau autour d'un ennemi pendant `seconds` s (rencontre signalée). */
  ping(ship: Ship, seconds: number) {
    this.pings.set(ship, seconds);
  }

  /** `ships` : tous les bateaux (les alliés y sont repérés par leur camp). */
  /**
   * `escorts` : navires à protéger (en bleu ciel) ; les autres alliés hors de ta flotte sont en bleu. `traders` : tes
   * navires en commerce (vert plus foncé). `scrolls` : rouleaux de plan de navire qui flottent.
   */
  update(dt: number, player: Ship, enemies: readonly Enemy[], wind: Wind, ships: readonly Ship[], schools: readonly FishSchool[], escorts: readonly Ship[], traders: readonly Ship[], scrolls: readonly { x: number; z: number }[] = []) {
    // Redessiner un dessin 2D à chaque image coûte cher : RADAR.refreshRate fois par seconde suffit.
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / RADAR.refreshRate) return;
    const elapsed = Math.min(this.sinceDraw, 0.25);
    this.sinceDraw = 0;
    this.time += elapsed;
    for (const [ship, left] of this.pings) {
      if (left - elapsed <= 0 || !ship.alive) this.pings.delete(ship);
      else this.pings.set(ship, left - elapsed);
    }
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

    for (const land of LAND_LIST) this.drawIsland(c, r, player, land);

    // Monde → radar : avant du bateau vers le haut, bâbord vers la gauche.
    const sin = Math.sin(player.heading);
    const cos = Math.cos(player.heading);
    const scale = r / this.range;

    // La girouette d'abord : le N, cerné de sombre, reste lisible quand le vent vient du nord.
    this.drawWind(c, r, player, wind);
    ctx.fillStyle = COLORS.north;
    ctx.strokeStyle = COLORS.windEdge;
    ctx.lineWidth = 3;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('N', c + sin * (r - 10), c - cos * (r - 10));
    ctx.fillText('N', c + sin * (r - 10), c - cos * (r - 10));
    ctx.lineWidth = 1;

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
    ctx.fillStyle = BLUEPRINTS.radarColor;
    for (const scroll of scrolls) {
      const p = place(scroll.x, scroll.z);
      paintDiamond(ctx, p.x, p.y, p.outside ? 3.5 : 5);
    }
    for (const ship of ships) {
      if (ship === player || ship.faction === 'enemy' || !ship.alive) continue;
      // Vert : ta flotte (plus foncé : en commerce) ; bleu ciel cerclé : navire à protéger ; bleu : autre allié (pirate, marchand des îles).
      const escort = escorts.includes(ship);
      const own = traders.includes(ship) ? COLORS.trader : COLORS.ally;
      ctx.fillStyle = ship.faction === 'player' ? own : escort ? COLORS.escort : COLORS.pirate;
      const p = place(ship.position.x, ship.position.z);
      this.circle(p.x, p.y, escort ? 5.5 : p.outside ? 3 : 4);
      ctx.fill();
      if (!escort) continue;
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    for (const { ship, ai, boss } of enemies) {
      // Un boss caché dans la brume (harcèlement) n'apparaît pas.
      if (!ship.alive || ai.hidden) continue;
      const p = place(ship.position.x, ship.position.z);
      ctx.fillStyle = boss ? COLORS.boss : ai.state === 'patrol' ? COLORS.patrolling : ai.state === 'flee' ? COLORS.fleeing : COLORS.hunting;
      this.circle(p.x, p.y, boss ? 6.5 : p.outside ? 3 : 4.5);
      ctx.fill();
      const ping = this.pings.get(ship);
      if (ping !== undefined) {
        // Anneau qui s'élargit et s'efface, deux fois par seconde.
        const k = (this.time * 2) % 1;
        ctx.strokeStyle = COLORS.hunting;
        ctx.globalAlpha = (1 - k) * (p.outside ? 0.6 : 1);
        ctx.lineWidth = 2;
        this.circle(p.x, p.y, 5 + k * 9);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = p.outside ? 0.45 : 1;
      }
      if (!boss) continue;
      ctx.strokeStyle = '#1a0505';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = 1;

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

  /** Une terre (côte dessinée point par point) et son port s'il en a un, découpés au bord du radar. */
  private drawIsland(c: number, r: number, player: Ship, island: Landmass) {
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
    // Plus de points sur une terre étirée, dont la côte tourne vite aux deux bouts.
    const steps = Math.round(RADAR.coastSteps * island.frame.stretch);
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
    if (!isIsland(island)) {
      ctx.restore();
      return;
    }
    const px = island.port.x - player.position.x;
    const pz = island.port.z - player.position.z;
    ctx.fillStyle = COLORS.port;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚓', toX(px, pz), toY(px, pz));
    ctx.restore();
  }

  /**
   * Girouette : un triangle sur le bord du radar, du côté d'où vient le vent, pointé vers le centre (vers où il va).
   * La force s'affiche au-dessus du radar en crans (1 à 5), avec les nœuds et l'effet sur ta vitesse.
   */
  private drawWind(c: number, r: number, player: Ship, wind: Wind) {
    const ctx = this.ctx;
    const relative = wind.direction - player.heading;
    // Direction du vent à l'écran (le radar tourne avec le bateau : vent de dos = triangle en bas, pointé vers le haut).
    const wx = -Math.sin(relative);
    const wy = -Math.cos(relative);
    const baseX = c - wx * (r - 1);
    const baseY = c - wy * (r - 1);
    const tipX = c - wx * (r - 15);
    const tipY = c - wy * (r - 15);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX - wy * 7, baseY + wx * 7);
    ctx.lineTo(baseX + wy * 7, baseY - wx * 7);
    ctx.closePath();
    ctx.fillStyle = COLORS.wind;
    ctx.fill();
    ctx.strokeStyle = COLORS.windEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;

    const level = 1 + WIND.levels.filter((k) => wind.knots >= k).length;
    const effect = Math.round((wind.speedFactor(player.heading) - 1) * 100);
    const text = `${level}|${wind.knots} nœuds · vitesse ${effect >= 0 ? '+' : '−'}${Math.abs(effect)} %`;
    if (text === this.lastWindText) return;
    this.lastWindText = text;
    this.windLabel.innerHTML = `${gustsIcon(level)}${text.slice(text.indexOf('|') + 1)}`;
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
