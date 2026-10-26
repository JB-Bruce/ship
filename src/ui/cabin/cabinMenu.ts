import type { FleetMember } from '../../fleet/fleet';
import type { Formation } from '../../fleet/fleet';
import type { Good } from '../../progression/goods';
import type { BossId, IslandId } from '../../config';
import { UPGRADE_INFO } from '../../shipTypes';
import type { UpgradeId } from '../../progression/upgrades';
import { playFx, type MenuFx } from '../kit/feedback';
import { cofferHtml } from '../kit/kit';
import { hideTip } from '../kit/tooltip';
import { ParchmentMenu } from '../parchmentMenu';
import { viewedMember, type CabinContext, type CabinPage, type CabinView } from './cabinContext';
import { crewPage } from './crewPage';
import { fleetPage } from './fleetPage';
import { GuardMap } from './guardMap';
import { guardPage } from './guardPage';
import { logPage } from './logPage';
import { shipPage, statRatios } from './shipPage';
import './cabin.css';

/** Marque-pages de la Cabine : identifiant, nom et dessin au trait. */
const PAGES: { id: CabinPage; name: string; icon: string }[] = [
  { id: 'ship', name: 'Navire', icon: 'M3 17h18l-2 4H5z M12 3v14 M12 4l7 11h-7z M11 6l-5 9h5z' },
  { id: 'crew', name: 'Équipage', icon: 'M8 5a3 3 0 1 0 0.01 0 M16 5a3 3 0 1 0 0.01 0 M3 20c0-3 2.5-6 5-6s5 3 5 6 M11 20c0-3 2.5-6 5-6s5 3 5 6' },
  { id: 'fleet', name: 'Flotte', icon: 'M2 18h9l-1.5 3h-6z M6.5 8v10 M6.5 9l4 7h-4z M13 15h9l-1.5 3h-6z M17.5 5v10 M17.5 6l4 7h-4z' },
  { id: 'guard', name: 'Garde', icon: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z M8 12l3 3 5-6' },
  { id: 'log', name: 'Journal', icon: 'M5 3h11l3 3v15H5z M8 8h8 M8 12h8 M8 16h5' },
];

/** Effets à jouer après le prochain rendu : ceux du socle, plus la pastille et l'officier qui viennent de changer. */
interface PendingFx extends MenuFx {
  /** Amélioration qui vient d'être achetée : sa pastille se remplit d'un coup de tampon. */
  fresh?: UpgradeId;
  /** Parts des barres avant le changement : elles glissent jusqu'aux nouvelles. */
  before?: Record<string, number>;
  /** Officier qui vient de changer de poste. */
  officer?: number;
}

/**
 * Cabine du capitaine (Tab), ouverte partout, même en mer (le jeu est en pause) : ton navire et ses améliorations
 * (achetées d'ici à quai, pour le navire piloté), ton équipage (officiers à faire monter ou débarquer), ta flotte
 * (formation, barre, cales, routes commerciales à arrêter ou changer) et le journal (contrats, plans, registre).
 * Chaque action a son retour : tampon, pièces qui volent, barres qui glissent, refus qui tremble.
 */
export class CabinMenu extends ParchmentMenu {
  private readonly view: CabinView = { page: 'ship', memberId: -1, edit: null, confirmAbandon: null, deploy: null };
  private readonly guardMap: GuardMap;
  private fx: PendingFx = {};

  constructor(
    parent: HTMLElement,
    private readonly ctx: CabinContext,
  ) {
    super(parent, 'Cabine du capitaine', 'Tab ou Échap pour reprendre la mer', ['Tab']);
    this.body.parentElement!.classList.add('cabin-sheet-frame');
    this.guardMap = new GuardMap(ctx, {
      picking: () => ctx.fleet.members.find((m) => m.id === this.view.deploy) ?? null,
      valid: (x, z) => ctx.known(x, z) && ctx.atSea(x, z),
      place: (member, x, z) => this.deploy(member, x, z),
    });
  }

  /** Poste (ou déplace) un navire de garde, depuis la carte de la page Garde. */
  private deploy(member: FleetMember, x: number, z: number) {
    if (!this.ctx.guards.deploy(member, x, z)) return;
    if (this.view.deploy === member.id) this.view.deploy = null;
    this.fx = { glow: '.guard-cards' };
    this.render();
  }

  /** Ouvre la Cabine sur une page (roue d'ordres : page Flotte). */
  openOn(page: CabinPage) {
    this.view.page = page;
    this.setOpen(true);
  }

  setOpen(open: boolean) {
    // À chaque ouverture, la Cabine montre le navire que tu pilotes.
    if (open && !this.isOpen) {
      this.view.memberId = this.ctx.fleet.controlled.id;
      this.view.edit = null;
      this.view.confirmAbandon = null;
      this.view.deploy = null;
      this.guardMap.reset();
    }
    if (!open) hideTip();
    super.setOpen(open);
  }

  render() {
    const { ctx, view } = this;
    const member = viewedMember(ctx, view);
    view.memberId = member.id;
    const picker = view.page === 'ship' || view.page === 'crew';
    const ships = picker
      ? ctx.fleet.members.map((m) => `<button class="cabin-pick${m === member ? ' on' : ''}" data-action="ship" data-arg="${m.id}">${m.name}${m === ctx.fleet.controlled ? ' <small>(barre)</small>' : ''}</button>`).join('')
      : '';
    const tabs = PAGES.map((p) => `<button class="cabin-tab${p.id === view.page ? ' on' : ''}" data-action="page" data-arg="${p.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${p.icon}"/></svg>${p.name}</button>`).join('');
    const fx = this.fx;
    const page =
      view.page === 'ship'
        ? shipPage(ctx, view, { fresh: fx.fresh ?? null, before: fx.before ?? null })
        : view.page === 'crew'
          ? crewPage(ctx, view, fx.officer ?? null)
          : view.page === 'fleet'
            ? fleetPage(ctx, view)
            : view.page === 'guard'
              ? guardPage(ctx, view)
              : logPage(ctx, view);
    this.body.innerHTML = `
      <div class="cabin-head"><span class="cabin-title">Cabine du capitaine</span><div class="cabin-picks">${ships}</div>${cofferHtml({ gold: ctx.state.gold, wood: ctx.state.wood })}</div>
      <div class="cabin-main"><nav class="cabin-tabs">${tabs}</nav><section class="cabin-page">${page}</section></div>`;
    const map = this.body.querySelector<HTMLElement>('.guard-map-slot');
    if (map) this.guardMap.mount(map);
    this.play();
  }

  /** Joue les effets demandés par la dernière action, puis les oublie. */
  private play() {
    const fx = this.fx;
    this.fx = {};
    playFx(this.body, { ...fx, bars: !!fx.before });
  }

  protected onAction(action: string, arg: string) {
    const { ctx, view } = this;
    if (action !== 'abandon') view.confirmAbandon = null;
    const member = ctx.fleet.members.find((m) => String(m.id) === arg);
    switch (action) {
      case 'page':
        view.page = arg as CabinPage;
        view.edit = null;
        break;
      case 'ship':
        if (member) view.memberId = member.id;
        break;
      case 'helm':
        if (member) {
          ctx.actions.takeHelm(member);
          if (ctx.fleet.controlled === member) this.fx.glow = '.cabin-ship-card, .cabin-ship-mini.here';
        }
        break;
      case 'upgrade':
        this.upgrade(arg as UpgradeId);
        break;
      case 'assign':
        this.assign(arg);
        break;
      case 'formation':
        ctx.fleet.formation = arg as Formation;
        this.fx.glow = `.cabin-formation.on`;
        break;
      case 'trophy': {
        const [ship, boss] = arg.split(':');
        ctx.actions.toggleTrophy(Number(ship), boss as BossId);
        this.fx.glow = `[data-arg="${arg}"]`;
        break;
      }
      case 'abandon': {
        const id = Number(arg);
        if (view.confirmAbandon === id) {
          ctx.actions.abandonContract(id);
          view.confirmAbandon = null;
        } else view.confirmAbandon = id;
        break;
      }
      default:
        this.routeAction(action, arg);
    }
  }

  /** Amélioration du navire piloté (à quai) : tampon, pièces vers le coffre, barres qui glissent ; trop cher, le prix tremble. */
  private upgrade(id: UpgradeId) {
    const m = this.ctx.fleet.controlled;
    const level = m.levels[id];
    const before = statRatios(m);
    this.ctx.actions.buyUpgrade(id);
    const at = `[data-upgrade="${id}"]`;
    if (m.levels[id] > level) this.fx = { fresh: id, before, spend: at, rise: { at: '.cabin-ship-card', text: `${UPGRADE_INFO[id].name} : niveau ${m.levels[id]} !`, tone: 'good' } };
    else this.fx = { shake: at };
  }

  /** « officier:navire » ou « officier:none » : il monte à bord (il « atterrit » à son poste) ou débarque. */
  private assign(arg: string) {
    const [officerId, target] = arg.split(':').map((v) => (v === 'none' ? null : Number(v)));
    const officer = this.ctx.crew.officers.find((o) => o.id === officerId);
    if (!officer) return;
    const before = officer.assignedTo;
    this.ctx.actions.assignOfficer(officer.id, target);
    if (officer.assignedTo === before) this.fx = { shake: `[data-board="${officer.id}"]` };
    else if (target !== null) this.fx = { officer: officer.id, glow: `[data-officer="${officer.id}"]`, rise: { at: `[data-officer="${officer.id}"]`, text: 'À bord !', tone: 'good' } };
  }

  /** Routes commerciales gérées d'ici : arrêter, reprendre, modifier (destination et marchandises). */
  private routeAction(action: string, arg: string) {
    const { ctx, view } = this;
    const routes = ctx.routes;
    const member = ctx.fleet.members.find((m) => String(m.id) === arg);
    switch (action) {
      case 'route-stop':
        if (member && routes.stop(member)) this.fx.rise = { at: '.cabin-routes', text: `${member.name} rentre après sa vente`, tone: 'info' };
        break;
      case 'route-resume':
        if (member) routes.resume(member);
        break;
      case 'route-edit':
        if (member?.trade) view.edit = { memberId: member.id, to: member.trade.nextTo ?? member.trade.ports[1], out: member.trade.goods[0], back: member.trade.goods[1] };
        break;
      case 'route-pick': {
        const edit = view.edit;
        const m = edit && ctx.fleet.members.find((x) => x.id === edit.memberId);
        if (!edit || !m?.trade) break;
        const [field, value] = arg.split(':');
        const good = value === 'none' ? null : (value as Good);
        if (field === 'to') {
          edit.to = value as IslandId;
          // Les marchandises qui ne se vendent pas au nouveau port tombent.
          const home = m.trade.ports[0];
          if (edit.out && !routes.goods(home, edit.to).includes(edit.out)) edit.out = null;
          if (edit.back && !routes.goods(edit.to, home).includes(edit.back)) edit.back = null;
        } else if (field === 'out') edit.out = good;
        else if (field === 'back') edit.back = good;
        break;
      }
      case 'route-save': {
        const edit = view.edit;
        if (member && edit && routes.modify(member, edit.to, edit.out, edit.back)) this.fx.rise = { at: '.cabin-routes', text: 'Route modifiée', tone: 'good' };
        view.edit = null;
        break;
      }
      case 'route-cancel':
        view.edit = null;
        break;
      case 'guard-pick':
        view.deploy = view.deploy === Number(arg) ? null : Number(arg);
        break;
      case 'guard-recall':
        if (member && ctx.guards.recall(member)) this.fx.rise = { at: '.guard-cards', text: `${member.name} rejoint ta flotte`, tone: 'good' };
        break;
    }
  }
}
