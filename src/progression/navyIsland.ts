import { COUNTER_ATTACK, GARRISON, PORT, ROYAL_FORT, type Cost } from '../config';
import type { CannonTarget } from '../combat/cannons';
import type { MissionWorld } from '../missions/mission';
import { SiegeMission } from '../missions/siegeMission';
import type { Ship } from '../ship/ship';
import type { ToastTone } from '../ui/toasts';
import type { Fort } from '../world/fort';
import { harbors } from '../world/harbors';
import type { Island } from '../world/island';
import { NavyGarrison } from '../world/navyGarrison';
import type { IslandState } from './islandState';

export interface NavyIslandEvents {
  /** Grand bandeau : alarme, chute du fort, prise et perte de l'île, contre-attaque. */
  alert(text: string): void;
  toast(text: string, tone: ToastTone): void;
  /** L'île vient d'être prise (true) ou reprise par la Marine (false) : la campagne met le reste à jour. */
  changed(captured: boolean): void;
  /** Étoiles de l'escadre d'une contre-attaque. */
  stars(): number;
}

/** Une ligne du suivi des contrats (contre-attaque en cours). */
export interface Objective {
  readonly title: string;
  readonly note: string;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/**
 * Une île de la Marine (l'Île Royale). Tant qu'elle la tient : port fermé, fort ennemi qui se répare si on le laisse en
 * paix, garnison amarrée et en ronde ; tes navires bombardent le fort quand il est à portée. Le fort abattu, on prend
 * l'île en accostant au port sans ennemi proche (arsenal : ISLAND_INFO.captureLevels). Une fois à toi, la Marine
 * contre-attaque de temps en temps (siège après un préavis) : repoussée, son butin va dans la réserve de l'île ; si le
 * fort tombe, la Marine reprend l'île.
 */
export class NavyIsland {
  private readonly garrison: NavyGarrison;
  /** Ce que visent tes canons quand le fort est à portée : le centre de l'enceinte, sous le parapet. */
  private readonly target: CannonTarget;
  private counter: SiegeMission | null = null;
  private attackIn = rand(COUNTER_ATTACK.interval);
  /** Le fort tenait à l'image précédente (null avant la première image). */
  private wasStanding: boolean | null = null;
  /** L'alarme a sonné pour cette approche (un seul message). */
  private alarmed = false;
  /** Consignes près du port de la Marine : fort debout, puis fort abattu. */
  private readonly orders: readonly [string, string];

  constructor(
    readonly island: Island,
    private readonly state: IslandState,
    private readonly fort: Fort,
    private readonly world: MissionWorld,
    private readonly events: NavyIslandEvents,
  ) {
    this.garrison = new NavyGarrison(island, world.spawner);
    this.target = { position: fort.aim, velocityX: 0, velocityZ: 0, radius: fort.bounds.radius };
    this.orders = [`Port de la Marine : abats ${state.info.fort.name} pour prendre l'île`, 'Coule les navires de la Marine près du port, puis accoste pour prendre l’île'];
    this.sync();
  }

  /** Camp et réparation du fort, et accès au port, selon qui tient l'île (début, chargement, prise, perte). */
  sync() {
    const navy = this.state.navyHeld;
    this.fort.setFaction(navy ? 'enemy' : 'player');
    this.fort.regen = navy ? { delay: ROYAL_FORT.regenDelay, rate: ROYAL_FORT.regenRate } : null;
    harbors.setClosed(this.island.id, navy);
  }

  /** Vie du fort à sauvegarder (part du maximum) tant que la Marine tient l'île, sinon null. */
  snapshot(): number | null {
    return this.state.navyHeld ? this.fort.health / this.fort.maxHealth : null;
  }

  restore(fortShare: number | null | undefined) {
    this.sync();
    this.fort.setHealthShare(this.state.navyHeld && fortShare != null ? fortShare : 1);
    this.wasStanding = null;
  }

  update(dt: number, leader: Ship) {
    if (this.state.navyHeld) this.holdByNavy(dt, leader);
    else this.defend(dt);
  }

  /** Ouvrage que les boulets peuvent toucher : le fort de la Marine debout, ou le tien pendant une contre-attaque. */
  get besieged(): Fort | null {
    if (this.counter) return this.counter.besieged;
    return this.state.navyHeld && this.fort.alive ? this.fort : null;
  }

  /** Fort dont la barre de vie s'affiche : assiégé par la Marine, ou le sien quand ton navire en approche. */
  barFort(leader: Ship): Fort | null {
    if (this.counter) return this.counter.besieged;
    const b = this.fort.bounds;
    const near = Math.hypot(leader.position.x - b.x, leader.position.z - b.z) < ROYAL_FORT.barRange;
    return this.state.navyHeld && this.fort.alive && near ? this.fort : null;
  }

  /** Contre-attaque en cours, pour le suivi des contrats. */
  get objective(): Objective | null {
    const status = this.counter?.status();
    return status ? { title: `⚔ Défendre ${this.state.info.shortName}`, note: status } : null;
  }

  /** Consigne près du port de la Marine (null loin de lui, ou une fois l'île à toi). */
  status(leader: Ship): string | null {
    const port = this.island.port;
    if (!this.state.navyHeld || Math.hypot(leader.position.x - port.x, leader.position.z - port.z) > GARRISON.alertRadius) return null;
    return this.orders[this.fort.alive ? 0 : 1];
  }

  private holdByNavy(dt: number, leader: Ship) {
    const standing = this.fort.alive;
    const fortName = this.state.info.fort.name;
    if (this.wasStanding && !standing) this.events.alert(`${fortName} est tombé ! Accoste à ${this.state.info.portName} pour prendre l'île.`);
    this.wasStanding = standing;
    const port = this.island.port;
    const alarm = this.fort.sinceHit < GARRISON.hitAlarm || this.shipsNear(port, GARRISON.alertRadius, false);
    if (alarm && standing && !this.alarmed) this.events.toast(`${fortName} donne l'alarme : la garnison appareille !`, 'danger');
    if (alarm) this.alarmed = true;
    else if (Math.hypot(leader.position.x - port.x, leader.position.z - port.z) > GARRISON.activeRadius) this.alarmed = false;
    this.garrison.update(dt, leader, standing, alarm);
    this.aimFleet(standing);
    if (!standing && this.canLand(leader)) this.capture();
  }

  /** Tes navires (et tes alliés) bombardent le fort de la Marine quand il est à portée et qu'aucun navire ne l'est. */
  private aimFleet(on: boolean) {
    for (const ship of this.world.ships) {
      if (ship.faction === 'enemy') continue;
      if (on && ship.siegeTarget === null) ship.siegeTarget = this.target;
      else if (!on && ship.siegeTarget === this.target) ship.siegeTarget = null;
    }
  }

  /** Un navire à flot de la Marine (`navy`), ou de ton côté (ta flotte, tes alliés), à moins de `radius` m de `p` ? */
  private shipsNear(p: { x: number; z: number }, radius: number, navy: boolean): boolean {
    return this.world.ships.some((s) => s.alive && (s.faction === 'enemy') === navy && Math.hypot(s.position.x - p.x, s.position.z - p.z) < radius);
  }

  /** Accostage : ton navire au port, et plus aucun navire de la Marine aux abords. */
  private canLand(leader: Ship): boolean {
    const port = this.island.port;
    if (!leader.alive || Math.hypot(leader.position.x - port.x, leader.position.z - port.z) >= PORT.repairRadius) return false;
    return !this.shipsNear(port, PORT.combatRadius, true);
  }

  private capture() {
    this.state.capture();
    this.garrison.release();
    this.aimFleet(false);
    this.fort.restore();
    this.sync();
    this.alarmed = false;
    this.attackIn = rand(COUNTER_ATTACK.interval);
    this.events.changed(true);
    this.events.alert(`${this.state.info.portName} est à toi ! L'arsenal de la Marine t'appartient.`);
  }

  /** L'île est à toi : la Marine revient l'assiéger de temps en temps. */
  private defend(dt: number) {
    const info = this.state.info;
    if (this.counter) {
      const outcome = this.counter.update(dt);
      if (outcome === 'running') return;
      const size = this.counter.size;
      // Fin du siège : les survivants repartent, le fort est remis en état.
      this.counter.dispose();
      this.counter = null;
      this.attackIn = rand(COUNTER_ATTACK.interval);
      if (outcome === 'failure') {
        this.lose();
        return;
      }
      const s = COUNTER_ATTACK.spoilsPerShip;
      const spoils: Cost = { gold: s.gold * size, wood: s.wood * size };
      this.state.addSpoils(spoils);
      this.events.toast(`${info.shortName} a tenu ! Butin de l'escadre dans la réserve de l'île : +${spoils.gold} or, +${spoils.wood} bois`, 'good');
      return;
    }
    this.attackIn -= dt;
    if (this.attackIn > 0) return;
    const order = { island: this.island.id, stars: this.events.stars(), delay: COUNTER_ATTACK.warning };
    this.counter = new SiegeMission(this.world, order, () => this.events.alert(`⚔ L'escadre de la Marine attaque ${info.fort.name} !`));
    this.events.alert(`⚔ La Marine marche sur ${info.shortName} ! Son escadre attaquera dans ${Math.round(COUNTER_ATTACK.warning / 60)} min.`);
  }

  /** Le fort est tombé pendant une contre-attaque : la Marine reprend l'île (fort remis en état, garnison de retour). */
  private lose() {
    this.state.lose();
    this.sync();
    this.wasStanding = null;
    this.events.changed(false);
    this.events.alert(`${this.state.info.fort.name} est tombé : la Marine reprend ${this.state.info.shortName} !`);
  }
}
