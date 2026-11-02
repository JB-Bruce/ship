import type { Fleet } from '../fleet/fleet';
import { UnlockPanel } from './unlockPanel';
import { RankBanner } from './rankBanner';
import { fleetHold } from '../fleet/holds';
import { rankName, rankOf } from '../fleet/officers';
import type { PlayerState } from '../progression/playerState';
import type { Ship } from '../ship/ship';
import { typeName } from '../shipTypes';
import { DamageLag } from './damageLag';
import { Notifications } from './notifications';
import { QuestTracker } from './questTracker';
import { SearchGaugeView } from './searchGauge';
import { Toasts, type ToastTone } from './toasts';

/** Intervalle de rafraîchissement du bandeau de flotte (s) : inutile de le refaire à chaque image. */
const FLEET_REFRESH = 0.3;

const MS_TO_KNOTS = 1.944;

/** Interface affichée par-dessus le jeu. Ne touche au DOM que quand une valeur change. */
export class Hud {
  /** Petites notifications : navires coulés, butin ramassé. */
  readonly notifications: Notifications;
  /** Contrats acceptés, en haut à droite (au-dessus du fil des navires coulés). */
  readonly quests: QuestTracker;
  /** Grand panneau « Nouveau navire ! » quand un plan est complet. */
  readonly unlock: UnlockPanel;
  /** Montée en rang d'un navire de ta flotte : son pavillon se hisse en haut de l'écran. */
  readonly rank: RankBanner;
  /** Jauge de fouille d'une chasse au trésor. */
  readonly search: SearchGaugeView;
  private readonly healthFill: HTMLElement;
  private readonly healthDamage: DamageLag;
  private healthShip: Ship | null = null;
  private readonly gold: HTMLElement;
  private readonly wood: HTMLElement;
  private readonly hold: HTMLElement;
  private readonly combat: HTMLElement;
  private readonly sailFill: HTMLElement;
  private readonly sailName: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly crits: HTMLElement;
  private critText = '';
  private readonly banner: HTMLElement;
  private readonly shipName: HTMLElement;
  private readonly fleetStrip: HTMLElement;
  private readonly toasts: Toasts;
  private bannerTime = 0;
  private fleetTimer = 0;
  private last = { sail: -1, knots: -1, health: -1, maxHealth: -1, gold: -1, wood: -1, combat: false };

  constructor(parent: HTMLElement) {
    const root = el('div', 'hud');
    const panel = el('div', 'hud-panel');
    this.shipName = el('div', 'hud-ship-name');
    const health = el('div', 'hud-health');
    const healthLag = health.appendChild(el('div', 'hud-health-lag'));
    this.healthFill = health.appendChild(el('div', 'hud-health-fill'));
    this.healthDamage = new DamageLag(this.healthFill, healthLag, 1);
    const resources = el('div', 'hud-resources');
    this.gold = resources.appendChild(el('span', 'hud-gold'));
    this.wood = resources.appendChild(el('span', 'hud-wood'));
    this.hold = resources.appendChild(el('span', 'hud-hold'));
    const sailGauge = el('div', 'hud-sail-gauge');
    this.sailFill = sailGauge.appendChild(el('div', 'hud-sail-fill'));
    this.sailName = el('div', 'hud-sail');
    this.speed = el('div', 'hud-speed');
    this.crits = el('div', 'hud-crits');
    panel.append(this.shipName, health, resources, sailGauge, this.sailName, this.speed, this.crits);
    this.fleetStrip = el('div', 'hud-fleet');

    this.combat = el('div', 'hud-combat');
    this.combat.textContent = '⚔ À portée de tir';
    this.banner = el('div', 'hud-banner');
    const topRight = el('div', 'hud-top-right');
    root.append(this.fleetStrip, panel, this.combat, this.banner, topRight);
    this.toasts = new Toasts(root);
    parent.appendChild(root);
    this.quests = new QuestTracker(topRight);
    this.notifications = new Notifications(topRight, panel);
    this.unlock = new UnlockPanel(root);
    this.rank = new RankBanner(root);
    this.search = new SearchGaugeView(root);
  }

  /** Petit message d'information en haut de l'écran (achats, pêche, barre…), qui s'efface seul. */
  toast(text: string, seconds = 3, tone: ToastTone = 'info') {
    this.toasts.show(text, seconds, tone);
  }

  /**
   * Grand bandeau au centre de l'écran, réservé aux alertes et aux moments forts (boss, rencontre, naufrage) ;
   * le reste passe par `toast`. `danger` : alerte en rouge.
   */
  message(text: string, seconds = 3, danger = false) {
    this.banner.textContent = text;
    this.banner.classList.add('on');
    this.banner.classList.toggle('danger', danger);
    this.bannerTime = seconds;
  }

  update(dt: number, ship: Ship, state: PlayerState, inCombat: boolean, fleet: Fleet) {
    this.notifications.update(dt);
    this.unlock.update(dt);
    this.rank.update(dt);
    this.toasts.update(dt);
    this.fleetTimer -= dt;
    if (this.fleetTimer <= 0 || dt === 0) {
      this.fleetTimer = FLEET_REFRESH;
      this.renderFleet(fleet);
    }
    const l = this.last;
    const sail = Math.round(ship.controls.sail * 100);
    if (sail !== l.sail) {
      l.sail = sail;
      this.sailName.textContent = sail === 0 ? 'Voile affalée' : sail === 100 ? 'Pleine voile' : `Voile ${sail} %`;
      this.sailFill.style.width = `${sail}%`;
    }
    const knots = Math.round(ship.speed * MS_TO_KNOTS);
    if (knots !== l.knots) {
      l.knots = knots;
      this.speed.textContent = `${knots} nœuds`;
    }
    const health = Math.ceil(ship.health);
    if (health !== l.health || ship.stats.maxHealth !== l.maxHealth) {
      l.health = health;
      l.maxHealth = ship.stats.maxHealth;
      const fraction = health / ship.stats.maxHealth;
      this.healthFill.style.width = `${fraction * 100}%`;
      this.healthFill.classList.toggle('low', fraction < 0.3);
    }
    const fraction = ship.health / ship.stats.maxHealth;
    if (ship !== this.healthShip) this.healthDamage.reset(fraction);
    else this.healthDamage.set(fraction);
    this.healthShip = ship;
    const crits = critsText(ship);
    if (crits !== this.critText) this.crits.textContent = this.critText = crits;
    if (state.gold !== l.gold) {
      l.gold = state.gold;
      this.gold.textContent = `${state.gold} or`;
    }
    if (state.wood !== l.wood) {
      l.wood = state.wood;
      this.wood.textContent = `${state.wood} bois`;
    }
    if (inCombat !== l.combat) {
      l.combat = inCombat;
      this.combat.classList.toggle('on', inCombat);
    }
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      if (this.bannerTime <= 0) this.banner.classList.remove('on');
    }
  }

  /**
   * Nom du bateau piloté, places dans les cales, et bandeau de la flotte (sans les navires en commerce, qui n'en font
   * plus partie) : pour chacun, étoiles de rang, nom, type, vie (ou délai avant son retour).
   */
  private renderFleet(fleet: Fleet) {
    const hold = fleetHold(fleet.hand);
    const holdText = `Cales ${hold.used} / ${hold.capacity}`;
    if (this.hold.textContent !== holdText) this.hold.textContent = holdText;
    const c = fleet.controlled;
    const name = `${c.name} · ${typeName(c.type, c.levels.extension)}`;
    if (this.shipName.textContent !== name) this.shipName.textContent = name;
    if (fleet.hand.length < 2) {
      this.fleetStrip.innerHTML = '';
      return;
    }
    this.fleetStrip.innerHTML = fleet.hand
      .map((m) => {
        const afloat = m.inWorld && m.ship.alive;
        const state = afloat
          ? `<span class="bar"><span style="width:${(m.ship.health / m.ship.stats.maxHealth) * 100}%"></span></span>`
          : `<span class="away">${m.inWorld ? 'coule…' : `retour ${Math.ceil(m.respawnIn)} s`}</span>`;
        const icons = afloat ? m.ship.crits.icons : '';
        const stars = rankOf(m.kills);
        const rank = stars ? `<span class="rank" title="${rankName(stars)}">${'★'.repeat(stars)}</span>` : '';
        const type = `<span class="type">${typeName(m.type, m.levels.extension)}</span>`;
        return `<div class="hud-fleet-row${m === c ? ' helm' : ''}"><span class="name">${rank}${m.name}${type}${icons ? ` <span class="crits">${icons}</span>` : ''}</span>${state}</div>`;
      })
      .join('');
  }
}

/** Avaries du navire piloté, en toutes lettres (« Avaries : 🔥 incendie · ⛵ gréement »), ou chaîne vide. */
function critsText(ship: Ship): string {
  const c = ship.crits;
  if (!c.any) return '';
  const parts = [c.fire > 0 ? '🔥 incendie' : '', c.rudder > 0 ? '☸ gouvernail' : '', c.rigging > 0 ? '⛵ gréement' : ''].filter(Boolean);
  return `Avaries : ${parts.join(' · ')}`;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
