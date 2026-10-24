import { TREASURE_HUNTS, type EmblemId, type TreasureHuntId } from '../config';

/** Où en est une chasse commencée : étape en cours, morceaux de carte réunis, avancement de la fouille (s). */
export interface HuntState {
  step: number;
  pieces: number;
  progress: number;
}

/** Ce qu'une sauvegarde garde des chasses au trésor. */
export interface TreasuresSnapshot {
  active: Partial<Record<TreasureHuntId, HuntState>>;
  done: TreasureHuntId[];
}

export const HUNT_IDS = Object.keys(TREASURE_HUNTS) as TreasureHuntId[];

const isHuntId = (id: string): id is TreasureHuntId => id in TREASURE_HUNTS;

/** Emblèmes qu'on ne peut pas acheter : seul le coffre d'une chasse les donne. */
const TREASURE_EMBLEMS = new Set<EmblemId>(HUNT_IDS.map((id) => TREASURE_HUNTS[id].reward.emblem));

/**
 * Chasses au trésor : celles en cours et celles terminées (leurs reliques et leurs emblèmes). État unique, comme
 * `blueprints` : la campagne le remet à zéro, le sauvegarde et le rétablit ; la mise en scène est dans
 * `missions/treasure/`.
 */
class Treasures {
  readonly active = new Map<TreasureHuntId, HuntState>();
  readonly done = new Set<TreasureHuntId>();

  /** Une chasse peut-elle commencer (ni en cours, ni terminée) ? */
  canStart(id: TreasureHuntId): boolean {
    return !this.active.has(id) && !this.done.has(id);
  }

  /** Les chasses qui n'ont pas encore commencé. */
  untouched(): TreasureHuntId[] {
    return HUNT_IDS.filter((id) => this.canStart(id));
  }

  start(id: TreasureHuntId): HuntState | null {
    if (!this.canStart(id)) return null;
    const state = { step: 0, pieces: 0, progress: 0 };
    this.active.set(id, state);
    return state;
  }

  finish(id: TreasureHuntId) {
    this.active.delete(id);
    this.done.add(id);
  }

  /** Bonus de radar des reliques réunies (fraction ajoutée à la portée). */
  radarBonus(): number {
    let bonus = 0;
    for (const id of this.done) bonus += TREASURE_HUNTS[id].reward.relic.radar;
    return bonus;
  }

  /** Emblème réservé à un trésor ? */
  isTreasureEmblem(id: EmblemId): boolean {
    return TREASURE_EMBLEMS.has(id);
  }

  /** Un emblème se montre au chantier : toujours, sauf celui d'un trésor pas encore trouvé. */
  emblemAvailable(id: EmblemId): boolean {
    return !TREASURE_EMBLEMS.has(id) || HUNT_IDS.some((h) => this.done.has(h) && TREASURE_HUNTS[h].reward.emblem === id);
  }

  reset() {
    this.active.clear();
    this.done.clear();
  }

  snapshot(): TreasuresSnapshot {
    return { active: Object.fromEntries([...this.active].map(([id, s]) => [id, { ...s }])), done: [...this.done] };
  }

  /** Reprend une sauvegarde (absente avant la v6 : aucune chasse). La fouille en cours repart de zéro. */
  restore(s: TreasuresSnapshot | undefined) {
    this.reset();
    if (!s) return;
    for (const id of s.done ?? []) if (isHuntId(id)) this.done.add(id);
    for (const [id, h] of Object.entries(s.active ?? {})) {
      if (!isHuntId(id) || this.done.has(id) || !h) continue;
      const steps = TREASURE_HUNTS[id].steps.length;
      this.active.set(id, { step: Math.min(steps - 1, Math.max(0, Math.floor(h.step))), pieces: Math.max(0, Math.floor(h.pieces)), progress: 0 });
    }
  }
}

export const treasures = new Treasures();
