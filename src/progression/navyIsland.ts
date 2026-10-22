import { CONTRACTS, GARRISON, PORT, type Cost, type IslandInfoDef, type NavyHoldDef } from '../config';
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
  /** Niveau de ta flotte (étoiles des offres de la taverne) : les contre-attaques s'y règlent. */
  fleetLevel(): number;
}

/** Une ligne du suivi des contrats (contre-attaque en cours). */
export interface Objective {
  readonly title: string;
  readonly note: string;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);

/** Le fort dans une phrase : « Fort-Royal », « le fortin du Dauphin » ; `start` : en tête de phrase (« Le fortin… »). */
function fortPhrase(fort: IslandInfoDef['fort'], start = false): string {
  if (fort.proper) return fort.name;
  const article = fort.feminine ? 'la' : 'le';
  const phrase = `${article} ${fort.name.charAt(0).toLowerCase()}${fort.name.slice(1)}`;
  return start ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
}

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
  private attackIn: number;
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
    private readonly def: NavyHoldDef,
  ) {
    this.garrison = new NavyGarrison(island, world.spawner, def.garrison);
    this.attackIn = rand(def.counterAttack.interval);
    this.target = { position: fort.aim, velocityX: 0, velocityZ: 0, radius: fort.bounds.radius };
    this.orders = [`Port de la Marine : abats ${fortPhrase(state.info.fort)} pour prendre l'île`, 'Coule les navires de la Marine près du port, puis accoste pour prendre l’île'];
    this.sync();
  }

  /** Camp et réparation du fort, et accès au port, selon qui tient l'île (début, chargement, prise, perte). */
  sync() {
    const navy = this.state.navyHeld;
    this.fort.setFaction(navy ? 'enemy' : 'player');
    this.fort.regen = navy ? { delay: this.def.fort.regenDelay, rate: this.def.fort.regenRate } : null;
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

  /**
   * Fort dont la barre de vie s'affiche : le tien assiégé par la Marine, ou le sien dès qu'il sort de la brume pour la
   * caméra (`eye`), jamais avant (GARRISON.fortBarFog).
   */
  barFort(eye: { x: number; z: number }, fog: { near: number; far: number }): Fort | null {
    if (this.counter) return this.counter.besieged;
    const b = this.fort.bounds;
    const sight = fog.near + (fog.far - fog.near) * GARRISON.fortBarFog;
    const inSight = Math.hypot(eye.x - b.x, eye.z - b.z) < sight;
    return this.state.navyHeld && this.fort.alive && inSight ? this.fort : null;
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
    const fort = this.state.info.fort;
    const fell = `${fortPhrase(fort, true)} est tombé${fort.feminine ? 'e' : ''}`;
    if (this.wasStanding && !standing) this.events.alert(`${fell} ! Accoste à ${this.state.info.portName} pour prendre l'île.`);
    this.wasStanding = standing;
    const port = this.island.port;
    const alarm = this.fort.sinceHit < GARRISON.hitAlarm || this.shipsNear(port, GARRISON.alertRadius, false);
    if (alarm && standing && !this.alarmed) this.events.toast(`${fortPhrase(fort, true)} donne l'alarme : la garnison appareille !`, 'danger');
    if (alarm) this.alarmed = true;
    else if (Math.hypot(leader.position.x - port.x, leader.position.z - port.z) > this.def.garrison.activeRadius) this.alarmed = false;
    this.garrison.update(dt, leader, standing, alarm);
    this.aimFleet(standing);
    if (!standing && this.canLand(leader)) this.capture();
  }

  /**
   * Tes navires (et tes alliés) dans les parages du fort de la Marine (GARRISON.fortAimRange) le bombardent quand il
   * est à portée et qu'aucun navire ne l'est ; plus loin, ils n'ont plus de cible (une autre île de la Marine peut les
   * prendre).
   */
  private aimFleet(on: boolean) {
    const b = this.fort.bounds;
    for (const ship of this.world.ships) {
      if (ship.faction === 'enemy' || ship.faction === 'cursed') continue;
      const near = on && Math.hypot(ship.position.x - b.x, ship.position.z - b.z) < GARRISON.fortAimRange;
      if (near && ship.siegeTarget === null) ship.siegeTarget = this.target;
      else if (!near && ship.siegeTarget === this.target) ship.siegeTarget = null;
    }
  }

  /** Un navire à flot de la Marine (`navy`), ou de ton côté (ta flotte, tes alliés), à moins de `radius` m de `p` ? */
  private shipsNear(p: { x: number; z: number }, radius: number, navy: boolean): boolean {
    return this.world.ships.some((s) => s.alive && s.faction !== 'cursed' && (s.faction === 'enemy') === navy && Math.hypot(s.position.x - p.x, s.position.z - p.z) < radius);
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
    this.attackIn = rand(this.def.counterAttack.interval);
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
      this.attackIn = rand(this.def.counterAttack.interval);
      if (outcome === 'failure') {
        this.lose();
        return;
      }
      const s = this.def.counterAttack.spoilsPerShip;
      const spoils: Cost = { gold: s.gold * size, wood: s.wood * size };
      this.state.addSpoils(spoils);
      this.events.toast(`${info.shortName} a tenu ! Butin de l'escadre dans la réserve de l'île : +${spoils.gold} or, +${spoils.wood} bois`, 'good');
      return;
    }
    this.attackIn -= dt;
    if (this.attackIn > 0) return;
    const c = this.def.counterAttack;
    const stars = Math.max(1, Math.min(c.maxStars, CONTRACTS.stars, this.events.fleetLevel() + c.starBonus));
    const order = { island: this.island.id, stars, delay: c.warning };
    this.counter = new SiegeMission(this.world, order, () => this.events.alert(`⚔ L'escadre de la Marine attaque ${fortPhrase(info.fort)} !`));
    this.events.alert(`⚔ La Marine marche sur ${info.shortName} ! Son escadre attaquera dans ${Math.round(c.warning / 60)} min.`);
  }

  /** Le fort est tombé pendant une contre-attaque : la Marine reprend l'île (fort remis en état, garnison de retour). */
  private lose() {
    this.state.lose();
    this.sync();
    this.wasStanding = null;
    this.events.changed(false);
    const fort = this.state.info.fort;
    this.events.alert(`${fortPhrase(fort, true)} est tombé${fort.feminine ? 'e' : ''} : la Marine reprend ${this.state.info.shortName} !`);
  }
}
