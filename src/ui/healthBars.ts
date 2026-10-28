import * as THREE from 'three';
import type { FleetMember } from '../fleet/fleet';
import { rankName, rankOf } from '../fleet/officers';
import type { Ship } from '../ship/ship';
import { blueprints, shipTypeLabel } from '../progression/blueprints';
import type { Enemy } from '../world/enemySpawner';
import { DamageLag } from './damageLag';
import { enemyTagHtml, threatOf, type Threat } from './enemyTags';

/** Distance au-delà de laquelle on n'affiche plus la barre (m). */
const MAX_DISTANCE = 300;
const projected = new THREE.Vector3();

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  /** Part perdue qui reste un instant en clair derrière le remplissage. */
  damage: DamageLag;
  /** Étiquette d'un ennemi (type, élite, menace) ou d'un navire de ta flotte (rang, nom) ; null pour un autre allié. */
  tag: HTMLElement | null;
  threat: Threat | null;
  /** Plans connus quand l'étiquette d'un ennemi a été écrite : un type découvert depuis refait son nom. */
  plans: number;
  /** Rang et nom affichés sur l'étiquette d'un navire de ta flotte (le DOM n'est touché qu'à leur changement). */
  label: string;
  /** Pictogrammes des avaries (coups critiques), à droite de la barre. */
  crits: HTMLElement;
  critIcons: string;
  seen: number;
  /** Surlignage de la visée « Trahir » : 0 aucun, 1 allié qu'on peut trahir, 2 allié sous le curseur. */
  mark: number;
}

const MARK_CLASSES = ['', 'betrayable', 'aimed'] as const;

/**
 * Barres de vie flottant au-dessus des autres bateaux (éléments HTML positionnés chaque image) :
 * rouges pour les ennemis, vertes pour les navires de ta flotte. Au-dessus d'un ennemi, une étiquette : son type (ou
 * son nom), sa couronne s'il est d'élite, et une couleur selon sa menace pour le navire piloté (voir enemyTags.ts).
 * Au-dessus d'un navire de ta flotte : son nom, précédé des étoiles de son rang s'il en a.
 */
export class HealthBars {
  private readonly bars = new Map<Ship, Bar>();
  private frame = 0;

  constructor(private readonly parent: HTMLElement) {}

  /** `visibility` : au-delà (brume), un navire est invisible et sa barre aussi. */
  update(camera: THREE.Camera, ships: readonly Ship[], player: Ship, visibility: number, enemies: readonly Enemy[], fleet: readonly FleetMember[]) {
    this.frame++;
    const range = Math.min(MAX_DISTANCE, visibility);
    for (const ship of ships) {
      if (ship === player || !ship.alive || ship.intangible || ship.distanceTo(player) > range) continue;
      projected.set(ship.position.x, ship.position.y + ship.model.barHeight, ship.position.z).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) continue;

      const bar = this.bars.get(ship) ?? this.create(ship);
      bar.seen = this.frame;
      const x = (projected.x * 0.5 + 0.5) * innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * innerHeight;
      const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      bar.root.style.transform = transform;
      const fraction = ship.health / ship.stats.maxHealth;
      bar.fill.style.width = `${fraction * 100}%`;
      bar.damage.set(fraction);
      if (ship.faction === 'enemy') this.updateTag(bar, bar.tag!, transform, ship, player, enemies);
      else if (ship.faction !== 'cursed') this.updateMine(bar, transform, ship, fleet);
      bar.crits.style.transform = transform;
      const icons = ship.crits.icons;
      if (icons !== bar.critIcons) bar.crits.textContent = bar.critIcons = icons;
    }
    // Retire les barres des bateaux non affichés à cette image (hors champ, coulés, trop loin).
    for (const [ship, bar] of this.bars) {
      if (bar.seen === this.frame) continue;
      bar.root.remove();
      bar.tag?.remove();
      bar.crits.remove();
      this.bars.delete(ship);
    }
  }

  /**
   * Visée « Trahir » : surligne la barre et l'étiquette des alliés qu'on peut trahir (`eligible`), davantage celui sous
   * le curseur (`aimed`). Les classes ne changent que quand le surlignage change.
   */
  mark(eligible: readonly Ship[], aimed: Ship | null) {
    for (const [ship, bar] of this.bars) {
      const mark = ship === aimed ? 2 : eligible.includes(ship) ? 1 : 0;
      if (mark === bar.mark) continue;
      for (const el of [bar.root, bar.tag]) {
        if (!el) continue;
        if (bar.mark) el.classList.remove(MARK_CLASSES[bar.mark]);
        if (mark) el.classList.add(MARK_CLASSES[mark]);
      }
      bar.mark = mark;
    }
  }

  /** Place l'étiquette au-dessus de la barre ; son texte et sa couleur changent avec la menace (changement de barre). */
  private updateTag(bar: Bar, tag: HTMLElement, transform: string, ship: Ship, player: Ship, enemies: readonly Enemy[]) {
    tag.style.transform = transform;
    const enemy = enemies.find((e) => e.ship === ship);
    if (!enemy) return;
    const threat = threatOf(enemy, player);
    if (threat === bar.threat && bar.plans === blueprints.version) return;
    bar.threat = threat;
    bar.plans = blueprints.version;
    tag.className = `ship-tag ${threat}`;
    tag.innerHTML = enemyTagHtml(enemy, threat);
  }

  /** Étiquette d'un allié : pour ta flotte, étoiles de rang, nom et type ; pour un pirate ou un marchand allié, son type. */
  private updateMine(bar: Bar, transform: string, ship: Ship, fleet: readonly FleetMember[]) {
    let member: FleetMember | null = null;
    for (const m of fleet) if (m.ship === ship) member = m;
    const tag = (bar.tag ??= this.tagElement(member ? 'ship-tag mine' : 'ship-tag ally'));
    tag.style.transform = transform;
    const stars = member ? rankOf(member.kills) : 0;
    const type = shipTypeLabel(ship.type, ship.extension);
    const label = `${stars}|${member?.name ?? ''}|${type}`;
    if (label === bar.label) return;
    bar.label = label;
    tag.textContent = member ? member.name : type;
    if (member) {
      const kind = document.createElement('span');
      kind.className = 'type';
      kind.textContent = ` · ${type}`;
      tag.append(kind);
    }
    if (!stars) return;
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.title = rankName(stars);
    rank.textContent = '★'.repeat(stars);
    tag.prepend(rank);
  }

  private tagElement(className: string): HTMLElement {
    const tag = this.parent.appendChild(document.createElement('div'));
    tag.className = className;
    return tag;
  }

  private create(ship: Ship): Bar {
    const root = document.createElement('div');
    const foe = ship.faction === 'enemy' || ship.faction === 'cursed';
    root.className = ship.faction === 'cursed' ? 'ship-bar cursed' : foe ? 'ship-bar' : 'ship-bar ally';
    const lag = root.appendChild(document.createElement('div'));
    lag.className = 'ship-bar-lag';
    const fill = root.appendChild(document.createElement('div'));
    fill.className = 'ship-bar-fill';
    const damage = new DamageLag(fill, lag, ship.health / ship.stats.maxHealth);
    this.parent.appendChild(root);
    // Un navire maudit n'a pas de nom au-dessus de lui : seulement sa barre, plus sombre.
    const tag = foe && ship.faction !== 'cursed' ? this.tagElement('ship-tag') : null;
    const crits = this.parent.appendChild(document.createElement('div'));
    crits.className = 'ship-crits';
    const bar: Bar = { root, fill, damage, tag, threat: null, plans: blueprints.version, label: '', crits, critIcons: '', seen: this.frame, mark: 0 };
    this.bars.set(ship, bar);
    return bar;
  }
}
