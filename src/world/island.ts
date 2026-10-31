import { ISLANDS, ISLETS, PORT, type IslandId, type IslandShapeDef, type IsletDef, type IsletId } from '../config';
import { Landmass, smoothstep } from './landmass';
import { worldEdge } from './worldEdge';

export { Landmass, SDF } from './landmass';

/** Une île à port (fiche de campagne `ISLAND_INFO`) : son quai au fond de la crique, son village et parfois une ville. */
export class Island extends Landmass {
  override readonly kind = 'island';
  /** Point du rivage au fond de la crique, où se trouve le quai. */
  readonly port: { x: number; z: number };
  /** Où la flotte apparaît : dans la crique, proue vers le large. */
  readonly portSpawn: { x: number; z: number; heading: number };
  /** Centre du replat de la ville derrière le port (IslandShapeDef.town), ou null. */
  readonly town: { x: number; z: number } | null;

  constructor(
    readonly id: IslandId,
    override readonly def: IslandShapeDef,
  ) {
    super(def);
    this.port = this.pointAt(def.bay.angle, 0);
    const spawn = this.pointAt(def.bay.angle, -PORT.spawnOffset);
    this.portSpawn = { ...spawn, heading: def.bay.angle };
    this.town = def.town ? this.pointAt(def.bay.angle, def.town.inland) : null;
  }

  /** Le village s'étale sur un replat autour du port (et la ville sur le sien) ; ailleurs le terrain monte vite. */
  protected override flatness(x: number, z: number): number {
    let flat = smoothstep(25, 110, Math.hypot(x - this.port.x, z - this.port.z));
    const town = this.def.town;
    if (town && this.town) flat = Math.min(flat, smoothstep(town.radius[0], town.radius[1], Math.hypot(x - this.town.x, z - this.town.z)));
    return flat;
  }
}

/** Une île à port ? */
export const isIsland = (land: Landmass): land is Island => land.kind === 'island';

/** Un îlot : terre de décor ou lieu de quête, sans port ni fiche de campagne. */
export class Islet extends Landmass {
  constructor(
    readonly id: IsletId,
    override readonly def: IsletDef,
  ) {
    super(def);
  }
}

export const tortuga = new Island('tortuga', ISLANDS.tortuga);
export const sabre = new Island('sabre', ISLANDS.sabre);
export const royale = new Island('royale', ISLANDS.royale);
export const dauphin = new Island('dauphin', ISLANDS.dauphin);
/** Les îles à port (campagne : allégeance, marché, ports, pirates, marchands…). */
export const ISLAND_LIST: readonly Island[] = [tortuga, sabre, royale, dauphin];
export const castaway = new Islet('castaway', ISLETS.castaway);
/** Le Crâne : îlot rocheux au nord-ouest, où dort l'or de Vasseur (chasse au trésor). */
export const skullIslet = new Islet('skull', ISLETS.skull);
/** Les îlots (décor, lieux de quête). */
export const ISLET_LIST: readonly Islet[] = [castaway, skullIslet];
/** Toutes les terres : navigation, collisions, boulets, vagues, eau, radar, carte. */
export const LAND_LIST: readonly Landmass[] = [...ISLAND_LIST, ...ISLET_LIST];
export const islandById = (id: IslandId): Island => ISLAND_LIST.find((island) => island.id === id)!;

/**
 * Les terres de tout l'archipel (îles et îlots) : chaque question est posée à la terre la plus proche (distance au rivage la plus
 * petite). C'est ce qu'utilisent la navigation, les collisions, les boulets et les vagues.
 */
export const land = {
  /** La terre dont le rivage est le plus proche de (x, z). */
  nearest(x: number, z: number): Landmass {
    let best = LAND_LIST[0];
    let bestDistance = Infinity;
    for (const island of LAND_LIST) {
      const d = island.sdf(x, z);
      if (d < bestDistance) {
        best = island;
        bestDistance = d;
      }
    }
    return best;
  },

  /** Distance signée au rivage le plus proche (m) : positive en mer. */
  sdf(x: number, z: number): number {
    let best = Infinity;
    for (const island of LAND_LIST) best = Math.min(best, island.sdf(x, z));
    return best;
  },

  /** Direction (normalisée) vers le large, là où la distance au rivage augmente. */
  gradient(x: number, z: number, out: { x: number; z: number }) {
    const e = 1;
    const gx = this.sdf(x + e, z) - this.sdf(x - e, z);
    const gz = this.sdf(x, z + e) - this.sdf(x, z - e);
    const len = Math.hypot(gx, gz) || 1;
    out.x = gx / len;
    out.z = gz / len;
    return out;
  },

  /** Atténuation des vagues : la plus forte des îles (même formule que le shader). */
  calmAt(x: number, z: number): number {
    let calm = 1;
    for (const island of LAND_LIST) calm = Math.min(calm, island.calmAt(x, z));
    return calm;
  },

  /** Altitude du terrain : celle de la terre la plus proche (fond marin au large). */
  heightAt(x: number, z: number): number {
    return this.nearest(x, z).heightAt(x, z);
  },

  /**
   * Repousse le point (x, z) vers le large jusqu'à `margin` mètres du rivage, après l'avoir ramené en deçà de la
   * limite de la tempête du bord (rien n'apparaît ni ne mouille au-delà).
   */
  keepOffshore(x: number, z: number, margin: number): { x: number; z: number } {
    ({ x, z } = worldEdge.clampInside(x, z));
    const g = { x: 0, z: 0 };
    for (let i = 0; i < 4; i++) {
      const s = this.sdf(x, z);
      if (s >= margin) break;
      this.gradient(x, z, g);
      x += g.x * (margin - s);
      z += g.z * (margin - s);
    }
    return { x, z };
  },
};
