import { EMBLEMS, TREASURE_HUNTS, type TreasureHuntId } from '../../config';
import { blueprints, shipTypeLabel } from '../../progression/blueprints';
import type { Objective } from '../../progression/navyIsland';
import type { PlayerState } from '../../progression/playerState';
import { treasures } from '../../progression/treasures';
import { SHIP_SIZE_ORDER } from '../../shipTypes';
import type { MapZone, MissionWorld } from '../mission';
import { TreasureRun, type SearchGauge } from './treasureRun';
import { music } from '../../audio/musicDirector';
import { sound } from '../../audio/sound';

/** D'où vient une chasse : rumeur achetée, bout de carte d'une élite, découverte en explorant, mission spéciale. */
export type TreasureSource = 'rumor' | 'elite' | 'explore' | 'special';

/** Ce que les chasses font savoir au joueur. */
export interface TreasureHud {
  toast(text: string, tone?: 'info' | 'good' | 'danger'): void;
  alert(text: string, danger: boolean): void;
  log(text: string): void;
}

const OPENINGS: Record<TreasureSource, string> = {
  rumor: 'Tu as acheté une rumeur',
  elite: 'Un bout de carte au trésor flottait dans l’épave',
  explore: 'Tu as découvert la trace d’un trésor',
  special: 'Ta mission t’a mis sur la piste d’un trésor',
};

/**
 * Directeur des chasses au trésor : il démarre une chasse (par sa rumeur, un bout de carte d'élite, une découverte
 * ou une mission spéciale : `start`), fait avancer celles en cours (`TreasureRun`) et verse le coffre au bout.
 * L'état durable est dans `treasures` (progression/treasures.ts) ; au chargement, les chasses reprennent à leur étape.
 */
export class TreasureDirector {
  private readonly runs = new Map<TreasureHuntId, TreasureRun>();

  constructor(
    private readonly world: MissionWorld,
    private readonly state: PlayerState,
    private readonly hud: TreasureHud,
  ) {}

  /** Une chasse commence (si elle n'est ni en cours ni finie). Renvoie vrai si elle a commencé. */
  start(id: TreasureHuntId, source: TreasureSource): boolean {
    const state = treasures.start(id);
    if (!state) return false;
    this.launch(id);
    const def = TREASURE_HUNTS[id];
    this.hud.alert(`🗝 ${OPENINGS[source]} : ${def.title} !`, false);
    this.hud.log(`🗝 Chasse au trésor : ${def.title} (Journal de la Cabine)`);
    return true;
  }

  /** Reprend les chasses d'une sauvegarde (après `treasures.restore`). */
  restore() {
    for (const run of this.runs.values()) run.release();
    this.runs.clear();
    for (const id of treasures.active.keys()) this.launch(id);
  }

  private launch(id: TreasureHuntId) {
    const state = treasures.active.get(id);
    if (!state) return;
    this.runs.set(
      id,
      new TreasureRun(id, state, this.world, {
        toast: (text) => this.hud.toast(text),
        alert: (text, danger) => this.hud.alert(text, danger),
        piece: (h) => this.hud.log(`🗺 Morceau de carte : ${treasures.active.get(h)?.pieces ?? 0} / ${TREASURE_HUNTS[h].pieces} (${TREASURE_HUNTS[h].title})`),
        found: (h) => this.reward(h),
      }),
    );
  }

  update(dt: number) {
    for (const [id, run] of this.runs) {
      if (!run.update(dt)) continue;
      run.release();
      this.runs.delete(id);
    }
  }

  /** Le coffre : or, bois, bouts de plan, emblème et relique. */
  private reward(id: TreasureHuntId) {
    const def = TREASURE_HUNTS[id];
    const r = def.reward;
    treasures.finish(id);
    sound.play('ui/chest_open');
    sound.play('ui/coins_big');
    music.stinger();
    this.state.gold += r.gold;
    this.state.wood += r.wood;
    const plans: string[] = [];
    for (let i = 0; i < r.planFragments; i++) {
      // Le plan inconnu le plus petit : le coffre fait avancer la flotte d'un cran.
      const type = SHIP_SIZE_ORDER.find((t) => !blueprints.isUnlocked(t));
      if (!type) break;
      const progress = blueprints.addFragment(type);
      plans.push(progress.completed ? `plan complet : ${shipTypeLabel(type)}` : `bout de plan`);
    }
    this.hud.alert(`🗝 ${def.steps[def.steps.length - 1].found} +${r.gold} or, +${r.wood} bois, et ${r.relic.name} !`, false);
    this.hud.log(`🗝 ${def.title} : trésor trouvé`);
    this.hud.log(`★ Relique : ${r.relic.name} (${r.relic.description})`);
    this.hud.log(`★ Nouvel emblème offert au Chantier : ${EMBLEMS.designs[r.emblem].name}`);
    for (const p of plans) this.hud.log(`📜 Dans le coffre : ${p}`);
  }

  /** Jauge de la fouille en cours (la première trouvée). */
  gauge(): SearchGauge | null {
    for (const run of this.runs.values()) {
      const g = run.gauge();
      if (g) return g;
    }
    return null;
  }

  zones(): MapZone[] {
    return [...this.runs.values()].flatMap((run) => run.zones());
  }

  /** Objectifs du suivi en haut à droite : l'étape en cours de chaque chasse. */
  objectives(): Objective[] {
    return [...this.runs.values()].map((run) => ({ title: `🗝 ${run.def.title}`, note: `${run.step.title} : ${run.step.note}` }));
  }
}
