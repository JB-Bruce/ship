import { STORY_QUEST, type IslandId } from '../config';
import { fleetStock, unload } from '../fleet/holds';
import type { DialogueBox } from '../ui/dialogue/dialogueBox';
import type { Enemy } from '../world/enemySpawner';
import type { Dialogue } from './dialogueTypes';
import { GASPARD_SILENCE } from './dialogues/gaspardSilence';
import { ISAURE_MEDALLION } from './dialogues/isaureMedallion';
import { ISAURE_MEETING } from './dialogues/isaureMeeting';
import { KERDAL_INTRO } from './dialogues/kerdalIntro';
import type { MainQuest } from './mainQuest';
import { QuestRun, type QuestWorld } from './questRun';

/**
 * Fait avancer la quête principale : joue la conversation de chaque étape au bon moment, note les choix du joueur
 * (`MainQuest.flags`) et passe à l'étape suivante. Ouverture : Kerdal sur le quai de la Tortue ; puis Isaure, à la
 * taverne de Port-Sabre (la rencontre, le médaillon, le rhum de Gaspard). Les étapes en mer sont dans `QuestRun`.
 */
export class StoryDirector {
  private readonly run: QuestRun;

  constructor(
    private readonly quest: MainQuest,
    private readonly box: DialogueBox,
    private readonly w: QuestWorld,
  ) {
    this.run = new QuestRun(quest, w);
  }

  /** Une conversation est en cours. */
  get talking(): boolean {
    return this.box.open;
  }

  update(dt: number) {
    this.run.update(dt);
  }

  /** Un navire ennemi a sombré (`byFleet` : coulé par ta flotte). */
  enemySunk(enemy: Enemy, byFleet: boolean) {
    this.run.enemySunk(enemy, byFleet);
  }

  /** Navire de l'histoire à montrer dans la barre du haut. */
  target(): Enemy | null {
    return this.run.target();
  }

  /** Nouvelle partie : Kerdal confie sa chaloupe et envoie le joueur chercher Isaure. */
  async opening() {
    await this.talk(KERDAL_INTRO);
    this.advance('findIsaure');
  }

  /** Une taverne s'ouvre : à celle de Port-Sabre, Isaure (et Gaspard) attendent selon l'étape. */
  async tavernOpened(island: IslandId) {
    if (island !== 'sabre' || this.box.open) return;
    switch (this.quest.step) {
      case 'findIsaure':
        await this.talk(ISAURE_MEETING);
        return this.advance('aRealShip');
      case 'returnIsaure':
        await this.talk(ISAURE_MEDALLION);
        return this.advance('silence');
      case 'silence': {
        const hand = this.w.fleet.hand;
        const rum = fleetStock(hand, 'rum');
        if (rum < STORY_QUEST.rum) {
          this.w.hud.toast(`Gaspard attend ses ${STORY_QUEST.rum} caisses de rhum (tu en as ${rum} dans tes cales)`);
          return;
        }
        unload(hand, 'rum', STORY_QUEST.rum);
        await this.talk(GASPARD_SILENCE);
        this.quest.flags.add('isaurePiece');
        this.w.hud.log('🗺 Morceau de la carte de Lagrange (Journal de la Cabine)');
        this.run.complete('silence', 'nextChapter');
      }
    }
  }

  private async talk(dialogue: Dialogue) {
    const flags = await this.box.play(dialogue);
    for (const f of flags) this.quest.flags.add(f);
  }

  private advance(step: MainQuest['step']) {
    this.quest.advance(step);
    const s = this.quest.current;
    if (s) this.w.hud.chapter(s.title, s.note);
  }
}
