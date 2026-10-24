import { TERRITORY, WORLD_EDGE, type IslandId } from '../config';
import { fractalNoise } from '../utils/noise';
import { ISLAND_LIST, islandById } from '../world/island';
import type { IslandState } from './islandState';
import { decodeOwners, encodeOwners } from './territoryCodec';

/** À qui est une case de mer. */
export type Owner = 0 | 1 | 2;
export const NAVY: Owner = 0;
export const PIRATE: Owner = 1;
export const PLAYER: Owner = 2;
export const OWNER_KEYS = ['navy', 'pirate', 'player'] as const;

/** Case libre (pas aux abords d'une île), et case hors du bord du monde. */
const FREE = 255;
const OUTSIDE = 254;
const NOISE_SEED = 41;

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/** Un point qui protège ses eaux des poussées (bateau piloté, et plus tard tes navires de garde). */
export interface Guard {
  x: number;
  z: number;
  radius: number;
}

/**
 * Territoires de la mer : une grille de cases (TERRITORY.cell m), chacune à la Marine, aux pirates ou à toi. Les abords
 * des îles à port suivent celui qui tient l'île (`refreshIslands`). Ta flotte gagne du terrain sur la Marine par sa
 * présence (`update`) et ses victoires (`victory`) ; la Marine, de temps en temps, repousse une frontière au hasard
 * (contre toi ou contre les pirates), sauf près des gardes. Le revenu de tes eaux tombe à l'aube (`dawnIncome`).
 * La case (c, r) a son centre en X = `originX` + (c + 0,5) × `cell`, Z = `originZ` + (r + 0,5) × `cell`.
 */
export class Territory {
  readonly cell = TERRITORY.cell;
  readonly size: number;
  readonly originX: number;
  readonly originZ: number;
  readonly owner: Uint8Array;
  /** Indice de l'île (dans ISLAND_LIST) dont la case est un abord, FREE, ou OUTSIDE. */
  private readonly lock: Uint8Array;
  private readonly pressure: Float32Array;
  /** Augmente à chaque changement (la carte redessine son calque). */
  version = 0;
  private stepTimer = 0;
  private pushTimer = rand(TERRITORY.push.interval);

  constructor(
    private readonly islands: Record<IslandId, IslandState>,
    private readonly events: { lost(near: IslandId): void },
  ) {
    const [cx, cz] = WORLD_EDGE.center;
    const half = WORLD_EDGE.radius + WORLD_EDGE.band;
    this.size = Math.ceil((2 * half) / this.cell);
    this.originX = cx - (this.size * this.cell) / 2;
    this.originZ = cz - (this.size * this.cell) / 2;
    const n = this.size * this.size;
    this.owner = new Uint8Array(n);
    this.lock = new Uint8Array(n).fill(FREE);
    this.pressure = new Float32Array(n);
    for (let r = 0; r < this.size; r++)
      for (let c = 0; c < this.size; c++) {
        const [x, z] = this.center(c, r);
        const i = r * this.size + c;
        if (Math.hypot(x - cx, z - cz) > WORLD_EDGE.radius) {
          this.lock[i] = OUTSIDE;
          continue;
        }
        const k = ISLAND_LIST.findIndex((island) => island.sdf(x, z) < TERRITORY.islandHold);
        if (k >= 0) this.lock[i] = k;
      }
    this.reset();
  }

  /** Partage du début de partie : la Tortue à toi, Port-Sabre aux pirates, la Marine ailleurs. */
  reset() {
    const { player, pirate } = TERRITORY.start;
    const around = (id: IslandId, radius: number, x: number, z: number) => {
      const island = islandById(id);
      return Math.hypot(x - island.cx, z - island.cz) < radius * (1 + TERRITORY.noise.amount * this.noise(x, z));
    };
    for (let r = 0; r < this.size; r++)
      for (let c = 0; c < this.size; c++) {
        const [x, z] = this.center(c, r);
        const i = r * this.size + c;
        this.owner[i] = around(player.island, player.radius, x, z) ? PLAYER : around(pirate.island, pirate.radius, x, z) ? PIRATE : NAVY;
      }
    this.pressure.fill(0);
    this.refreshIslands();
  }

  /** Les abords de chaque île suivent celui qui la tient (à appeler quand une île change de main). */
  refreshIslands() {
    for (let i = 0; i < this.owner.length; i++) {
      const k = this.lock[i];
      if (k < ISLAND_LIST.length) this.owner[i] = this.islandOwner(ISLAND_LIST[k].id);
    }
    this.version++;
  }

  islandOwner(id: IslandId): Owner {
    const s = this.islands[id];
    return s.owned ? PLAYER : s.navyHeld ? NAVY : PIRATE;
  }

  /** À qui sont les eaux au point (x, z) (la Marine hors de la grille). */
  ownerAt(x: number, z: number): Owner {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((z - this.originZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.size || r >= this.size) return NAVY;
    return this.owner[r * this.size + c] as Owner;
  }

  /** Part de la mer jouable tenue par un camp (0 à 1), recalculée seulement quand les territoires changent. */
  share(who: Owner): number {
    if (this.sharesAt !== this.version) {
      for (const k of [NAVY, PIRATE, PLAYER]) this.shares[k] = this.count(k);
      this.sharesAt = this.version;
    }
    return this.shares[who];
  }
  private readonly shares = [0, 0, 0];
  private sharesAt = -1;

  private count(who: Owner): number {
    let mine = 0;
    let all = 0;
    for (let i = 0; i < this.owner.length; i++) {
      if (this.lock[i] === OUTSIDE) continue;
      all++;
      if (this.owner[i] === who) mine++;
    }
    return all ? mine / all : 0;
  }

  /** `ships` : tes navires à flot (présence) ; `guards` : ce qui protège ses eaux des poussées. */
  update(dt: number, ships: readonly { x: number; z: number }[], guards: readonly Guard[]) {
    this.stepTimer += dt;
    if (this.stepTimer >= TERRITORY.presence.step) {
      const step = this.stepTimer;
      this.stepTimer = 0;
      this.decay(step);
      const p = TERRITORY.presence;
      for (const s of ships) this.fill(s.x, s.z, p.radius, p.rate * step);
    }
    this.pushTimer -= dt;
    if (this.pushTimer <= 0) {
      this.pushTimer = rand(TERRITORY.push.interval);
      this.push(guards);
    }
  }

  /** Un navire de la Marine coulé par ta flotte en (x, z), de rang `rank` : la frontière avance un peu là. */
  victory(x: number, z: number, rank: number) {
    const v = TERRITORY.victory;
    if (this.ownerAt(x, z) !== NAVY) return;
    this.fill(x, z, v.radius + v.perRank * rank, v.amount);
  }

  /** Revenu de tes eaux pour une journée, réparti entre tes îles (la plus proche de chaque case). Renvoie le total. */
  dawnIncome(): number {
    const owned = ISLAND_LIST.filter((i) => this.islands[i.id].owned);
    if (!owned.length) return 0;
    const counts = owned.map(() => 0);
    let total = 0;
    for (let r = 0; r < this.size; r++)
      for (let c = 0; c < this.size; c++) {
        if (this.owner[r * this.size + c] !== PLAYER || this.lock[r * this.size + c] === OUTSIDE) continue;
        const [x, z] = this.center(c, r);
        let best = 0;
        for (let k = 1; k < owned.length; k++)
          if (Math.hypot(x - owned[k].cx, z - owned[k].cz) < Math.hypot(x - owned[best].cx, z - owned[best].cz)) best = k;
        counts[best]++;
        total++;
      }
    const { perCell, min, max } = TERRITORY.income;
    const gold = Math.min(max, Math.max(min, total * perCell));
    owned.forEach((island, k) => this.islands[island.id].addSpoils({ gold: Math.round((gold * (total ? counts[k] / total : k === 0 ? 1 : 0))), wood: 0 }));
    return Math.round(gold);
  }

  snapshot(): string {
    return encodeOwners(this.owner, this);
  }

  /** Reprend une sauvegarde ; faux si elle est illisible (ou d'une autre grille) : on garde alors le partage de départ. */
  restore(text: string | undefined): boolean {
    const owners = text ? decodeOwners(text, this) : null;
    if (!owners) return false;
    this.owner.set(owners);
    this.pressure.fill(0);
    this.refreshIslands();
    return true;
  }

  private center(c: number, r: number): [number, number] {
    return [this.originX + (c + 0.5) * this.cell, this.originZ + (r + 0.5) * this.cell];
  }

  private noise(x: number, z: number): number {
    return fractalNoise(x, z, TERRITORY.noise.octaves, NOISE_SEED);
  }

  /** Remplit les cases de la Marine autour de (x, z), inégalement ; une case pleine bascule à toi. */
  private fill(x: number, z: number, radius: number, amount: number) {
    let changed = false;
    this.cells(x, z, radius * (1 + TERRITORY.noise.amount), (i, d, cx, cz) => {
      if (this.owner[i] !== NAVY || this.lock[i] !== FREE) return;
      const reach = radius * (1 + TERRITORY.noise.amount * this.noise(cx, cz));
      if (d >= reach) return;
      this.pressure[i] += amount * (1 - d / reach);
      if (this.pressure[i] < 1) return;
      this.pressure[i] = 0;
      this.owner[i] = PLAYER;
      changed = true;
    });
    if (changed) this.version++;
  }

  private decay(dt: number) {
    const k = TERRITORY.presence.decay * dt;
    for (let i = 0; i < this.pressure.length; i++) if (this.pressure[i] > 0) this.pressure[i] = Math.max(0, this.pressure[i] - k);
  }

  /** Une poussée au hasard : la Marine contre toi, ou Marine et pirates l'un contre l'autre. */
  private push(guards: readonly Guard[]) {
    const p = TERRITORY.push;
    const againstPlayer = Math.random() < p.player;
    const [from, to] = againstPlayer ? [NAVY, PLAYER] : Math.random() < p.navyWins ? [NAVY, PIRATE] : [PIRATE, NAVY];
    const start = this.borderCell(from, to);
    if (start < 0) return;
    const [x, z] = this.center(start % this.size, Math.floor(start / this.size));
    const radius = rand(p.radius);
    let taken = 0;
    this.cells(x, z, radius * (1 + TERRITORY.noise.amount), (i, d, cx, cz) => {
      if (this.owner[i] !== to || this.lock[i] !== FREE) return;
      if (d >= radius * (1 + TERRITORY.noise.amount * this.noise(cx, cz))) return;
      if (guards.some((g) => Math.hypot(cx - g.x, cz - g.z) < g.radius)) return;
      this.owner[i] = from;
      this.pressure[i] = 0;
      taken++;
    });
    if (!taken) return;
    this.version++;
    if (to === PLAYER) this.events.lost(this.nearestIsland(x, z));
  }

  /** Une case libre de `from` qui touche une case libre de `to`, tirée au hasard (−1 si aucune trouvée). */
  private borderCell(from: Owner, to: Owner): number {
    const n = this.size;
    for (let t = 0; t < TERRITORY.push.tries; t++) {
      const i = Math.floor(Math.random() * this.owner.length);
      if (this.owner[i] !== from || this.lock[i] === OUTSIDE) continue;
      const c = i % n;
      const r = Math.floor(i / n);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= n || rr >= n) continue;
        const j = rr * n + cc;
        if (this.owner[j] === to && this.lock[j] === FREE) return j;
      }
    }
    return -1;
  }

  private nearestIsland(x: number, z: number): IslandId {
    let best = ISLAND_LIST[0];
    for (const i of ISLAND_LIST) if (Math.hypot(x - i.cx, z - i.cz) < Math.hypot(x - best.cx, z - best.cz)) best = i;
    return best.id;
  }

  /** Chaque case dont le centre est à moins de `radius` m de (x, z) : indice, distance, centre. */
  private cells(x: number, z: number, radius: number, visit: (i: number, d: number, cx: number, cz: number) => void) {
    const { cell, size } = this;
    const c0 = Math.max(0, Math.floor((x - radius - this.originX) / cell));
    const c1 = Math.min(size - 1, Math.floor((x + radius - this.originX) / cell));
    const r0 = Math.max(0, Math.floor((z - radius - this.originZ) / cell));
    const r1 = Math.min(size - 1, Math.floor((z + radius - this.originZ) / cell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cx = this.originX + (c + 0.5) * cell;
        const cz = this.originZ + (r + 0.5) * cell;
        const d = Math.hypot(cx - x, cz - z);
        if (d < radius) visit(r * size + c, d, cx, cz);
      }
  }
}
