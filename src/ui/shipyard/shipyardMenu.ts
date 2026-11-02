import * as THREE from 'three';
import { EXTENSION_FX, SHOWCASE, type EmblemId, type GunType } from '../../config';
import type { ShowcaseFocus, ShowcaseView } from '../../camera/showcaseView';
import { maxLevel, type UpgradeId } from '../../progression/upgrades';
import type { ShipType } from '../../shipTypes';
import { SHIP_TYPES, typeName, UPGRADE_INFO } from '../../shipTypes';
import { extensionCount } from '../extensionInfo';
import { ExtensionCeremony } from './extensionCeremony';
import { extensionCallout } from './extensionPanel';
import { playFx, type MenuFx } from '../kit/feedback';
import { cofferHtml, pipsHtml, tip } from '../kit/kit';
import { PlaceMenu } from '../port/placeMenu';
import type { PortContext } from '../port/portContext';
import { shipAnchors, type ShipAnchors, type ShipPart } from './shipAnchors';
import { shipShop } from './shipShop';
import { gaugeRatio, PART_NAMES, PART_UPGRADES, partPanel } from './shipyardPanels';
import './shipyard.css';

/** Ce dont le Chantier a besoin en plus du port : la caméra et sa vue vitrine, et le retour au port. */
export interface ShipyardWorld {
  readonly port: PortContext;
  readonly camera: THREE.PerspectiveCamera;
  readonly showcase: ShowcaseView;
  /** La vitrine tourne lentement d'elle-même (vue d'ensemble). */
  setTurning(on: boolean): void;
  /** Le Chantier se ferme par Échap : on revient au panneau du port. */
  back(): void;
}

const PARTS: readonly ShipPart[] = ['sails', 'emblem', 'cannons', 'hull', 'extension', 'hold'];
const VIEW_OF: Record<ShipPart, keyof typeof SHOWCASE.views> = { sails: 'sails', emblem: 'sails', cannons: 'cannons', hull: 'hull', extension: 'extension', hold: 'hold' };
/** Points de la coque d'où jaillissent les copeaux d'un allongement (part de la demi-longueur, le long du flanc). */
const CHIP_POINTS = [-0.6, -0.2, 0.2, 0.6];
/** Hauteur du point visé par la vue d'ensemble, en part de la hauteur de la grande voile. */
const OVERVIEW_HEIGHT = 0.45;
/** Décalage de l'image au plus (part de la largeur de l'écran), et écart entre deux points (px). */
const SHIP_SHIFT = 0.25;
const SPOT_GAP = 6;

/** Effets à jouer après le prochain rendu : ceux du socle, plus la pastille gagnée et sa barre d'avant. */
interface PendingFx extends MenuFx {
  fresh?: UpgradeId;
  before?: number;
}

const screen = new THREE.Vector3();

/**
 * Chantier du port : le navire piloté, en vrai, à quai, vu par la caméra « vitrine » qui tourne autour de lui. Des
 * points posés sur ses parties (voiles, emblème, canons, coque, cale) ouvrent leur panneau à droite, et la caméra s'en
 * approche : améliorations (avant / après), allongement (coque), types de canons, emblème. Le navire change sous les yeux
 * à l'achat. En haut, « Acheter un navire » (vente, places de flotte). Échap revient au panneau du port.
 */
export class ShipyardMenu extends PlaceMenu {
  private tab: 'upgrades' | 'shop' = 'upgrades';
  private part: ShipPart | null = null;
  private anchors: ShipAnchors | null = null;
  private fx: PendingFx = {};
  private frame = 0;
  /** Vue choisie (gardée telle quelle tant qu'on ne change pas : la caméra n'est pas relancée). */
  private focus: ShowcaseFocus | null = null;
  /** Le navire vient d'être allongé : la caméra le montre de loin jusqu'à ce moment (ms, horloge du navigateur). */
  private wideUntil = 0;
  private readonly ceremony: ExtensionCeremony;

  constructor(
    parent: HTMLElement,
    private readonly world: ShipyardWorld,
  ) {
    super(parent, 'Chantier', () => world.back());
    const frame = this.body.parentElement!;
    frame.classList.add('yard-frame');
    frame.parentElement!.classList.add('yard-root');
    this.ceremony = new ExtensionCeremony(frame.parentElement!);
    // Glisser sur la scène fait tourner la caméra autour du navire.
    let last: { x: number; y: number } | null = null;
    frame.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.yard-stage')) last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!last || !this.isOpen) return;
      this.world.showcase.drag(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (last = null));
  }

  protected opened() {
    this.tab = 'upgrades';
    this.part = null;
    this.focus = null;
    // L'interface de navigation (bandeaux, radar, commandes) s'efface derrière le Chantier.
    document.body.classList.add('yard-open');
    this.loop();
  }

  protected closed() {
    cancelAnimationFrame(this.frame);
    this.ceremony.close();
    this.wideUntil = 0;
    this.world.camera.clearViewOffset();
    document.body.classList.remove('yard-open');
    this.world.showcase.close();
    this.world.setTurning(false);
  }

  render() {
    const ctx = this.world.port;
    const m = ctx.fleet.controlled;
    this.anchors = shipAnchors(m.ship);
    this.aim();
    const tabs = [
      ['upgrades', 'Ton navire'],
      ['shop', 'Acheter un navire'],
    ]
      .map(([id, name]) => `<button class="yard-tab${this.tab === id ? ' on' : ''}" data-action="tab" data-arg="${id}">${name}</button>`)
      .join('');
    const spots =
      this.tab === 'upgrades'
        ? PARTS.filter((p) => this.anchors![p] && this.partOffered(p))
            .map((p) => `<button class="yard-spot${this.part === p ? ' on' : ''}" data-action="part" data-arg="${p}" data-part="${p}">${PART_NAMES[p]}${this.partLevel(p)}</button>`)
            .join('')
        : '';
    const panel = this.tab === 'shop' ? shipShop(ctx) : this.part ? partPanel(ctx, this.part, { fresh: this.fx.fresh ?? null, before: this.fx.before ?? null }) : this.overview();
    this.body.innerHTML = `
      <div class="yard-top"><span class="yard-title">Chantier de ${ctx.island.info.shortName}</span><div class="yard-tabs">${tabs}</div>${cofferHtml({ gold: ctx.state.gold, wood: ctx.state.wood })}<button class="kit-btn ghost small yard-back" data-action="back">Retour au port</button></div>
      <div class="yard-stage"></div>
      <div class="yard-spots">${spots}</div>
      <aside class="yard-panel${this.tab === 'shop' ? ' wide' : ''}">${this.part && this.tab === 'upgrades' ? '<button class="yard-close" data-action="part" data-arg="none" aria-label="Vue d’ensemble">×</button>' : ''}${panel}</aside>
      <div class="yard-hint">Glisse pour tourner autour du navire</div>`;
    this.place();
    this.play();
  }

  /** Sans partie choisie : le navire, et chaque partie avec ses niveaux (un clic l'ouvre). */
  private overview(): string {
    const m = this.world.port.fleet.controlled;
    const rows = PARTS.filter((p) => this.anchors?.[p] && this.partOffered(p))
      .map((p) => {
        const ids = PART_UPGRADES[p].filter((id) => maxLevel(m.type, id, m.levels) > 0);
        if (p === 'extension') return `<button class="yard-part" data-action="part" data-arg="${p}"><b>${PART_NAMES[p]}</b>${pipsHtml(m.levels.extension, extensionCount(m))}</button>`;
        const pips = ids.map((id) => `<span${tip(UPGRADE_INFO[id].name)}>${pipsHtml(m.levels[id], maxLevel(m.type, id, m.levels))}</span>`).join('');
        return `<button class="yard-part" data-action="part" data-arg="${p}"><b>${PART_NAMES[p]}</b>${pips || '<span class="yard-next">Choix</span>'}</button>`;
      })
      .join('');
    return `<h2>${m.name}</h2>${extensionCallout(this.world.port, m)}<p class="yard-next">Clique une partie du navire, ou choisis-la ici.</p><div class="yard-parts">${rows}</div>`;
  }

  /** La partie a quelque chose à proposer sur ce navire (une amélioration, l'emblème, les canons…). */
  private partOffered(p: ShipPart): boolean {
    const m = this.world.port.fleet.controlled;
    // L'emblème a son propre point seulement s'il n'est pas sur la plus grande voile (sinon il est dans « Voiles »).
    if (p === 'emblem') return !!this.anchors && this.anchors.emblem !== this.anchors.sails;
    if (p === 'cannons') return m.ship.model.cannons.length > 0;
    if (p === 'hull') return true;
    if (p === 'extension') return extensionCount(m) > 0;
    return PART_UPGRADES[p].some((id) => maxLevel(m.type, id, m.levels) > 0);
  }

  /** « 3/5 » : niveau de la première amélioration de la partie. */
  private partLevel(p: ShipPart): string {
    const m = this.world.port.fleet.controlled;
    if (p === 'extension') return ` <small>${m.levels.extension}/${extensionCount(m)}</small>`;
    const id = PART_UPGRADES[p].find((u) => maxLevel(m.type, u, m.levels) > 0);
    return id ? ` <small>${m.levels[id]}/${maxLevel(m.type, id, m.levels)}</small>` : '';
  }

  /** Dit à la caméra quoi regarder (la vue d'ensemble tourne lentement). */
  private aim() {
    const a = this.anchors!;
    const wide = performance.now() < this.wideUntil;
    const part = this.tab === 'upgrades' && !wide ? this.part : null;
    const key = wide ? 'ceremony' : part ? VIEW_OF[part] : 'overview';
    const v = SHOWCASE.views[key];
    // L'allongement se regarde au milieu du navire, pas au flanc.
    const point = part && part !== 'extension' && a[part] ? a[part]!.clone() : new THREE.Vector3(0, (a.sails?.y ?? 2) * OVERVIEW_HEIGHT, 0);
    // Un canon à tribord se regarde depuis tribord.
    const side = part === 'cannons' && a.cannons && a.cannons.x < 0 ? -1 : 1;
    const same = this.focus && this.focus.point.equals(point) && this.focus.yaw === v.yaw * side;
    if (!same) this.focus = { point, yaw: v.yaw * side, pitch: v.pitch, distance: v.distance };
    this.world.showcase.look(this.focus!);
    this.world.setTurning(!part && !wide);
  }

  /** Chaque image, tant que le Chantier est ouvert : les points suivent les parties du navire à l'écran. */
  private loop() {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.isOpen) return;
      this.place();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private place() {
    const a = this.anchors;
    if (!a) return;
    const root = this.world.port.fleet.controlled.ship.model.root;
    const camera = this.world.camera;
    // Le navire se montre à gauche du panneau : l'image est décalée de la moitié de sa largeur.
    const panel = this.body.querySelector<HTMLElement>('.yard-panel');
    const shift = Math.min((panel?.offsetWidth ?? 0) / 2, innerWidth * SHIP_SHIFT);
    camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight);
    const spots: { el: HTMLElement; x: number; y: number }[] = [];
    this.body.querySelectorAll<HTMLElement>('.yard-spot').forEach((el) => {
      const p = a[el.dataset.part as ShipPart];
      if (!p) return;
      screen.copy(p).applyMatrix4(root.matrixWorld).project(camera);
      const hidden = screen.z > 1 || Math.abs(screen.x) > 1.1 || Math.abs(screen.y) > 1.1;
      el.style.visibility = hidden ? 'hidden' : 'visible';
      spots.push({ el, x: ((screen.x + 1) / 2) * innerWidth, y: ((1 - screen.y) / 2) * innerHeight });
    });
    // Points trop proches (petits navires, vue de loin) : on les écarte verticalement, du haut vers le bas.
    spots.sort((p, q) => p.y - q.y);
    for (let i = 1; i < spots.length; i++) {
      for (let j = 0; j < i; j++) {
        const p = spots[j];
        const q = spots[i];
        const w = (p.el.offsetWidth + q.el.offsetWidth) / 2 + SPOT_GAP;
        const h = (p.el.offsetHeight + q.el.offsetHeight) / 2 + SPOT_GAP;
        if (Math.abs(q.x - p.x) < w && q.y - p.y < h) q.y = p.y + h;
      }
    }
    for (const s of spots) s.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
  }

  /** Quelques points du flanc du navire, à l'écran (px) : d'où jaillissent les copeaux d'un allongement. */
  private hullPoints(): { x: number; y: number }[] {
    const model = this.world.port.fleet.controlled.ship.model;
    const w = model.waterline;
    model.root.updateMatrixWorld();
    const camera = this.world.camera;
    return CHIP_POINTS.map((u) => {
      screen.set(w.maxWidth, 1, w.center + u * w.half).applyMatrix4(model.root.matrixWorld).project(camera);
      return { x: ((screen.x + 1) / 2) * innerWidth, y: ((1 - screen.y) / 2) * innerHeight };
    });
  }

  private play() {
    const fx = this.fx;
    this.fx = {};
    playFx(this.body, { ...fx, bars: fx.before !== undefined });
  }

  protected onAction(action: string, arg: string) {
    const ctx = this.world.port;
    const a = ctx.actions;
    const m = ctx.fleet.controlled;
    const gold = ctx.state.gold;
    switch (action) {
      case 'tab':
        this.tab = arg as 'upgrades' | 'shop';
        break;
      case 'part':
        this.part = arg === 'none' || this.part === arg ? null : (arg as ShipPart);
        break;
      case 'back':
        this.setOpen(false);
        break;
      case 'upgrade': {
        const id = arg as UpgradeId;
        const level = m.levels[id];
        const before = gaugeRatio(m, id) ?? undefined;
        a.buyUpgrade(id);
        const at = `[data-upgrade="${id}"]`;
        this.fx = m.levels[id] > level ? { fresh: id, before, spend: `[data-row="${id}"]`, rise: { at: '.yard-panel h2', text: `${UPGRADE_INFO[id].name} : niveau ${m.levels[id]} !`, tone: 'good' }, glow: `[data-part="${this.part}"]` } : { shake: at };
        break;
      }
      case 'extend': {
        const ext = m.levels.extension;
        const def = SHIP_TYPES[m.type].extensions?.[ext];
        const before = typeName(m.type, ext);
        a.extendShip();
        if (m.levels.extension > ext && def) {
          this.fx = { spend: '.yard-ext-progress' };
          this.part = 'extension';
          // La caméra recule pour montrer tout le navire, puis revient sur l'allongement.
          this.wideUntil = performance.now() + EXTENSION_FX.wide;
          setTimeout(() => {
            if (this.isOpen) this.aim();
          }, EXTENSION_FX.wide);
          this.ceremony.play(m, def, before, this.hullPoints());
        } else this.fx = { shake: '[data-extend]' };
        break;
      }
      case 'guns': {
        const [battery, type] = arg.split(':') as ['main' | 'deck', GunType];
        a.setGuns(battery, type);
        const ok = m.guns[battery] === type;
        this.fx = ok ? { glow: `[data-gun="${battery}-${type}"]`, ...(ctx.state.gold < gold ? { spend: `[data-gun="${battery}-${type}"]` } : {}) } : { shake: `[data-gun="${battery}-${type}"]` };
        break;
      }
      case 'emblem': {
        const id = arg === 'none' ? null : (arg as EmblemId);
        a.paintEmblem(id);
        const ok = m.emblem === id;
        this.fx = ok ? { glow: id ? `[data-emblem="${id}"]` : '.yard-emblems', ...(ctx.state.gold < gold ? { spend: `[data-emblem="${id}"]` } : {}) } : { shake: `[data-emblem="${id}"]` };
        break;
      }
      case 'buy': {
        const count = ctx.fleet.members.length;
        a.buyShip(arg as ShipType);
        this.fx = ctx.fleet.members.length > count ? { spend: '.yard-fleet', rise: { at: '.yard-fleet h2', text: 'Nouveau navire !', tone: 'good' } } : { shake: `[data-buy="${arg}"]` };
        break;
      }
      case 'sell': {
        const member = ctx.fleet.members.find((x) => String(x.id) === arg);
        if (!member) break;
        a.sellShip(member);
        if (ctx.state.gold > gold) this.fx = { earn: `.yard-fleet`, rise: { at: '.yard-fleet h2', text: `+${ctx.state.gold - gold} or`, tone: 'good' } };
        break;
      }
      case 'slot': {
        const slots = ctx.state.slots;
        a.buySlot();
        this.fx = ctx.state.slots > slots ? { spend: '[data-slot]', rise: { at: '.yard-fleet h2', text: 'Une place de plus', tone: 'good' } } : { shake: '[data-slot]' };
        break;
      }
    }
  }
}
