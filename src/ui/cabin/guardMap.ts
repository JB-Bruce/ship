import { CAMERA, MAP_VIEW } from '../../config';
import type { Guards, GuardTrend } from '../../fleet/guards';
import { guardRadius } from '../../fleet/guards';
import type { Fleet, FleetMember } from '../../fleet/fleet';
import type { MapDiscovery } from '../../progression/mapDiscovery';
import type { Territory } from '../../progression/territory';
import type { Wind } from '../../world/wind';
import { MapFog } from '../mapFog';
import { INK, paintShip } from '../mapGlyphs';
import { paintMap } from '../mapPainter';
import type { MapFrame } from '../mapView';
import { TerritoryLayer } from '../territoryLayer';
import { shipIcon } from '../shipIcons';
import { shipIconImage } from '../shipIconImage';

/** Couleur du cercle d'un garde selon sa tendance (vert : il gagne, gris : il tient, rouge : trop faible). */
const TREND_COLORS: Record<GuardTrend, string> = { up: '#2f7a3c', flat: '#6b6157', down: '#b3261c' };
/** Flèche de tendance devant le nom (même signe que la page). */
const TREND_GLYPHS: Record<GuardTrend, string> = { up: '▲', flat: '▬', down: '▼' };
/** Taille de la carte à l'écran (px). */
const SIZE = { width: 640, height: 380 };
/** Silhouette d'un garde au centre de son cercle (gravure de shipIcons.ts) : taille, et rayon du disque où on peut la saisir (px). */
const ICON = { size: 30, grab: 18 };
/** Lavis de parchemin derrière l'icône d'un garde (centre, milieu, bord transparent) et son trait d'encre. */
const ICON_WASH = { center: 'rgba(236, 219, 180, 0.8)', middle: 'rgba(226, 205, 160, 0.55)', edge: 'rgba(226, 205, 160, 0)', ring: 'rgba(74, 46, 20, 0.35)' };
/** Au-delà de cette part du rayon de son cercle, le navire est dessiné à sa vraie place (en route). */
const AWAY = 0.6;

/** Ce que la carte de déploiement lit du jeu. */
export interface GuardMapSource {
  readonly fleet: Fleet;
  readonly wind: Wind;
  readonly guards: Guards;
  readonly territory: Territory;
  readonly discovery: MapDiscovery;
}

/** Ce que la carte demande à la Cabine. */
export interface GuardMapHooks {
  /** Navire choisi pour être posté (bouton de la page), ou null. */
  picking(): FleetMember | null;
  /** Un poste peut-il être là ? (mer découverte, loin des côtes) */
  valid(x: number, z: number): boolean;
  /** Poste (ou déplace) ce navire en (x, z). */
  place(member: FleetMember, x: number, z: number): void;
}

/** Ce que fait le glisser en cours : déplacer la carte, ou un garde. */
type Drag = { kind: 'pan' | 'guard'; member: FleetMember | null; x: number; y: number; moved: number; at: number };

/**
 * Carte de déploiement de la page Garde : la carte du jeu (côtes, brume, territoires toujours montrés), puis chaque
 * garde avec son cercle protégé (couleur de sa tendance), son icône au centre, sa puissance. Molette : zoom vers le
 * curseur ; glisser : déplacer la carte ; glisser l'icône d'un garde : le déplacer ; clic avec un navire choisi : le
 * poster. Un petit texte suit le curseur. La toile est gardée d'un rendu de la Cabine à l'autre (`mount`).
 */
export class GuardMap {
  private readonly fog: MapFog;
  private readonly layer: TerritoryLayer;
  private readonly wrap = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly label = document.createElement('span');
  private frame: MapFrame | null = null;
  private width = SIZE.width;
  private readonly height = SIZE.height;
  private zoom = 1;
  private center: { x: number; z: number } | null = null;
  private drag: Drag | null = null;
  /** Garde que l'on glisse : où son cercle est montré pendant le glisser. */
  private ghost: { x: number; z: number } | null = null;

  constructor(
    private readonly source: GuardMapSource,
    private readonly hooks: GuardMapHooks,
  ) {
    this.fog = new MapFog(source.discovery);
    this.layer = new TerritoryLayer(source.territory);
    this.layer.shown = true;
    this.wrap.className = 'guard-map-wrap';
    this.canvas.className = 'guard-map';
    this.label.className = 'guard-cursor';
    this.label.hidden = true;
    this.wrap.append(this.canvas, this.label);
    const c = this.canvas;
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => (this.label.hidden = true));
  }

  /** Remet la carte au cadrage d'ensemble (ouverture de la Cabine). */
  reset() {
    this.zoom = 1;
    this.center = null;
    this.drag = null;
    this.ghost = null;
  }

  /** Pose la carte à la place de l'élément `slot` (rendu de la Cabine) et la dessine. */
  mount(slot: HTMLElement) {
    slot.replaceWith(this.wrap);
    this.paint();
  }

  private paint() {
    const { fleet, guards } = this.source;
    const canvas = this.canvas;
    const width = (this.width = Math.min(SIZE.width, this.wrap.parentElement?.clientWidth || SIZE.width));
    const height = this.height;
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
      zoom: this.zoom,
      center: this.center,
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
      const dragged = this.drag?.kind === 'guard' && this.drag.member === m && this.ghost;
      const post = dragged ? this.ghost! : m.guard!;
      const info = guards.info(m);
      const trend = info?.trend ?? 'flat';
      const color = TREND_COLORS[trend];
      const r = guardRadius(m.type) * frame.scale;
      const x = toX(post.x);
      const y = toY(post.z);
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}22`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // L'icône au centre du cercle (on la saisit pour déplacer le garde) ; en route, le navire aussi, plus pâle, là où il est.
      // Fond de l'icône : un lavis de parchemin qui s'efface vers son bord, cerclé d'un trait d'encre léger.
      const wash = ctx.createRadialGradient(x, y, 0, x, y, ICON.grab);
      wash.addColorStop(0, ICON_WASH.center);
      wash.addColorStop(0.7, ICON_WASH.middle);
      wash.addColorStop(1, ICON_WASH.edge);
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.arc(x, y, ICON.grab, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ICON_WASH.ring;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, ICON.grab - 3, 0, Math.PI * 2);
      ctx.stroke();
      const icon = shipIconImage(shipIcon(m.type, m.levels), color, () => this.paint());
      if (icon) ctx.drawImage(icon, x - ICON.size / 2, y - ICON.size / 2, ICON.size, ICON.size);
      const ship = m.ship.position;
      if (m.inWorld && m.ship.alive && Math.hypot(ship.x - post.x, ship.z - post.z) > guardRadius(m.type) * AWAY) {
        ctx.globalAlpha = 0.55;
        paintShip(ctx, toX(ship.x), toY(ship.z), m.ship.heading, 7, color);
        ctx.globalAlpha = 1;
      }
      ctx.font = `13px 'Pirata One', Georgia, serif`;
      ctx.fillStyle = INK;
      const power = info ? `${info.total.toFixed(1)} / ${info.pressure.toFixed(1)}` : '';
      const text = `${m.name} ${power}`;
      const top = y - Math.max(r, ICON.grab) - 9;
      ctx.fillText(text, x, top);
      ctx.fillStyle = color;
      ctx.fillText(TREND_GLYPHS[trend], x - ctx.measureText(text).width / 2 - 9, top);
    }
  }

  private toWorld(px: number, py: number): { x: number; z: number } | null {
    const f = this.frame;
    if (!f) return null;
    return { x: f.midX - (px - this.width / 2) / f.scale, z: f.midZ - (py - this.height / 2) / f.scale };
  }

  /** Le garde dont l'icône est sous le point (px), ou null. */
  private guardAt(px: number, py: number): FleetMember | null {
    const f = this.frame;
    if (!f) return null;
    for (const m of this.source.guards.members) {
      const post = m.guard!;
      const x = this.width / 2 - (post.x - f.midX) * f.scale;
      const y = this.height / 2 - (post.z - f.midZ) * f.scale;
      if (Math.hypot(px - x, py - y) < ICON.grab) return m;
    }
    return null;
  }

  private local(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const f = this.frame;
    if (!f) return;
    const [px, py] = this.local(e);
    const cx = px - this.width / 2;
    const cy = py - this.height / 2;
    // Le point sous le curseur reste sous le curseur.
    const wx = f.midX - cx / f.scale;
    const wz = f.midZ - cy / f.scale;
    const zoom = Math.min(MAP_VIEW.maxZoom, Math.max(1, this.zoom * Math.exp(-e.deltaY * MAP_VIEW.wheelSpeed)));
    const next = f.scale * (zoom / this.zoom);
    this.zoom = zoom;
    this.center = { x: wx + cx / next, z: wz + cy / next };
    this.paint();
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const [px, py] = this.local(e);
    const member = this.guardAt(px, py);
    this.drag = { kind: member ? 'guard' : 'pan', member, x: e.clientX, y: e.clientY, moved: 0, at: performance.now() };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché : le glisser continue sans capture.
    }
  }

  private onMove(e: PointerEvent) {
    const [px, py] = this.local(e);
    const d = this.drag;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.kind === 'pan' && this.frame) {
        const f = this.frame;
        this.center = { x: f.midX + dx / f.scale, z: f.midZ + dy / f.scale };
      } else if (d.kind === 'guard') {
        const p = this.toWorld(px, py);
        if (p && this.hooks.valid(p.x, p.z)) this.ghost = p;
      }
      this.paint();
    }
    this.showLabel(px, py);
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const [px, py] = this.local(e);
    const p = this.toWorld(px, py);
    const click = d.moved <= CAMERA.clickSlop && performance.now() - d.at <= CAMERA.clickTime;
    const ghost = this.ghost;
    this.ghost = null;
    if (d.kind === 'guard' && d.member && !click) {
      // Il est posé à la dernière place valable par où le glisser est passé.
      if (ghost) this.hooks.place(d.member, ghost.x, ghost.z);
    } else if (click && p) {
      const member = this.hooks.picking();
      if (member && this.hooks.valid(p.x, p.z)) this.hooks.place(member, p.x, p.z);
    }
    this.paint();
    this.showLabel(px, py);
  }

  /** Petit texte près du curseur : ce que fera le clic, ou le glisser en cours. */
  private showLabel(px: number, py: number) {
    const p = this.toWorld(px, py);
    const d = this.drag;
    const picking = this.hooks.picking();
    const hover = d ? null : this.guardAt(px, py);
    const moving = d?.kind === 'guard' && d.member && d.moved > CAMERA.clickSlop ? d.member : null;
    const member = moving ?? picking;
    let text = '';
    let bad = false;
    if (member && p && (moving || !d)) {
      bad = !this.hooks.valid(p.x, p.z);
      text = bad ? (moving ? `${member.name} reste dans tes eaux` : 'Seulement dans tes eaux, loin des côtes') : moving ? `Déplacer ${member.name} ici` : `Poster ${member.name} ici`;
    } else if (hover) text = `Glisser pour déplacer ${hover.name}`;
    this.label.hidden = !text;
    this.label.textContent = text;
    this.label.classList.toggle('bad', bad);
    this.label.style.left = `${px + 16}px`;
    this.label.style.top = `${py + 12}px`;
    this.canvas.style.cursor = d?.kind === 'pan' && d.moved > CAMERA.clickSlop ? 'grabbing' : hover || moving ? 'move' : member ? 'crosshair' : 'grab';
  }
}
