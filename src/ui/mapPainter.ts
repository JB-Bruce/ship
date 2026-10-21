import type { MapZone } from '../missions/mission';
import type { Ship } from '../ship/ship';
import type { FishSchool } from '../world/fishSchools';
import { BLUEPRINTS, ISLAND_INFO, WORLD_EDGE, type IslandId } from '../config';
import { harbors } from '../world/harbors';
import { isIsland, LAND_LIST, type Islet, type Landmass } from '../world/island';
import { LANDMARKS } from '../world/landmarks';
import type { Crate, LootKind } from '../world/loot';
import type { Wind } from '../world/wind';
import type { MapFog } from './mapFog';
import type { MapFrame } from './mapView';
import { INK, paintCompass, paintDiamond, paintLandmark, paintScale, paintShip } from './mapGlyphs';

/** Ce que la carte montre. Les ennemis sont déjà filtrés : seulement ceux à portée du radar. */
export interface MapData {
  leader: Ship;
  allies: readonly Ship[];
  /** Tes navires en commerce (hors de ta flotte), en vert plus foncé. */
  traders: readonly Ship[];
  enemies: readonly Ship[];
  crates: readonly Crate[];
  /** Rouleaux de plan de navire qui flottent (losange de leur couleur). */
  scrolls: readonly { x: number; z: number }[];
  schools: readonly FishSchool[];
  wind: Wind;
  /** Portée du radar du bateau piloté (m). */
  radarRange: number;
  zones: readonly MapZone[];
  escorts: readonly Ship[];
  /** Autres alliés hors de ta flotte (pirates, marchands des îles) vus par le radar. */
  pirates: readonly Ship[];
  /** Zoom (× le cadrage d'ensemble) et centre imposé (null : celui du cadrage d'ensemble), voir MapView. */
  zoom: number;
  center: { x: number; z: number } | null;
  /** Lavis de la mer inconnue, et emprise de ce qui est découvert (m), que le cadrage d'ensemble englobe. */
  fog: MapFog;
  known: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** Ports où toucher une prime ou que vise un contrat suivi : dessinés par-dessus la brume, comme les zones et les escortes. */
  objectivePorts: readonly IslandId[];
}

const COLORS = {
  sea: 'rgba(60, 110, 120, 0.16)',
  grid: 'rgba(74, 46, 20, 0.12)',
  shallows: 'rgba(40, 95, 105, 0.45)',
  land: '#dcc084',
  forest: 'rgba(95, 120, 60, 0.5)',
  player: '#1f1a14',
  ally: '#2f7a3c',
  trader: '#1f5229',
  enemy: '#b3261c',
  radar: 'rgba(74, 46, 20, 0.45)',
  /** Tempête du bord du monde. */
  storm: 'rgba(40, 44, 58, 0.45)',
  fish: '#2d7f9a',
  escort: '#3fb4e8',
  pirate: '#2f6fc0',
  hunt: 'rgba(179, 38, 28, 0.8)',
};
const CRATE_COLORS: Record<LootKind, string> = { gold: '#d9a514', wood: '#8a5a2b', rum: '#9a3f1c', spices: '#e0782c' };
/** Pas possibles du quadrillage (m) : on prend le premier qui laisse assez d'espace entre deux lignes. */
const GRID_STEPS = [100, 250, 500, 1000, 2500, 5000];
const MIN_GRID_PX = 70;
/** Marge autour de ce qui est découvert et de la zone radar du joueur (m). */
const KNOWN_MARGIN = 160;
/** Étendue minimale montrée (m) : la carte ne zoome pas plus que ça. */
const MIN_SPAN = 900;
/** Points de la côte d'une terre ronde (× l'étirement pour une terre allongée). */
const COAST_STEPS = 180;
/** Collines dessinées sur chaque île : [cap depuis l'axe de la crique, distance à l'intérieur des terres (m)]. */
const HILLS = [[Math.PI - 0.6, 55], [Math.PI, 60], [Math.PI + 0.6, 55], [Math.PI / 2 + 0.3, 50], [(3 * Math.PI) / 2 - 0.3, 50]] as const;

/**
 * Dessine la carte : nord en haut, ouest à gauche (+X monde = ouest). Le cadrage englobe tout ce qui est découvert, la
 * zone radar du joueur et ses objectifs, quelle que soit la distance qui les sépare. La mer inconnue est couverte d'un
 * lavis de parchemin vierge (mapFog.ts) qui cache tout, sauf les objectifs, dessinés par-dessus.
 */
export function paintMap(ctx: CanvasRenderingContext2D, width: number, height: number, data: MapData): MapFrame {
  const { leader } = data;
  const around = data.radarRange + 60;
  let minX = leader.position.x - around;
  let maxX = leader.position.x + around;
  let minZ = leader.position.z - around;
  let maxZ = leader.position.z + around;
  if (data.known) {
    minX = Math.min(minX, data.known.minX - KNOWN_MARGIN);
    maxX = Math.max(maxX, data.known.maxX + KNOWN_MARGIN);
    minZ = Math.min(minZ, data.known.minZ - KNOWN_MARGIN);
    maxZ = Math.max(maxZ, data.known.maxZ + KNOWN_MARGIN);
  }
  // Les zones de mission, les navires escortés et les ports des contrats restent dans le cadre.
  const ports = LANDMARKS.filter((l) => l.kind === 'port' && data.objectivePorts.includes(l.island));
  const extras = [
    ...data.zones.map((z) => ({ x: z.x, z: z.z, r: z.radius + 40 })),
    ...data.escorts.map((e) => ({ x: e.position.x, z: e.position.z, r: 60 })),
    ...ports.map((p) => ({ x: p.x, z: p.z, r: 60 })),
  ];
  for (const e of extras) {
    minX = Math.min(minX, e.x - e.r);
    maxX = Math.max(maxX, e.x + e.r);
    minZ = Math.min(minZ, e.z - e.r);
    maxZ = Math.max(maxZ, e.z + e.r);
  }
  const scale = Math.min(width / Math.max(maxX - minX, MIN_SPAN), height / Math.max(maxZ - minZ, MIN_SPAN)) * data.zoom;
  const midX = data.center?.x ?? (minX + maxX) / 2;
  const midZ = data.center?.z ?? (minZ + maxZ) / 2;
  const toX = (x: number) => width / 2 - (x - midX) * scale;
  const toY = (z: number) => height / 2 - (z - midZ) * scale;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(0, 0, width, height);

  // Quadrillage.
  const step = GRID_STEPS.find((s) => s * scale >= MIN_GRID_PX) ?? GRID_STEPS[GRID_STEPS.length - 1];
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const halfW = width / 2 / scale;
  const halfH = height / 2 / scale;
  for (let x = Math.ceil((midX - halfW) / step) * step; x <= midX + halfW; x += step) {
    ctx.moveTo(toX(x), 0);
    ctx.lineTo(toX(x), height);
  }
  for (let z = Math.ceil((midZ - halfH) / step) * step; z <= midZ + halfH; z += step) {
    ctx.moveTo(0, toY(z));
    ctx.lineTo(width, toY(z));
  }
  ctx.stroke();

  for (const land of LAND_LIST) paintIsland(ctx, land, toX, toY, scale);
  paintStormEdge(ctx, toX, toY, scale);
  // Une seule écriture par île : le nom de son port (sinon celui de l'île, voir paintIsland). Port de la Marine en rouge.
  // Les ports des contrats sont dessinés plus loin, par-dessus la brume.
  for (const l of LANDMARKS) if (!ports.includes(l)) paintLandmark(ctx, l.kind, l.kind === 'port' ? l.name : null, toX(l.x), toY(l.z), !harbors.isOpen(l.island));

  for (const { mesh, kind } of data.crates) {
    ctx.fillStyle = CRATE_COLORS[kind];
    ctx.fillRect(toX(mesh.position.x) - 3, toY(mesh.position.z) - 3, 6, 6);
  }
  ctx.fillStyle = BLUEPRINTS.mapColor;
  for (const p of data.scrolls) paintDiamond(ctx, toX(p.x), toY(p.z), 6);
  ctx.fillStyle = COLORS.fish;
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const s of data.schools) if (!s.diving) ctx.fillText('≋', toX(s.x), toY(s.z));
  for (const ship of data.enemies) paintShip(ctx, toX(ship.position.x), toY(ship.position.z), ship.heading, 7, COLORS.enemy);
  for (const ship of data.allies) paintShip(ctx, toX(ship.position.x), toY(ship.position.z), ship.heading, 7, COLORS.ally);
  for (const ship of data.traders) paintShip(ctx, toX(ship.position.x), toY(ship.position.z), ship.heading, 7, COLORS.trader);
  for (const ship of data.pirates) paintShip(ctx, toX(ship.position.x), toY(ship.position.z), ship.heading, 7, COLORS.pirate);

  // La mer inconnue cache tout ce qui précède ; tes objectifs restent visibles par-dessus.
  data.fog.paint(ctx, width, height, { midX, midZ, scale });
  for (const l of ports) paintLandmark(ctx, l.kind, l.name, toX(l.x), toY(l.z), !harbors.isOpen(l.island));
  for (const ship of data.escorts) paintShip(ctx, toX(ship.position.x), toY(ship.position.z), ship.heading, 8, COLORS.escort);
  for (const zone of data.zones) paintZone(ctx, zone, toX, toY, scale);
  // Zone couverte par le radar : ce que tu « vois » autour de toi (et découvres).
  ctx.strokeStyle = COLORS.radar;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(toX(leader.position.x), toY(leader.position.z), data.radarRange * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const px = toX(leader.position.x);
  const py = toY(leader.position.z);
  ctx.fillStyle = 'rgba(255, 245, 220, 0.8)';
  ctx.beginPath();
  ctx.arc(px, py, 13, 0, Math.PI * 2);
  ctx.fill();
  paintShip(ctx, px, py, leader.heading, 11, COLORS.player);

  paintCompass(ctx, width - 52, 56, data.wind);
  paintScale(ctx, 18, height - 18, step, scale);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  return { midX, midZ, scale };
}

/** Une terre : hauts-fonds, côte ; pour une île à port, la forêt, les collines et (sans port nommé) son nom ; pour un îlot, son nom. */
function paintIsland(ctx: CanvasRenderingContext2D, island: Landmass, toX: (x: number) => number, toY: (z: number) => number, scale: number) {
  // Plus de points sur une terre étirée, dont la côte tourne vite aux deux bouts.
  const steps = Math.round(COAST_STEPS * island.frame.stretch);
  const outline = (inland: number) => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = island.pointAt((i / steps) * Math.PI * 2, inland);
      if (i === 0) ctx.moveTo(toX(p.x), toY(p.z));
      else ctx.lineTo(toX(p.x), toY(p.z));
    }
    ctx.closePath();
  };
  // Hauts-fonds : un pointillé au large du rivage.
  outline(-20);
  ctx.strokeStyle = COLORS.shallows;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  outline(0);
  ctx.fillStyle = COLORS.land;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (!isIsland(island)) {
    paintIsletName(ctx, island as Islet, toX, toY, scale);
    return;
  }
  outline(30);
  ctx.fillStyle = COLORS.forest;
  ctx.fill();

  // Collines : petits sommets à l'encre.
  const size = Math.max(5, 18 * scale);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  for (const [theta, inland] of HILLS) {
    const p = island.pointAt(theta + island.def.bay.angle, inland);
    const x = toX(p.x);
    const y = toY(p.z);
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * 0.5);
    ctx.lineTo(x, y - size * 0.6);
    ctx.lineTo(x + size, y + size * 0.5);
    ctx.stroke();
  }

  // Une île sans port porte son propre nom, du côté opposé à la crique (sinon, c'est le nom du port qui la désigne).
  if (LANDMARKS.some((l) => l.kind === 'port' && l.island === island.id)) return;
  const away = island.def.bay.angle + Math.PI;
  const nameX = toX(island.cx + Math.sin(away) * island.reach * 0.45);
  const name = toY(island.cz + Math.cos(away) * island.reach * 0.45);
  ctx.fillStyle = INK;
  ctx.font = `${Math.round(Math.min(24, Math.max(12, 45 * scale)))}px 'Pirata One', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ISLAND_INFO[island.id].name, nameX, name);
}

/** Zone de chasse : un cercle rouge pointillé et le nom du capitaine. */
function paintZone(ctx: CanvasRenderingContext2D, zone: MapZone, toX: (x: number) => number, toY: (z: number) => number, scale: number) {
  ctx.strokeStyle = ctx.fillStyle = COLORS.hunt;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(toX(zone.x), toY(zone.z), zone.radius * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `15px 'Pirata One', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(zone.label, toX(zone.x), toY(zone.z));
}

/** Nom d'un îlot, en petites lettres penchées à côté de lui (au nord-ouest de son centre). */
function paintIsletName(ctx: CanvasRenderingContext2D, islet: Islet, toX: (x: number) => number, toY: (z: number) => number, scale: number) {
  ctx.fillStyle = INK;
  ctx.font = `italic ${Math.round(Math.min(16, Math.max(10, 30 * scale)))}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(islet.def.name, toX(islet.cx), toY(islet.cz) - Math.max(12, islet.reach * scale * 0.7));
}

/** La tempête du bord du monde : une large bande sombre au-delà du bord, et le bord lui-même en tirets. */
function paintStormEdge(ctx: CanvasRenderingContext2D, toX: (x: number) => number, toY: (z: number) => number, scale: number) {
  const [cx, cz] = WORLD_EDGE.center;
  const x = toX(cx);
  const y = toY(cz);
  const r = WORLD_EDGE.radius * scale;
  const band = WORLD_EDGE.band * scale;
  ctx.save();
  ctx.strokeStyle = COLORS.storm;
  ctx.lineWidth = band;
  ctx.beginPath();
  ctx.arc(x, y, r + band / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
