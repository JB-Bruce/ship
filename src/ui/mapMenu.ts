import type { Fleet } from '../fleet/fleet';
import type { Ship } from '../ship/ship';
import type { MapZone } from '../missions/mission';
import type { Enemy } from '../world/enemySpawner';
import type { FishSchool } from '../world/fishSchools';
import { tortuga } from '../world/island';
import type { Crate } from '../world/loot';
import type { Wind } from '../world/wind';
import { paintMap } from './mapPainter';
import { MapView } from './mapView';
import { ParchmentMenu } from './parchmentMenu';

/** Touche M : code « KeyM » en QWERTY, « Semicolon » en AZERTY (même touche physique que « ; » en QWERTY). */
const MAP_KEYS = ['KeyM', 'Semicolon'];
/** Taille maximale de la carte à l'écran (px). */
const MAX_SIZE = { width: 860, height: 520 };

/** Ce dont la carte a besoin, lu au moment où on l'ouvre. */
export interface MapSource {
  readonly fleet: Fleet;
  readonly wind: Wind;
  enemies(): readonly Enemy[];
  crates(): readonly Crate[];
  /** Rouleaux de plan de navire qui flottent. */
  scrolls(): readonly { x: number; z: number }[];
  schools(): readonly FishSchool[];
  /** Portée du radar du bateau piloté (m). */
  radarRange(): number;
  /** Zone surveillée par le phare (distance à la côte, m), 0 sans phare. */
  coverage(): number;
  /** Zones de mission (chasse à un capitaine). */
  zones(): readonly MapZone[];
  /** Navires à protéger (marchand escorté). */
  escorts(): readonly Ship[];
  /** Autres alliés en mer (pirates, marchands des îles). */
  pirates(): readonly Ship[];
}

/**
 * Carte (M) : l'île et ses lieux, ta flotte, les ennemis repérés par le radar, le butin et le vent.
 * Elle est dessinée à l'ouverture : le jeu est en pause tant qu'elle est affichée.
 */
export class MapMenu extends ParchmentMenu {
  private readonly canvas = document.createElement('canvas');
  private readonly view: MapView;

  constructor(
    parent: HTMLElement,
    private readonly source: MapSource,
  ) {
    super(parent, 'Carte', 'M ou Échap pour reprendre la mer', MAP_KEYS);
    this.body.parentElement!.classList.add('map-sheet');
    this.canvas.className = 'map-canvas';
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = `
      <span><b class="me">▲</b> Toi</span>
      <span><b class="ally">▲</b> Ta flotte</span>
      <span><b class="trader">▲</b> En commerce</span>
      <span><b class="enemy">▲</b> Ennemis repérés</span>
      <span><b class="gold">■</b> Or</span>
      <span><b class="wood">■</b> Bois</span>
      <span><b class="rum">■</b> Rhum, épices</span>
      <span><b class="plan">◆</b> Plan de navire</span>
      <span><b class="fish">≋</b> Banc de poissons</span>
      <span><b class="zone">◌</b> Portée du radar</span>
      <span><b class="pirate">▲</b> Alliés</span>
      <span><b class="escort">▲</b> À protéger</span>
      <span><b class="hunt">◌</b> Zone de chasse</span>
      <span><b class="navy">♛</b> Port de la Marine</span>`;
    const hint = document.createElement('p');
    hint.className = 'map-hint';
    hint.textContent = 'Molette : zoom · glisser : déplacer · double-clic ou C : recentrer sur ton navire';
    this.body.append(this.canvas, hint, legend);
    this.view = new MapView(this.canvas, () => this.render(), () => this.source.fleet.leader.position);
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.code === 'KeyC' && !e.repeat) this.view.recenter();
    });
  }

  override setOpen(open: boolean) {
    if (open && !this.isOpen) this.view.reset();
    super.setOpen(open);
  }

  render() {
    const width = Math.min(MAX_SIZE.width, innerWidth - 110);
    const height = Math.min(MAX_SIZE.height, innerHeight - 230);
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { fleet } = this.source;
    const leader = fleet.leader;
    const allies: Ship[] = [];
    const traders: Ship[] = [];
    for (const m of fleet.members) if (m !== fleet.controlled && m.inWorld && m.ship.alive) (m.trade ? traders : allies).push(m.ship);
    // Seuls les ennemis que ton radar voit sont connus (pas un boss caché dans la brume), plus ceux qui approchent de l'île (vigies du phare).
    const range = this.source.radarRange();
    const coverage = this.source.coverage();
    const enemies = this.source
      .enemies()
      .filter((e) => !e.ai.hidden)
      .map((e) => e.ship)
      .filter((s) => s.alive && (s.distanceTo(leader) <= range || tortuga.sdf(s.position.x, s.position.z) < coverage));
    const source = this.source;
    this.view.frame = paintMap(ctx, width, height, {
      leader,
      allies,
      traders,
      enemies,
      crates: source.crates(),
      scrolls: source.scrolls(),
      schools: source.schools(),
      wind: source.wind,
      radarRange: range,
      zones: source.zones(),
      escorts: source.escorts(),
      pirates: source.pirates().filter((s) => s.alive && s.distanceTo(leader) <= range),
      zoom: this.view.zoom,
      center: this.view.center,
    });
  }

  protected onAction() {}
}
