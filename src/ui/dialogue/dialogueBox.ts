import { DIALOGUE } from '../../config';
import { sound } from '../../audio/sound';
import { CHARACTERS } from '../../story/characters';
import type { Dialogue, DialogueStep } from '../../story/dialogueTypes';
import { ParchmentMenu } from '../parchmentMenu';
import { Portrait } from './portrait';
import './dialogue.css';

/** Touches qui font avancer la conversation (ou finir d'écrire la réplique en cours). */
const NEXT_KEYS = ['Space', 'Enter', 'NumpadEnter'];
/** Touches des réponses : 1 à 4, en haut du clavier ou sur le pavé numérique. */
const CHOICE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const NUMPAD_KEYS = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];

/**
 * Boîte de dialogue, utilisée partout dans le jeu : en bas de l'écran, le buste en 3D de celui qui parle (portrait.ts),
 * son nom et son titre, sa réplique qui s'écrit lettre à lettre, puis tes réponses s'il y en a. Clic, Espace ou Entrée :
 * finir la réplique, puis passer à la suivante ; 1 à 4 : choisir une réponse. Pendant une conversation, les autres
 * menus et touches du jeu se taisent (`ParchmentMenu.locked`). `play` rend les choix notés (`DialogueChoice.flag`).
 */
export class DialogueBox {
  private readonly root = document.createElement('div');
  /** Voile sur tout l'écran : assombrit le bas et prend les clics (un clic n'importe où fait avancer). */
  private readonly veil = document.createElement('div');
  private readonly portrait = new Portrait();
  private readonly name: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly next: HTMLElement;
  private dialogue: Dialogue | null = null;
  private index = 0;
  private shown = 0;
  private typing = 0;
  private flags = new Set<string>();
  private done: ((flags: Set<string>) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root.className = 'dialogue';
    this.root.innerHTML = `
      <div class="dialogue-frame"></div>
      <div class="dialogue-body">
        <div class="dialogue-name"><b></b><span></span></div>
        <p class="dialogue-text"></p>
        <div class="dialogue-choices"></div>
        <span class="dialogue-next">Clic ou Espace ▾</span>
      </div>`;
    this.root.querySelector('.dialogue-frame')!.appendChild(this.portrait.canvas);
    this.name = this.root.querySelector('.dialogue-name b')!;
    this.title = this.root.querySelector('.dialogue-name span')!;
    this.text = this.root.querySelector('.dialogue-text')!;
    this.choices = this.root.querySelector('.dialogue-choices')!;
    this.next = this.root.querySelector('.dialogue-next')!;
    this.veil.className = 'dialogue-veil';
    parent.append(this.veil, this.root);
    // Une nouvelle partie demandée en jeu commence sans menu : le premier clic de la conversation allume le son.
    this.veil.addEventListener('pointerdown', () => void sound.unlock());
    this.root.addEventListener('pointerdown', () => void sound.unlock());
    this.veil.addEventListener('click', () => this.advance());
    this.root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-choice]');
      if (button) this.choose(Number(button.dataset.choice));
      else this.advance();
    });
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get open(): boolean {
    return this.dialogue !== null;
  }

  /** Joue une conversation ; la promesse rend les choix notés quand elle se termine. */
  play(dialogue: Dialogue): Promise<Set<string>> {
    this.dialogue = dialogue;
    this.flags = new Set();
    ParchmentMenu.locked = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.root.classList.add('on');
    this.veil.classList.add('on');
    document.body.classList.add('dialogue-open');
    sound.play('ui/paper');
    this.portrait.start();
    this.show(0);
    return new Promise((resolve) => (this.done = resolve));
  }

  private get step(): DialogueStep {
    return this.dialogue!.steps[this.index];
  }

  private show(index: number) {
    this.index = index;
    const step = this.step;
    const who = CHARACTERS[step.say];
    if (this.name.textContent !== who.name) this.portrait.show(who.look);
    this.name.textContent = who.name;
    this.title.textContent = who.title;
    this.choices.innerHTML = '';
    this.next.hidden = true;
    this.shown = 0;
    this.text.textContent = '';
    this.portrait.talking = true;
    const start = performance.now();
    const write = (now: number) => {
      const count = Math.min(step.text.length, Math.floor(((now - start) / 1000) * DIALOGUE.charsPerSecond));
      if (count !== this.shown) {
        this.shown = count;
        this.text.textContent = step.text.slice(0, count);
      }
      if (count < step.text.length) this.typing = requestAnimationFrame(write);
      else this.finishLine();
    };
    this.typing = requestAnimationFrame(write);
  }

  /** La réplique est écrite en entier : les réponses, ou l'invite à continuer. */
  private finishLine() {
    cancelAnimationFrame(this.typing);
    this.typing = 0;
    const step = this.step;
    this.text.textContent = step.text;
    this.shown = step.text.length;
    this.portrait.talking = false;
    if (step.choices) this.choices.innerHTML = step.choices.map((c, i) => `<button class="dialogue-choice" data-choice="${i}"><span>${i + 1}</span>${c.text}</button>`).join('');
    else this.next.hidden = false;
  }

  private advance() {
    if (!this.dialogue) return;
    if (this.typing) return this.finishLine();
    const step = this.step;
    if (step.choices) return;
    if (step.end) return this.close();
    this.goTo(step.goto);
  }

  private choose(i: number) {
    const choice = this.step.choices?.[i];
    if (!choice || this.typing) return;
    sound.play('ui/wood_click');
    if (choice.flag) this.flags.add(choice.flag);
    if (this.step.end) return this.close();
    this.goTo(choice.goto);
  }

  /** L'étape `id`, sinon la suivante ; au bout de la liste, la conversation se termine. */
  private goTo(id?: string) {
    const steps = this.dialogue!.steps;
    const index = id ? steps.findIndex((s) => s.id === id) : this.index + 1;
    if (index < 0 || index >= steps.length) return this.close();
    this.show(index);
  }

  private close() {
    this.root.classList.remove('on');
    this.veil.classList.remove('on');
    document.body.classList.remove('dialogue-open');
    this.portrait.stop();
    this.dialogue = null;
    ParchmentMenu.locked = false;
    const done = this.done;
    this.done = null;
    done?.(this.flags);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.dialogue) return;
    const pick = Math.max(CHOICE_KEYS.indexOf(e.code), NUMPAD_KEYS.indexOf(e.code));
    if (NEXT_KEYS.includes(e.code) || pick >= 0) {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (pick >= 0) this.choose(pick);
      else this.advance();
      return;
    }
    // Les autres touches du jeu se taisent pendant la conversation.
    e.stopPropagation();
  }
}
