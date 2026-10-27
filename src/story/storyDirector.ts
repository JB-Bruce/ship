import type { IslandId } from '../config';
import type { DialogueBox } from '../ui/dialogue/dialogueBox';
import type { Dialogue } from './dialogueTypes';
import { ISAURE_MEETING } from './dialogues/isaureMeeting';
import { KERDAL_INTRO } from './dialogues/kerdalIntro';
import type { MainQuest } from './mainQuest';

/** Ce que l'histoire demande au reste du jeu. */
export interface StoryStage {
  /** Une étape franchie : grand bandeau du chapitre. */
  chapter(title: string, note: string): void;
}

/**
 * Fait avancer la quête principale : joue la conversation de chaque étape au bon moment, note les choix du joueur
 * (`MainQuest.flags`) et passe à l'étape suivante. Ouverture : Kerdal sur le quai de la Tortue ; puis Isaure, à la
 * taverne de Port-Sabre.
 */
export class StoryDirector {
  constructor(
    private readonly quest: MainQuest,
    private readonly box: DialogueBox,
    private readonly stage: StoryStage,
  ) {}

  /** Une conversation est en cours. */
  get talking(): boolean {
    return this.box.open;
  }

  /** Nouvelle partie : Kerdal confie sa chaloupe et envoie le joueur chercher Isaure. */
  async opening() {
    await this.talk(KERDAL_INTRO);
    this.advance('findIsaure');
  }

  /** Une taverne s'ouvre : Isaure attend à celle de Port-Sabre. */
  async tavernOpened(island: IslandId) {
    if (this.quest.step !== 'findIsaure' || island !== 'sabre' || this.box.open) return;
    await this.talk(ISAURE_MEETING);
    this.advance('proveYourself');
  }

  private async talk(dialogue: Dialogue) {
    const flags = await this.box.play(dialogue);
    for (const f of flags) this.quest.flags.add(f);
  }

  private advance(step: MainQuest['step']) {
    this.quest.step = step;
    const [objective] = this.quest.objectives();
    if (objective) this.stage.chapter(objective.title, objective.note);
  }
}
