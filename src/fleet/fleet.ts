import type * as THREE from 'three';
import { AllyAI } from '../ai/allyAI';
import { ALLY, FLEET, FORMATION_NAMES, LAND, type BossId, type Cost, type EmblemId } from '../config';
import { emptyCargo, type Cargo } from '../progression/goods';
import { factor, standardGuns, type Guns } from '../progression/modifiers';
import { noUpgrades, type UpgradeLevels } from '../progression/upgrades';
import { createShip, type Ship } from '../ship/ship';
import { SHIP_TYPES, sizeRank, type ShipType } from '../shipTypes';
import { islandById, land } from '../world/island';
import type { Crate } from '../world/loot';
import { guardSlot } from './escortGuard';
import { formationOffset } from './formations';
import { freeSpace } from './holds';
import type { TradeOrder } from './tradeRoutes';

export type Formation = keyof typeof FORMATION_NAMES;

const NAMES = [
  'La Mouette', 'Le Requin', 'La Vipère', 'Le Corbeau', "L'Albatros", 'La Sirène',
  'Le Kraken', 'La Murène', 'Le Cormoran', 'La Tempête', "L'Espadon", 'La Barracuda',
];

export interface FleetMember {
  readonly id: number;
  readonly name: string;
  readonly type: ShipType;
  /** Niveaux d'amélioration propres à ce bateau. */
  readonly levels: UpgradeLevels;
  readonly ship: Ship;
  readonly ai: AllyAI;
  /** Dans le monde (à flot ou en train de couler). Sinon, il attend sa réapparition. */
  inWorld: boolean;
  /** Temps avant réapparition (s), quand il n'est pas dans le monde. */
  respawnIn: number;
  /** Total dépensé pour ce bateau (achat + améliorations), pour la revente. */
  readonly spent: Cost;
  /** Place tirée au hasard pour la formation « libre » (côté, recul) et délai avant d'en changer. */
  readonly freeSlot: { side: number; back: number; timer: number };
  /** Navires ennemis coulés par ce bateau (coup fatal). */
  kills: number;
  /** Contenu de la cale (perdu si le navire sombre). */
  readonly cargo: Cargo;
  /** Poste à tenir hors formation (pêche), ou null : l'IA s'y rend et s'y arrête. */
  station: { x: number; z: number } | null;
  /** Type de canons de chaque calibre, et ceux déjà achetés pour ce navire (« main:long »…) : y revenir est gratuit. */
  guns: Guns;
  readonly ownedGuns: Set<string>;
  /** Pavillons des boss que ce navire a coulés, et ceux qu'on a choisi de ne pas hisser. */
  readonly trophies: BossId[];
  readonly hiddenTrophies: Set<BossId>;
  /** Route commerciale confiée à ce navire (il a quitté la flotte et navigue seul), ou null. */
  trade: TradeOrder | null;
  /** Emblème peint sur sa grande voile (null : aucun), et ceux déjà payés pour lui (y revenir est gratuit). */
  emblem: EmblemId | null;
  readonly ownedEmblems: Set<EmblemId>;
}

/**
 * La flotte du joueur : le bateau qu'il pilote et ceux qui le suivent (IA alliée). Les navires confiés à une route
 * commerciale restent à toi (`members`) mais quittent la formation : `hand` = ceux qui naviguent avec toi (cales,
 * pêche, passage de barre). Tient à jour la liste `ships` partagée et la scène quand un bateau coule, réapparaît ou est vendu.
 */
export class Fleet {
  readonly members: FleetMember[] = [];
  /**
   * Les navires qui naviguent avec toi (pas en commerce), tenus à jour sans allocation par image : ce sont eux qui
   * occupent tes places de flotte (`PlayerState.slots`) ; ceux en commerce occupent un emplacement de leur île.
   */
  readonly hand: FleetMember[] = [];
  /** Les navires en commerce (carte, radar), tenus à jour avec `hand`. */
  readonly traders: Ship[] = [];
  controlled!: FleetMember;
  formation: Formation = 'vee';
  /** Multiplicateur du délai de réapparition (chantier du port amélioré). */
  respawnFactor = 1;
  /** Navire à protéger (escorte en cours), ou null : les suiveurs l'entourent au lieu de suivre le bateau piloté. */
  guarded: Ship | null = null;
  private nextId = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ships: Ship[],
  ) {}

  get leader(): Ship {
    return this.controlled.ship;
  }

  /** Ce qu'accompagnent les suiveurs : le navire à protéger s'il y en a un, sinon le bateau piloté. */
  get anchor(): Ship {
    return this.guarded ?? this.leader;
  }

  /** Ajoute un bateau : le premier est piloté, les suivants arrivent à leur place dans la formation. */
  add(type: ShipType, spent: Cost): FleetMember {
    const ship = createShip(type, 'player', noUpgrades());
    const member: FleetMember = {
      id: this.nextId++,
      name: this.pickName(),
      type,
      levels: noUpgrades(),
      ship,
      ai: new AllyAI(ship),
      inWorld: false,
      respawnIn: 0,
      spent: { ...spent },
      freeSlot: { side: 0, back: 0, timer: 0 },
      kills: 0,
      cargo: emptyCargo(),
      station: null,
      guns: standardGuns(),
      ownedGuns: new Set(['main:standard', 'deck:standard']),
      trophies: [],
      hiddenTrophies: new Set(),
      trade: null,
      emblem: null,
      ownedEmblems: new Set(),
    };
    this.members.push(member);
    this.hand.push(member);
    if (this.members.length === 1) {
      this.controlled = member;
      this.enterWorld(member);
    } else {
      this.respawn(member, 40);
    }
    return member;
  }

  /**
   * Reprend un navire d'une sauvegarde (même identifiant) : à flot à `at`, ou en attente de réapparition (null).
   * Le premier repris devient le bateau piloté, jusqu'à ce que la sauvegarde désigne le bon.
   */
  adopt(member: FleetMember, at: { x: number; z: number; heading: number } | null) {
    this.members.push(member);
    this.refreshHand();
    this.nextId = Math.max(this.nextId, member.id + 1);
    if (this.members.length === 1) this.controlled = member;
    if (!at) return;
    this.enterWorld(member);
    member.ship.respawn(at.x, at.z);
    member.ship.heading = at.heading;
  }

  /** Vend un bateau (jamais celui qu'on pilote). Renvoie ce qu'il rapporte, ou null si impossible. */
  sell(member: FleetMember): Cost | null {
    if (member === this.controlled || this.members.length <= 1) return null;
    if (member.inWorld) this.leaveWorld(member);
    member.ship.dispose();
    this.members.splice(this.members.indexOf(member), 1);
    this.refreshHand();
    return { gold: Math.floor(member.spent.gold * FLEET.sellRatio), wood: Math.floor(member.spent.wood * FLEET.sellRatio) };
  }

  /** Confie un navire à une route commerciale (null = il revient dans la flotte). Jamais celui qu'on pilote. */
  setTrade(member: FleetMember, order: TradeOrder | null): boolean {
    if (order && member === this.controlled) return false;
    member.trade = order;
    member.station = null;
    this.refreshHand();
    return true;
  }

  /** Prend la barre d'un autre bateau à flot (pas d'un navire en commerce). */
  takeControl(member: FleetMember): boolean {
    if (!member.inWorld || !member.ship.alive || member.trade) return false;
    this.controlled = member;
    return true;
  }

  /**
   * Si le bateau piloté coule depuis un moment, passe la barre au bateau à flot le plus proche.
   * Renvoie le nouveau bateau piloté, ou null s'il n'y a pas eu de changement.
   */
  autoSwitch(): FleetMember | null {
    const ship = this.leader;
    if (ship.alive || (ship.sinkTime ?? 0) < FLEET.switchDelay) return null;
    let best: FleetMember | null = null;
    for (const m of this.members) {
      if (m === this.controlled || !m.inWorld || !m.ship.alive || m.trade) continue;
      if (!best || m.ship.distanceTo(ship) < best.ship.distanceTo(ship)) best = m;
    }
    if (best) this.controlled = best;
    return best;
  }

  /** Le plus gros type de navire de la flotte. */
  get strongest(): ShipType {
    return this.members.reduce((best, m) => (sizeRank(m.type) > sizeRank(best) ? m.type : best), this.members[0].type);
  }

  /** Portée du radar : le meilleur navigateur des navires à flot l'allonge (facteur). */
  radarFactor(): number {
    return this.members.reduce((best, m) => (m.inWorld && m.ship.alive ? Math.max(best, factor(m.ship.modifiers, 'radar')) : best), 1);
  }

  /** Un bateau de la flotte (hors navires en commerce) est-il encore à flot ? */
  anyAlive(): boolean {
    return this.hand.some((m) => m.inWorld && m.ship.alive);
  }

  /** `crates` : le butin qui flotte, que les suiveurs vont ramasser quand il est proche et qu'ils ne se battent pas. */
  update(dt: number, crates: readonly Crate[]) {
    for (const m of this.members) {
      if (!m.inWorld) {
        m.respawnIn -= dt;
        if (m.respawnIn <= 0) this.respawn(m, 120);
        continue;
      }
      // Le bateau piloté qui a fini de couler est géré par le jeu (passage de barre ou naufrage de toute la flotte).
      if (m.ship.sunk && m !== this.controlled) {
        this.leaveWorld(m);
        m.respawnIn = SHIP_TYPES[m.type].respawnTime * this.respawnFactor;
        continue;
      }
      // Un navire en commerce est mené par sa route (TradeRoutes).
      if (m === this.controlled || !m.ship.alive || m.trade) continue;
      // L'escorte passe avant la pêche : le poste est gardé pour après.
      if (m.station && !this.guarded) {
        m.ai.holdStation(m.station.x, m.station.z, this.ships);
        continue;
      }
      const slot = this.slotPosition(m, dt);
      m.ai.update(this.anchor, slot.x, slot.z, this.ships, this.pickupFor(m, crates));
    }
  }

  /** Le butin le plus proche d'un suiveur, à moins de ALLY.lootRange de lui et pas trop loin de ce qu'il accompagne, ou null. */
  private pickupFor(member: FleetMember, crates: readonly Crate[]): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDistance = ALLY.lootRange;
    const ship = member.ship;
    const anchor = this.anchor;
    for (const { mesh, kind } of crates) {
      const p = mesh.position;
      // Rhum et épices : seulement s'il reste de la place dans sa cale.
      if ((kind === 'rum' || kind === 'spices') && freeSpace(member) === 0) continue;
      const d = Math.hypot(p.x - ship.position.x, p.z - ship.position.z);
      if (d >= bestDistance || Math.hypot(p.x - anchor.position.x, p.z - anchor.position.z) > ALLY.leash) continue;
      best = p;
      bestDistance = d;
    }
    return best;
  }

  /** Toute la flotte a coulé : tout le monde réapparaît autour de (x, z), au cap donné, intact (les navires en commerce poursuivent leur route). */
  respawnAll(x: number, z: number, heading: number) {
    for (const m of this.hand) if (m.inWorld) this.leaveWorld(m);
    this.controlled.ship.respawn(x, z);
    this.controlled.ship.heading = heading;
    this.enterWorld(this.controlled);
    for (const m of this.hand) if (m !== this.controlled) this.respawn(m, 0);
  }

  /**
   * Place d'un bateau dans la formation, en coordonnées monde (pendant une escorte : son poste autour du navire protégé).
   * Le décalage est exprimé dans le repère du bateau piloté : vers l'arrière et vers bâbord.
   */
  slotPosition(member: FleetMember, dt = 0): { x: number; z: number } {
    const others = this.hand.filter((m) => m !== this.controlled && m.inWorld);
    if (this.guarded) return guardSlot(Math.max(0, others.indexOf(member)), others.length, this.guarded, member.ship);
    const rank = Math.max(1, others.indexOf(member) + 1);
    const { back, side } = formationOffset(this.formation, rank, member.freeSlot, dt);
    const leader = this.leader;
    const fx = Math.sin(leader.heading);
    const fz = Math.cos(leader.heading);
    // Bâbord du chef en coordonnées monde : (fz, -fx).
    // Une place qui tomberait sur la terre (ou trop près du rivage) est repoussée au large.
    return land.keepOffshore(leader.position.x - fx * back + fz * side, leader.position.z - fz * back - fx * side, LAND.allyMargin + 6);
  }

  /** Fait réapparaître un bateau à sa place, `extraBack` mètres plus loin derrière (il rejoint ensuite) ; un navire en commerce, au port d'où part son étape. */
  private respawn(member: FleetMember, extraBack: number) {
    this.enterWorld(member);
    if (member.trade) {
      const start = islandById(member.trade.ports[member.trade.leg]).portSpawn;
      member.ship.respawn(start.x, start.z);
      member.ship.heading = start.heading;
      return;
    }
    const slot = this.slotPosition(member);
    const leader = this.anchor;
    const spot = land.keepOffshore(slot.x - Math.sin(leader.heading) * extraBack, slot.z - Math.cos(leader.heading) * extraBack, LAND.allyMargin + 6);
    member.ship.respawn(spot.x, spot.z);
    member.ship.heading = leader.heading;
  }

  private enterWorld(member: FleetMember) {
    if (member.inWorld) return;
    member.inWorld = true;
    this.ships.push(member.ship);
    this.scene.add(member.ship.model.root);
  }

  private leaveWorld(member: FleetMember) {
    member.inWorld = false;
    this.ships.splice(this.ships.indexOf(member.ship), 1);
    this.scene.remove(member.ship.model.root);
  }

  private refreshHand() {
    this.hand.length = 0;
    this.traders.length = 0;
    for (const m of this.members) {
      if (m.trade) this.traders.push(m.ship);
      else this.hand.push(m);
    }
  }

  private pickName(): string {
    const used = new Set(this.members.map((m) => m.name));
    return NAMES.find((n) => !used.has(n)) ?? `Navire n°${this.nextId}`;
  }
}
