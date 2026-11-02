import { STORY_QUEST, type IslandId } from '../config';
import type { MapZone } from '../missions/mission';
import { revealTypes } from '../progression/blueprints';
import type { Objective } from '../progression/navyIsland';

/**
 * Où en est la quête principale :
 * - `intro` : la partie commence, Kerdal attend sur le quai de la Tortue ;
 * - à la Tortue, chaque petite quête se rapporte à Kerdal au port (P) : `kerdalFish` (lui pêcher du poisson),
 *   `firstUpgrade` (améliorer un navire au Chantier), `coveRats` (couler les barques de la Marine au large),
 *   `portRepair` (construire un bâtiment de la Tortue à la Capitainerie) ;
 * - `findIsaure` : retrouver Isaure Mercier à la taverne de Port-Sabre ;
 * - `aRealShip` : avoir un sloop (ou mieux) et engager un officier ;
 * - `hangman` : couler Le Faucon du lieutenant Duroc, au large de l'Île du Dauphin ;
 * - `greenLights` : couler des navires maudits (ils surgissent chaque nuit, à coup sûr au Banc du Naufragé) ;
 * - `medallion` : repêcher le médaillon que le dernier a laissé ;
 * - `returnIsaure` : le rapporter à Isaure ;
 * - `silence` : acheter le silence du tavernier de Port-Sabre avec du rhum ;
 * - `nextChapter` : la suite de l'histoire viendra.
 */
export type QuestStep = 'intro' | 'kerdalFish' | 'firstUpgrade' | 'coveRats' | 'portRepair' | 'findIsaure' | 'aRealShip' | 'hangman' | 'greenLights' | 'medallion' | 'returnIsaure' | 'silence' | 'nextChapter';

/** Ordre des étapes. */
export const QUEST_ORDER: readonly QuestStep[] = ['intro', 'kerdalFish', 'firstUpgrade', 'coveRats', 'portRepair', 'findIsaure', 'aRealShip', 'hangman', 'greenLights', 'medallion', 'returnIsaure', 'silence', 'nextChapter'];

/** Ce qu'une sauvegarde garde de l'histoire : l'étape, les choix notés, l'avancement de l'étape et le médaillon. */
export interface StorySnapshot {
  step: QuestStep | 'proveYourself';
  flags: string[];
  count?: number;
  relic?: [number, number] | null;
}

/** Ce que chaque étape montre dans le suivi des objectifs (en haut à droite), le port qu'elle vise et sa zone sur la carte. */
const STEPS: Record<QuestStep, { title: string; note: string; port?: IslandId; zone?: { at: [number, number]; radius: number } } | null> = {
  intro: null,
  kerdalFish: { title: '⚓ Prologue : Le poisson du Vieux', note: `Pêcher ${STORY_QUEST.tortuga.fish} poissons (F près d’un banc) et les rapporter à Kerdal, au port de la Tortue`, port: 'tortuga' },
  firstUpgrade: { title: '⚓ Prologue : Une coque qui tient la mer', note: 'Améliorer un navire au Chantier, puis revoir Kerdal au port de la Tortue', port: 'tortuga' },
  coveRats: { title: '⚓ Prologue : Les rats de la crique', note: 'Couler les barques de la Marine au sud de la Tortue, puis revoir Kerdal', port: 'tortuga', zone: STORY_QUEST.tortuga.rats },
  portRepair: { title: '⚓ Prologue : Remettre le port d’aplomb', note: 'Construire un bâtiment de la Tortue à la Capitainerie, puis revoir Kerdal', port: 'tortuga' },
  findIsaure: { title: '⚓ Chapitre I : La navigatrice', note: 'Trouver Isaure Mercier à la taverne de Port-Sabre', port: 'sabre' },
  aRealShip: { title: '⚓ Chapitre I : Un navire digne de ce nom', note: 'Posséder un vrai navire (plus grand qu’une chaloupe) et engager un officier à une taverne' },
  hangman: { title: '⚓ Chapitre I : Le Pendeur', note: 'Couler Le Faucon du lieutenant Duroc, au sud de l’Île du Dauphin', zone: STORY_QUEST.duroc },
  greenLights: { title: '⚓ Chapitre I : Les fanaux verts', note: 'De nuit, couler des navires maudits (on en a vu au Banc du Naufragé)', zone: STORY_QUEST.greenLights },
  medallion: { title: '⚓ Chapitre I : Les fanaux verts', note: 'Repêcher ce que le navire maudit a laissé flotter' },
  returnIsaure: { title: '⚓ Chapitre I : Le médaillon', note: 'Montrer le médaillon à Isaure, à la taverne de Port-Sabre', port: 'sabre' },
  silence: { title: '⚓ Chapitre I : Le prix du silence', note: `Livrer ${STORY_QUEST.rum} caisses de rhum au tavernier de Port-Sabre`, port: 'sabre' },
  nextChapter: { title: '⚓ Chapitre II : à suivre', note: 'La suite de l’histoire arrive bientôt' },
};

/** La quête principale : son étape, les choix faits dans les conversations, et ce qu'elle montre au joueur. */
export class MainQuest {
  step: QuestStep = 'intro';
  readonly flags = new Set<string>();
  /** Avancement de l'étape (maudits coulés…). */
  count = 0;
  /** Où flotte le médaillon (étape `medallion`), ou null. */
  relic: [number, number] | null = null;
  /** Précision du suivi, posée par la mise en scène (« 1 / 2 », cases cochées…). */
  detail = '';

  /** L'étape `step` est-elle déjà franchie ? */
  passed(step: QuestStep): boolean {
    return QUEST_ORDER.indexOf(this.step) > QUEST_ORDER.indexOf(step);
  }

  objectives(): Objective[] {
    const s = STEPS[this.step];
    const note = revealTypes(s?.note ?? '');
    return s ? [{ title: s.title, note: this.detail ? `${note} (${this.detail})` : note }] : [];
  }

  /** Titre et consigne de l'étape, sans l'avancement. */
  get current(): { title: string; note: string } | null {
    const s = STEPS[this.step];
    return s ? { title: s.title, note: revealTypes(s.note) } : null;
  }

  /** Port visé par l'étape en cours (carte, suivi), ou null. */
  get port(): IslandId | null {
    return STEPS[this.step]?.port ?? null;
  }

  /** Zone de l'étape sur la carte M. */
  zones(): MapZone[] {
    const s = STEPS[this.step];
    return s?.zone ? [{ x: s.zone.at[0], z: s.zone.at[1], radius: s.zone.radius, label: s.title.replace(/^⚓ [^:]+: /, '⚓ ') }] : [];
  }

  /** Passe à l'étape `step` (son avancement repart de zéro). */
  advance(step: QuestStep) {
    this.step = step;
    this.count = 0;
    this.detail = '';
  }

  snapshot(): StorySnapshot {
    return { step: this.step, flags: [...this.flags], count: this.count, relic: this.relic };
  }

  /**
   * Une sauvegarde d'avant l'histoire (sans `story`) reprend à la recherche d'Isaure ; l'ancienne étape
   * « Un nom sur les mers » (`proveYourself`) devient la première de la suite (`aRealShip`).
   */
  restore(s: StorySnapshot | undefined) {
    const step = s?.step === 'proveYourself' ? 'aRealShip' : s?.step;
    this.step = step && QUEST_ORDER.includes(step) ? step : 'findIsaure';
    this.flags.clear();
    for (const f of s?.flags ?? []) this.flags.add(f);
    this.count = s?.count ?? 0;
    this.relic = s?.relic ?? null;
    this.detail = '';
  }
}
