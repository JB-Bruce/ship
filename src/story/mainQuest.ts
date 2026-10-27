import type { IslandId } from '../config';
import type { Objective } from '../progression/navyIsland';

/**
 * Où en est la quête principale : `intro` (la partie commence, Kerdal attend sur le quai de la Tortue), `findIsaure`
 * (retrouver Isaure Mercier à la taverne de Port-Sabre), `proveYourself` (se faire un nom contre les capitaines de la
 * Marine ; la suite de l'histoire viendra).
 */
export type QuestStep = 'intro' | 'findIsaure' | 'proveYourself';

/** Ce qu'une sauvegarde garde de l'histoire : l'étape et les choix notés dans les dialogues. */
export interface StorySnapshot {
  step: QuestStep;
  flags: string[];
}

/** Ce que chaque étape montre dans le suivi des objectifs (en haut à droite), et le port qu'elle vise sur la carte. */
const STEPS: Record<QuestStep, { title: string; note: string; port?: IslandId } | null> = {
  intro: null,
  findIsaure: { title: '⚓ Chapitre I : La navigatrice', note: 'Trouver Isaure Mercier à la taverne de Port-Sabre', port: 'sabre' },
  proveYourself: { title: '⚓ Chapitre I : Un nom sur les mers', note: 'Faire trembler les capitaines de la Marine, puis revoir Isaure (suite à venir)' },
};

/** La quête principale : son étape, les choix faits dans les conversations, et ce qu'elle montre au joueur. */
export class MainQuest {
  step: QuestStep = 'intro';
  readonly flags = new Set<string>();

  objectives(): Objective[] {
    const s = STEPS[this.step];
    return s ? [{ title: s.title, note: s.note }] : [];
  }

  /** Port visé par l'étape en cours (carte, suivi), ou null. */
  get port(): IslandId | null {
    return STEPS[this.step]?.port ?? null;
  }

  snapshot(): StorySnapshot {
    return { step: this.step, flags: [...this.flags] };
  }

  /** Une sauvegarde d'avant l'histoire (sans `story`) reprend à la recherche d'Isaure. */
  restore(s: StorySnapshot | undefined) {
    this.step = s?.step ?? 'findIsaure';
    this.flags.clear();
    for (const f of s?.flags ?? []) this.flags.add(f);
  }
}
