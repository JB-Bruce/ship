import type { LootKind } from '../world/loot';

/** Durée d'affichage (s) d'une ligne « navire coulé », d'une popup de butin, et du fondu final. */
const KILL_TIME = 4;
const PICKUP_TIME = 2;
/** Popup à texte libre (bout de plan ramassé) : plus rare, elle reste plus longtemps. */
const NOTICE_TIME = 4;
const FADE_TIME = 0.6;
/** Lignes « navire coulé » affichées au plus. */
const MAX_KILLS = 5;

/** Ce qui s'annonce à côté des ressources : butin ramassé, poisson pêché. */
export type PickupKind = LootKind | 'fish';
const PICKUP_NAMES: Record<PickupKind, (amount: number) => string> = {
  gold: () => 'or',
  wood: () => 'bois',
  rum: () => 'rhum',
  spices: () => 'épices',
  fish: (n) => (n > 1 ? 'poissons' : 'poisson'),
};

interface Item {
  readonly el: HTMLElement;
  time: number;
  /** Pour les popups de butin : ce qu'elles additionnent (`notice` : texte libre, qui ne s'additionne pas). */
  readonly kind?: PickupKind | 'notice';
  amount: number;
}

/**
 * Petites notifications : les navires coulés (en haut à droite, comme un fil d'actualité) et le butin ramassé
 * (à côté des ressources ; plusieurs caisses d'affilée s'additionnent dans la même popup).
 */
export class Notifications {
  private readonly feed: HTMLElement;
  private readonly pickups: HTMLElement;
  private readonly items: Item[] = [];

  /** `feedParent` : où ajouter le fil (coin haut droit) ; `beside` : le panneau des ressources, à droite duquel s'affichent les popups de butin. */
  constructor(feedParent: HTMLElement, beside: HTMLElement) {
    this.feed = document.createElement('div');
    this.feed.className = 'notif-feed';
    this.pickups = document.createElement('div');
    this.pickups.className = 'notif-pickups';
    feedParent.appendChild(this.feed);
    beside.appendChild(this.pickups);
  }

  /** Une ligne dans le fil des navires coulés. */
  kill(text: string) {
    const el = document.createElement('div');
    el.className = 'notif-kill';
    el.textContent = text;
    this.feed.appendChild(el);
    this.items.push({ el, time: KILL_TIME, amount: 0 });
    const kills = this.items.filter((i) => i.kind === undefined);
    if (kills.length > MAX_KILLS) kills[0].time = Math.min(kills[0].time, FADE_TIME);
  }

  /** Butin ramassé : s'ajoute à la popup du même type encore affichée, sinon en crée une. */
  pickup(kind: PickupKind, amount: number) {
    let item = this.items.find((i) => i.kind === kind && i.time > FADE_TIME);
    if (!item) {
      const el = document.createElement('div');
      el.className = `notif-pickup ${kind}`;
      this.pickups.appendChild(el);
      item = { el, time: 0, kind, amount: 0 };
      this.items.push(item);
    }
    item.amount += amount;
    item.time = PICKUP_TIME;
    item.el.textContent = `+${item.amount} ${PICKUP_NAMES[kind](item.amount)}`;
    item.el.style.opacity = '1';
  }

  /** Popup à texte libre à côté des ressources (« 📜 Plan de navire inconnu · 2/5 ») ; `className` donne sa couleur. */
  notice(text: string, className: string) {
    const el = document.createElement('div');
    el.className = `notif-pickup ${className}`;
    el.textContent = text;
    this.pickups.appendChild(el);
    this.items.push({ el, time: NOTICE_TIME, kind: 'notice', amount: 0 });
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.time -= dt;
      if (item.time <= 0) {
        item.el.remove();
        this.items.splice(i, 1);
      } else if (item.time < FADE_TIME) {
        item.el.style.opacity = String(item.time / FADE_TIME);
      }
    }
  }
}
