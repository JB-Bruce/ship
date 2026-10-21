import { FORMATION_NAMES, ORDERS } from '../config';
import type { Formation } from '../fleet/fleet';
import { ParchmentMenu } from './parchmentMenu';
import './orderWheel.css';

/** Ce que la roue lit du jeu et les ordres qu'elle donne. */
export interface WheelActions {
  formation(): Formation;
  setFormation(f: Formation): void;
  /** Escorte en cours : les suiveurs entourent le navire à protéger, la formation attendra. */
  escorting(): boolean;
  /** Un ennemi est-il à portée d'« Attaquer » ? */
  canAttack(): boolean;
  /** Lance la flotte sur l'ennemi le plus proche : le nom de son type, ou null. */
  attack(): string | null;
  /** Nombre de navires qui te suivent (hors navires en commerce). */
  followers(): number;
  rally(): void;
  /** Le navire suivant de la flotte à flot, ou null. */
  nextHelm(): string | null;
  takeNextHelm(): void;
  openCabin(): void;
  say(text: string, tone: 'info' | 'good' | 'danger'): void;
  /** Fige le regard de la vue du barreur pendant que la souris vise un ordre. */
  freezeLook(on: boolean): void;
}

type ItemId = Formation | 'attack' | 'rally' | 'helm' | 'cabin';
interface Item {
  id: ItemId;
  label: string;
  hint: string;
  icon: string;
}

const ITEMS: readonly Item[] = [
  { id: 'vee', label: FORMATION_NAMES.vee, hint: 'Formation en V derrière toi', icon: 'M4 7L12 17L20 7' },
  { id: 'line', label: FORMATION_NAMES.line, hint: 'Formation en ligne, flanc à flanc', icon: 'M3 12H21M6 9V15M12 9V15M18 9V15' },
  { id: 'column', label: FORMATION_NAMES.column, hint: 'Formation en file derrière toi', icon: 'M12 3V21M9 6H15M9 12H15M9 18H15' },
  { id: 'free', label: FORMATION_NAMES.free, hint: 'Chaque navire choisit sa place', icon: 'M6 7h.01M17 6h.01M9 16h.01M18 17h.01M12 11h.01' },
  { id: 'attack', label: 'Attaquer', hint: 'Toute la flotte sur l’ennemi le plus proche', icon: 'M5 19L19 5M14 5H19V10M5 14L10 19' },
  { id: 'rally', label: 'Rallier', hint: 'Les navires rompent le combat et reviennent près de toi', icon: 'M12 4a8 8 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0' },
  { id: 'helm', label: 'Barre', hint: 'Prendre la barre du navire suivant', icon: 'M12 5a7 7 0 1 0 .01 0M12 2V22M2 12H22' },
  { id: 'cabin', label: 'Cabine', hint: 'La Cabine du capitaine, page Flotte', icon: 'M4 8L12 4L20 8V16L12 20L4 16ZM4 8L12 12L20 8M12 12V20' },
];
/** Dessin de la roue (px) : taille, rayon où sont posés les ordres, disque central. */
const SIZE = 480;
const RING = 152;
const HUB = 92;
const STEP = (2 * Math.PI) / ITEMS.length;

let current: OrderWheel | null = null;

/**
 * Roue d'ordres de la flotte : maintenir T l'ouvre au centre de l'écran, le jeu tourne au ralenti (ORDERS.slow) ; la
 * souris vise un ordre (le mouvement compte, même souris capturée), et relâcher T le donne ; relâcher sans viser ne
 * fait rien. Ordres : les quatre formations, Attaquer, Rallier, la barre du navire suivant, la Cabine. Un ordre
 * impossible (personne à attaquer, aucun navire à rallier…) est grisé, avec la raison au centre.
 */
export class OrderWheel {
  private readonly root: HTMLElement;
  private readonly segments: HTMLButtonElement[] = [];
  private readonly pointer: SVGPathElement;
  private readonly label: HTMLElement;
  private readonly hint: HTMLElement;
  private open = false;
  private pick = -1;
  private vx = 0;
  private vy = 0;

  /** Facteur de vitesse du jeu : ralenti tant que la roue est ouverte. */
  static timeScale(): number {
    return current?.open ? ORDERS.slow : 1;
  }

  constructor(
    parent: HTMLElement,
    private readonly actions: WheelActions,
  ) {
    current = this;
    this.root = document.createElement('div');
    this.root.className = 'wheel-root';
    const spokes = ITEMS.map((_, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * STEP;
      const c = SIZE / 2;
      return `M${(c + Math.cos(a) * HUB).toFixed(1)} ${(c + Math.sin(a) * HUB).toFixed(1)}L${(c + Math.cos(a) * (SIZE / 2 - 30)).toFixed(1)} ${(c + Math.sin(a) * (SIZE / 2 - 30)).toFixed(1)}`;
    }).join('');
    this.root.innerHTML = `
      <div class="wheel">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true"><circle class="wheel-ring" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 30}"/><path class="wheel-spokes" d="${spokes}"/><circle class="wheel-hub" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${HUB}"/><path class="wheel-pointer" d=""/></svg>
        ${ITEMS.map((item, i) => {
          const a = -Math.PI / 2 + i * STEP;
          return `<button class="wheel-seg" style="left:${(SIZE / 2 + Math.cos(a) * RING).toFixed(0)}px;top:${(SIZE / 2 + Math.sin(a) * RING).toFixed(0)}px" data-index="${i}" aria-label="${item.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${item.icon}"/></svg><span>${item.label}</span></button>`;
        }).join('')}
        <div class="wheel-center"><b></b><span></span></div>
      </div>
      <p class="wheel-help">Maintiens T · vise un ordre à la souris · relâche pour le donner</p>`;
    parent.appendChild(this.root);
    this.segments.push(...this.root.querySelectorAll<HTMLButtonElement>('.wheel-seg'));
    this.pointer = this.root.querySelector('.wheel-pointer')!;
    this.label = this.root.querySelector('.wheel-center b')!;
    this.hint = this.root.querySelector('.wheel-center span')!;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.close();
      if (e.code !== 'KeyT' || e.repeat || this.open || ParchmentMenu.anyOpen()) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.show();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyT' && this.open) this.commit();
    });
    window.addEventListener('blur', () => this.close());
    document.addEventListener('mousemove', (e) => {
      if (!this.open) return;
      this.vx += e.movementX;
      this.vy += e.movementY;
      const length = Math.hypot(this.vx, this.vy);
      if (length > ORDERS.reach) {
        this.vx *= ORDERS.reach / length;
        this.vy *= ORDERS.reach / length;
      }
      if (length > ORDERS.deadzone) this.select(Math.round(Math.atan2(this.vx, -this.vy) / STEP + ITEMS.length) % ITEMS.length);
    });
    this.segments.forEach((seg, i) => {
      seg.addEventListener('mouseenter', () => this.select(i));
      seg.addEventListener('click', () => {
        this.select(i);
        this.commit();
      });
    });
  }

  private show() {
    this.open = true;
    this.pick = -1;
    this.vx = this.vy = 0;
    this.actions.freezeLook(true);
    // Ce qui est possible maintenant : formation en cours, ordres grisés.
    const formation = this.actions.formation();
    ITEMS.forEach((item, i) => {
      this.segments[i].classList.toggle('current', item.id === formation);
      this.segments[i].classList.toggle('off', this.why(item) !== null);
    });
    this.select(-1);
    this.root.classList.add('on');
  }

  private close() {
    if (!this.open) return;
    this.open = false;
    this.actions.freezeLook(false);
    this.root.classList.remove('on');
  }

  /** Pourquoi un ordre ne peut pas être donné maintenant (null : il peut). */
  private why(item: Item): string | null {
    const a = this.actions;
    if (item.id === 'attack' && !a.canAttack()) return `Aucun ennemi à moins de ${ORDERS.attackRange} m`;
    if ((item.id === 'attack' || item.id === 'rally') && a.followers() === 0) return 'Aucun navire ne te suit';
    if (item.id === 'helm' && !a.nextHelm()) return 'Aucun autre navire à flot';
    return null;
  }

  private select(index: number) {
    this.pick = index;
    this.segments.forEach((seg, i) => seg.classList.toggle('on', i === index));
    const item = ITEMS[index];
    if (!item) {
      this.label.textContent = 'Ordres';
      this.hint.textContent = 'Vise un ordre, puis relâche T';
      this.pointer.setAttribute('d', '');
      return;
    }
    this.label.textContent = item.label;
    this.hint.textContent = this.why(item) ?? (this.actions.escorting() && item.id in FORMATION_NAMES ? 'Escorte en cours : la formation reprendra à l’arrivée' : item.hint);
    const a = -Math.PI / 2 + index * STEP;
    const c = SIZE / 2;
    const at = (angle: number, r: number) => `${(c + Math.cos(angle) * r).toFixed(1)} ${(c + Math.sin(angle) * r).toFixed(1)}`;
    this.pointer.setAttribute('d', `M${at(a, HUB + 10)}L${at(a + 0.25, HUB - 12)}L${at(a - 0.25, HUB - 12)}Z`);
  }

  /** Relâché : l'ordre visé est donné (s'il est possible), puis la roue se ferme. */
  private commit() {
    const item = ITEMS[this.pick];
    this.close();
    if (!item || ParchmentMenu.anyOpen()) return;
    const a = this.actions;
    const why = this.why(item);
    if (why) {
      a.say(why, 'info');
      return;
    }
    switch (item.id) {
      case 'attack':
        a.say(`Toute la flotte à l’attaque : ${a.attack()} !`, 'good');
        break;
      case 'rally':
        a.rally();
        a.say('Ralliement : la flotte reprend sa place', 'good');
        break;
      case 'helm':
        a.takeNextHelm();
        break;
      case 'cabin':
        a.openCabin();
        break;
      default:
        a.setFormation(item.id);
        a.say(`Formation : ${item.label}`, 'good');
    }
  }
}
