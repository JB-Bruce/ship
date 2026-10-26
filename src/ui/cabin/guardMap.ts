import type { Guards, GuardTrend } from '../../fleet/guards';
import { guardRadius } from '../../fleet/guards';
import type { Fleet } from '../../fleet/fleet';
import type { MapDiscovery } from '../../progression/mapDiscovery';
import type { Territory } from '../../progression/territory';
import type { Wind } from '../../world/wind';
import { MapFog } from '../mapFog';
import { INK, paintShip } from '../mapGlyphs';
import { paintMap } from '../mapPainter';
import type { MapFrame } from '../mapView';
import { TerritoryLayer } from '../territoryLayer';

/** Couleur du cercle d'un garde selon sa tendance (vert : il gagne, gris : il tient, rouge : trop faible). */
const TREND_COLORS: Record<GuardTrend, string> = { up: '#2f7a3c', flat: '#6b6157', down: '#b3261c' };
/** Flèche de tendance devant le nom (même signe que la page). */
const TREND_GLYPHS: Record<GuardTrend, string> = { up: '▲', flat: '▬', down: '▼' };
/** Taille de la carte à l'écran (px). */
const SIZE = { width: 640, height: 380 };

/** Ce que la carte de déploiement lit du jeu. */
export interface GuardMapSource {
  readonly fleet: Fleet;
  readonly wind: Wind;
  readonly guards: Guards;
  readonly territory: Territory;
  readonly discovery: MapDiscovery;
}

/**
 * Carte de déploiement de la page Garde : la carte du jeu (côtes, brume, territoires toujours montrés), puis chaque
 * garde avec son cercle protégé (couleur de sa tendance), sa puissance et son navire. `toWorld` convertit un clic.
 */
export class GuardMap {
  private readonly fog: MapFog;
  private readonly layer: TerritoryLayer;
  private frame: MapFrame | null = null;
  private width = SIZE.width;
  private height = SIZE.height;

  constructor(private readonly source: GuardMapSource) {
    this.fog = new MapFog(source.discovery);
    this.layer = new TerritoryLayer(source.territory);
    this.layer.shown = true;
  }

  paint(canvas: HTMLCanvasElement) {
    const { fleet, guards } = this.source;
    const width = (this.width = Math.min(SIZE.width, canvas.parentElement?.clientWidth ?? SIZE.width));
    const height = (this.height = SIZE.height);
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = paintMap(ctx, width, height, {
      leader: fleet.leader,
      allies: [],
      traders: [],
      enemies: [],
      crates: [],
      scrolls: [],
      schools: [],
      wind: this.source.wind,
      radarRange: 0,
      zones: [],
      escorts: [],
      pirates: [],
      zoom: 1,
      center: null,
      fog: this.fog,
      known: this.source.discovery.bounds(),
      objectivePorts: [],
      territory: this.layer,
    });
    this.frame = frame;
    const toX = (x: number) => width / 2 - (x - frame.midX) * frame.scale;
    const toY = (z: number) => height / 2 - (z - frame.midZ) * frame.scale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of guards.members) {
      const post = m.guard!;
      const info = guards.info(m);
      const color = TREND_COLORS[info?.trend ?? 'flat'];
      const x = toX(post.x);
      const y = toY(post.z);
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}22`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(x, y, guardRadius(m.type) * frame.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.inWorld && m.ship.alive) paintShip(ctx, toX(m.ship.position.x), toY(m.ship.position.z), m.ship.heading, 8, color);
      ctx.font = `13px 'Pirata One', Georgia, serif`;
      ctx.fillStyle = INK;
      const power = info ? `${info.total.toFixed(1)} / ${info.pressure.toFixed(1)}` : '';
      const label = `${m.name} ${power}`;
      const top = y - guardRadius(m.type) * frame.scale - 9;
      ctx.fillText(label, x, top);
      ctx.fillStyle = color;
      ctx.fillText(TREND_GLYPHS[info?.trend ?? 'flat'], x - ctx.measureText(label).width / 2 - 9, top);
    }
  }

  /** Le point du monde sous un clic (px dans la toile), ou null avant le premier dessin. */
  toWorld(px: number, py: number): { x: number; z: number } | null {
    const f = this.frame;
    if (!f) return null;
    return { x: f.midX - (px - this.width / 2) / f.scale, z: f.midZ - (py - this.height / 2) / f.scale };
  }
}
