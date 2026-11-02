import { MAP_VIEW } from '../config';

/** Cadrage de la carte calculé par `paintMap` : centre (m) et échelle (px par m). */
export interface MapFrame {
  midX: number;
  midZ: number;
  scale: number;
}

/**
 * Zoom et déplacement de la carte (M) : molette pour zoomer vers le curseur, glisser pour déplacer, double-clic ou C
 * pour recentrer sur ton navire. Remis au cadrage d'ensemble à chaque ouverture.
 */
export class MapView {
  /** Zoom par rapport au cadrage d'ensemble (1 = toute la carte). */
  zoom = 1;
  /** Centre imposé (m), ou null : celui du cadrage d'ensemble. */
  center: { x: number; z: number } | null = null;
  /** Dernier cadrage dessiné. */
  frame: MapFrame = { midX: 0, midZ: 0, scale: 1 };
  private drag: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly redraw: () => void,
    private readonly leader: () => { x: number; z: number },
  ) {
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => this.onDrag(e));
    canvas.addEventListener('pointerup', () => (this.drag = null));
    canvas.addEventListener('dblclick', () => this.recenter());
  }

  /** Retour au cadrage d'ensemble (ouverture de la carte). */
  reset() {
    this.zoom = 1;
    this.center = null;
    this.drag = null;
  }

  /** Recentre la carte sur ton navire (zoom gardé). */
  recenter() {
    this.center = { ...this.leader() };
    this.redraw();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const { midX, midZ, scale } = this.frame;
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    // Le point sous le curseur reste sous le curseur (voir toX / toY de paintMap : x = largeur/2 - (X - midX) × échelle).
    const wx = midX - cx / scale;
    const wz = midZ - cy / scale;
    const zoom = Math.min(MAP_VIEW.maxZoom, Math.max(1, this.zoom * Math.exp(-e.deltaY * MAP_VIEW.wheelSpeed)));
    const next = scale * (zoom / this.zoom);
    this.zoom = zoom;
    this.center = { x: wx + cx / next, z: wz + cy / next };
    this.redraw();
  }

  private onDrag(e: PointerEvent) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag = { x: e.clientX, y: e.clientY };
    const { midX, midZ, scale } = this.frame;
    this.center = { x: midX + dx / scale, z: midZ + dy / scale };
    this.redraw();
  }
}
