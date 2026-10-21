import { CONTRACTS, TAVERN_FX } from '../../config';
import { flyCoins, playFx, riseText, shake, type MenuFx } from '../kit/feedback';
import { cofferHtml, tip } from '../kit/kit';
import type { PortContext } from '../port/portContext';
import { PlaceMenu } from '../port/placeMenu';
import { boardHtml, recruitsHtml, slotsHtml, TAVERNS } from './tavernBoard';
import './tavern.css';

/**
 * Taverne du port : un tableau de liège couvert d'affiches (offres du jour et missions spéciales), qu'on arrache d'un
 * clic pour accepter le contrat (l'affiche s'envole vers « Tes contrats ») ; ses contrats en cours, où l'on touche la
 * prime (les pièces volent au coffre) ; et les marins à engager, qui montent aussitôt à bord du navire piloté s'il a
 * un poste libre. La description d'une affiche est dans sa bulle. Échap revient au port.
 */
export class TavernMenu extends PlaceMenu {
  private fx: MenuFx = {};
  /** Contrat dont l'abandon attend un second clic. */
  private confirm: number | null = null;
  /** Une affiche s'envole : pas d'autre clic tant qu'elle n'est pas arrivée. */
  private busy = false;

  constructor(
    parent: HTMLElement,
    private readonly ctx: PortContext,
    back: () => void,
  ) {
    super(parent, 'Taverne', back);
    this.body.parentElement!.classList.add('tav-frame');
  }

  protected opened() {
    this.confirm = null;
    this.busy = false;
  }

  render() {
    const ctx = this.ctx;
    const tavern = TAVERNS[ctx.island.id];
    const minutes = Math.max(1, Math.ceil(ctx.contracts.dayLeft / 60));
    this.body.innerHTML = `
      <div class="tav-head"><span class="tav-name"${tip(tavern.about)}>${tavern.name}</span><span class="tav-timer">Nouvelles affiches à l’aube, dans ${minutes} min</span>${cofferHtml({ gold: ctx.state.gold, wood: ctx.state.wood })}<button class="kit-btn ghost small tav-back" data-action="back">Retour au port</button></div>
      <div class="tav-main">
        <div class="tav-board">${boardHtml(ctx)}</div>
        <aside class="tav-side">
          <h2>Tes contrats <small>${ctx.contracts.active.length} / ${CONTRACTS.maxActive}</small></h2>
          <div class="tav-slots">${slotsHtml(ctx, this.confirm)}</div>
          <h2>À engager</h2>
          <div class="tav-recruits">${recruitsHtml(ctx)}</div>
        </aside>
      </div>`;
    const fx = this.fx;
    this.fx = {};
    playFx(this.body, fx);
  }

  protected onAction(action: string, arg: string) {
    if (this.busy) return;
    const ctx = this.ctx;
    const a = ctx.actions;
    if (action !== 'abandon') this.confirm = null;
    const id = Number(arg);
    const el = (selector: string) => this.body.querySelector(selector);
    const coffer = el('[data-coffer-gold]');
    switch (action) {
      case 'back':
        this.setOpen(false);
        break;
      case 'accept':
        this.tear(id);
        break;
      case 'claim': {
        const gold = ctx.state.gold;
        const slot = el(`[data-slot="${id}"]`);
        a.claimContract(id);
        // Le contrat payé quitte la liste : les pièces partent tout de suite de sa place.
        if (ctx.state.gold > gold && slot && coffer) {
          flyCoins(slot, coffer);
          riseText(slot, `+${ctx.state.gold - gold} or`, 'good');
        }
        break;
      }
      case 'abandon':
        if (this.confirm === id) {
          a.abandonContract(id);
          this.confirm = null;
        } else this.confirm = id;
        break;
      case 'recruit':
        this.recruit(id);
        break;
    }
  }

  /** L'affiche est arrachée : elle s'envole vers « Tes contrats », puis le contrat est accepté. */
  private tear(id: number) {
    const ctx = this.ctx;
    const poster = this.body.querySelector<HTMLElement>(`[data-poster="${id}"]`);
    if (!poster) return;
    if (ctx.contracts.active.length >= CONTRACTS.maxActive) {
      shake(poster);
      return;
    }
    const target = this.body.querySelector('.tav-slot.empty') ?? this.body.querySelector('.tav-slots');
    const from = poster.getBoundingClientRect();
    const to = target?.getBoundingClientRect() ?? from;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    this.busy = true;
    const tilt = poster.style.getPropertyValue('--tilt') || '0deg';
    const anim = poster.animate(
      [
        { transform: `rotate(${tilt})`, opacity: 1 },
        { transform: `translate(0, -14px) rotate(${TAVERN_FX.tearTilt}deg) scale(1.05)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${TAVERN_FX.tearTilt * 2}deg) scale(0.35)`, opacity: 0 },
      ],
      { duration: TAVERN_FX.tear, easing: 'cubic-bezier(.4,0,.7,.6)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      this.busy = false;
      const before = ctx.contracts.active.length;
      ctx.actions.acceptContract(id);
      if (ctx.contracts.active.length > before) {
        const slot = `[data-slot="${ctx.contracts.active[ctx.contracts.active.length - 1].id}"]`;
        this.fx = { glow: slot, rise: { at: slot, text: 'Contrat accepté !', tone: 'good' } };
      }
      if (this.isOpen) this.render();
    };
  }

  /** Engage un marin : il monte à bord du navire piloté s'il y a un poste libre, sinon il reste à terre. */
  private recruit(id: number) {
    const ctx = this.ctx;
    const card = this.body.querySelector(`[data-recruit="${id}"]`);
    const coffer = this.body.querySelector('[data-coffer-gold]');
    const count = ctx.crew.officers.length;
    ctx.actions.recruit(id);
    if (ctx.crew.officers.length === count) {
      if (card) shake(card);
      return;
    }
    if (card && coffer) flyCoins(coffer, card);
    const officer = ctx.crew.officers[ctx.crew.officers.length - 1];
    const ship = ctx.fleet.controlled;
    if (ctx.crew.freeSlots(ship) > 0) ctx.actions.assignOfficer(officer.id, ship.id);
    const aboard = officer.assignedTo === ship.id;
    if (card) riseText(card, aboard ? `${officer.name} monte à bord !` : `${officer.name} attend à terre`, aboard ? 'good' : 'info');
  }
}
