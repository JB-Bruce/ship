import type * as THREE from 'three';
import { BROADSIDE, COMBAT, CONTRACTS, ENEMIES, GARRISON, HARASS, SAIL } from '../config';
import type { Ship } from '../ship/ship';
import { SHIP_TYPES } from '../shipTypes';
import { wrapAngle } from '../utils/math';
import { conditions } from '../world/weather';
import { bearingTo, broadside, firingRange, nearest, steerTo } from './steering';

/** `leave` : s'éloigne pour de bon (boss quand la tempête se calme), sans plus attaquer. */
export type EnemyState = 'patrol' | 'chase' | 'engage' | 'flee' | 'leave';

/** Flottille ennemie : un chef, et l'alerte partagée (dès qu'un membre repère une proie, tous attaquent). */
export interface EnemyGroup {
  readonly leader: Ship;
  alerted: boolean;
}

/** Comportements particuliers d'un ennemi (boss, missions). */
export interface EnemyAIOptions {
  /** Acharné (boss) : il sait toujours où tu es et ne fuit jamais. */
  relentless?: boolean;
  /** Harcèlement (Le Spectre, à combiner avec `relentless`) : il attaque, replonge dans la brume, revient ailleurs. */
  harass?: boolean;
  /** Zone de patrouille (capitaine d'une mission de chasse) : il y revient tant qu'il n'a pas de proie. */
  home?: { x: number; z: number; radius: number };
  /** Assiégeant : il bombarde ce point (une citadelle) tant qu'aucune proie ne s'approche. */
  siege?: { position: THREE.Vector3 };
  /** Garnison au mouillage : voiles carguées à cette place jusqu'à l'alerte (`wake`), il y revient et rejette l'ancre. */
  moored?: { x: number; z: number };
  /** Garnison en patrouille : il tourne autour de ce point à `radius` m, dans le sens `turn` (+1 ou -1). */
  orbit?: { x: number; z: number; radius: number; turn: number };
  /** Laisse (garnison) : au-delà de cette distance de son poste (mouillage ou centre de sa ronde), il lâche sa proie et rentre. */
  leash?: number;
}

/** Une garnison qui a lâché sa proie ne repart en chasse qu'une fois revenue à cette part de sa laisse. */
const LEASH_RETURN = 0.5;

/** Place d'un suiveur dans la flottille, dans le repère du chef : vers bâbord et vers l'arrière (m). */
export interface FlotillaSlot {
  readonly side: number;
  readonly back: number;
}

/**
 * Pilote d'un bateau ennemi. Il ne fait que remplir `ship.controls`, comme le clavier du joueur :
 * patrouille → repère le bateau du joueur le plus proche → s'approche → attaque.
 * Canons sur les flancs : il se place flanc à flanc. Canon à l'avant (barque) : il fait des passes d'attaque.
 * Presque coulé, il fuit ; une fois réparé à 80 %, il revient au combat (s'il s'éloigne trop, il disparaît).
 * En flottille, les suiveurs tiennent leur place derrière le chef tant que personne n'a repéré de proie.
 * Acharné (boss) : il sait toujours où tu es et ne fuit jamais. Capitaine (chasse) : il patrouille dans sa zone.
 * Assiégeant (défense d'un port) : il bombarde le fort, sauf si une proie vient le chercher.
 * Harcèlement : attaque d'un moment, puis retraite dans la brume, tour de la proie hors de vue, et retour ailleurs.
 */
export class EnemyAI {
  state: EnemyState = 'patrol';
  private patrolHeading: number;
  private patrolTimer = 0;
  /** Flanc présenté (bordée) ou côté de dégagement (passe d'attaque) : +1 ou -1. */
  private side = 1;
  /** Temps restant de dégagement après une passe d'attaque (s). */
  private veerTime = 0;
  /** Harcèlement : attaque (`strike`) ou retraite dans la brume (`fade`), sa durée et la vie au début de l'attaque. */
  private phase: 'strike' | 'fade' = 'strike';
  private phaseTimer = 0;
  private strikeHealth = 0;
  /** Harcèlement : direction (vue de la proie) par laquelle il reviendra, et sens dans lequel il en fait le tour. */
  private returnBearing = 0;
  private circleSide = 1;
  private targetDistance = Infinity;
  /** Sa proie du moment (le plus proche des bateaux qu'il repère), ou null. */
  target: Ship | null = null;
  /** Au mouillage (garnison) : voiles carguées, il guette. */
  anchored: boolean;
  /** Sa vie quand il a jeté l'ancre : touché depuis, il appareille. */
  private anchorHealth: number;
  /** Garnison qui a dépassé sa laisse : il rentre à son poste sans plus chasser. */
  private returning = false;

  constructor(
    private readonly ship: Ship,
    readonly group: EnemyGroup | null = null,
    private readonly slot: FlotillaSlot | null = null,
    private readonly options: EnemyAIOptions = {},
  ) {
    this.patrolHeading = ship.heading;
    this.anchored = !!options.moored;
    this.anchorHealth = ship.health;
    if (options.harass) this.strike();
  }

  /** Alerte (garnison au mouillage) : il appareille. */
  wake() {
    this.anchored = false;
  }

  /** Caché dans la brume pendant une retraite de harcèlement : invisible au radar. */
  get hidden(): boolean {
    return this.phase === 'fade' && this.targetDistance > HARASS.radarHidden;
  }

  /** `targets` : tous les bateaux (ceux du joueur y sont repérés par leur camp). */
  update(dt: number, targets: readonly Ship[]) {
    // Une flottille alertée cherche ses proies aussi loin qu'un ennemi déjà lancé à leur poursuite.
    const hunting = this.state !== 'patrol' || this.group?.alerted;
    const range = this.options.relentless ? Infinity : hunting ? ENEMIES.loseRange : ENEMIES.detectionRange * conditions.detectionFactor;
    // En patrouille, il faut d'abord repérer sa proie (un navire discret se laisse approcher).
    let target = nearest(this.ship, targets, range, !hunting && !this.options.relentless);
    // Au mouillage, il guette : il appareille s'il repère une proie, s'il est touché, ou à l'alerte (wake).
    if (this.anchored) {
      if (!target && this.ship.health >= this.anchorHealth) {
        this.target = null;
        this.ship.controls.sail = 0;
        this.ship.controls.rudder = 0;
        return;
      }
      this.anchored = false;
    }
    if (this.leashed()) target = null;
    this.target = target;
    const distance = target ? this.ship.distanceTo(target) : Infinity;
    this.targetDistance = distance;
    this.updateState(target, distance);
    if (this.group && target && this.state !== 'flee' && this.state !== 'leave') this.group.alerted = true;

    if (this.state === 'leave') {
      // Dos à ses proies, toutes voiles dehors.
      if (target) steerTo(this.ship, bearingTo(this.ship, target.position.x, target.position.z) + Math.PI, SAIL.full);
      else this.ship.controls.sail = SAIL.full;
    } else if (this.state === 'flee') {
      if (target) steerTo(this.ship, bearingTo(this.ship, target.position.x, target.position.z) + Math.PI, SAIL.full);
      else this.ship.controls.sail = SAIL.full;
    } else if (this.options.harass && target) {
      this.harass(dt, target, distance);
    } else if (this.options.siege && (!target || distance > CONTRACTS.defend.engageRadius)) {
      this.besiege(this.options.siege.position);
    } else if (!target || this.state === 'patrol') {
      const leader = this.group?.leader;
      if (this.slot && leader && leader.alive) this.followLeader(leader);
      else this.patrol(dt);
    } else if (SHIP_TYPES[this.ship.type].armament === 'bow') {
      this.attackRun(dt, target, distance);
    } else if (this.state === 'chase') {
      steerTo(this.ship, bearingTo(this.ship, target.position.x, target.position.z), SAIL.full);
    } else {
      this.side = broadside(this.ship, target, this.side, SAIL.half);
    }
  }

  /** Garnison trop loin de son poste : elle lâche sa proie jusqu'à y être revenue (à LEASH_RETURN de sa laisse). */
  private leashed(): boolean {
    const { leash } = this.options;
    const post = this.options.moored ?? this.options.orbit;
    if (!leash || !post) return false;
    const away = Math.hypot(post.x - this.ship.position.x, post.z - this.ship.position.z);
    if (away > leash) this.returning = true;
    else if (away < leash * LEASH_RETURN) this.returning = false;
    return this.returning;
  }

  /** Renonce au combat et s'éloigne pour de bon. */
  leave() {
    this.state = 'leave';
  }

  private updateState(target: Ship | null, distance: number) {
    if (this.state === 'leave') return;
    if (this.state === 'flee') {
      // Réparé (réparation normale, une fois au calme) : il revient au combat.
      if (this.ship.health < this.ship.stats.maxHealth * COMBAT.rallyHealth) return;
      this.state = target ? 'chase' : 'patrol';
      return;
    }
    // Le boss et les assiégeants ne fuient jamais.
    const brave = this.options.relentless || this.options.siege;
    if (!brave && this.ship.health < this.ship.stats.maxHealth * COMBAT.fleeHealth) this.state = 'flee';
    else if (!target) this.state = 'patrol';
    else if (this.state === 'patrol') this.state = 'chase';
    else if (this.state === 'chase' && distance < firingRange(this.ship) * BROADSIDE.turnAt) this.state = 'engage';
    else if (this.state === 'engage' && distance > firingRange(this.ship) * BROADSIDE.chaseAgain) this.state = 'chase';
  }

  /**
   * Passe d'attaque : proue pointée sur la cible pour tirer avec le canon avant, dégagement au dernier
   * moment (pour ne pas éperonner), puis demi-tour et nouvelle passe.
   */
  private attackRun(dt: number, target: Ship, distance: number) {
    const bearing = bearingTo(this.ship, target.position.x, target.position.z);
    if (this.veerTime > 0) {
      this.veerTime -= dt;
      steerTo(this.ship, bearing + this.side * ENEMIES.veerAngle, SAIL.full);
      return;
    }
    if (distance < ENEMIES.veerDistance) {
      this.veerTime = ENEMIES.veerTime;
      this.side = Math.random() < 0.5 ? 1 : -1;
      return;
    }
    // Pleine cadence pour fondre sur la cible, on ralentit seulement en fin de passe pour bien viser.
    steerTo(this.ship, bearing, distance < ENEMIES.veerDistance * 2 ? SAIL.half : SAIL.full);
  }

  /** Nouvelle attaque de harcèlement. */
  private strike() {
    this.phase = 'strike';
    this.phaseTimer = HARASS.strikeTime[0] + Math.random() * (HARASS.strikeTime[1] - HARASS.strikeTime[0]);
    this.strikeHealth = this.ship.health;
  }

  /**
   * Harcèlement : il fond sur sa proie et la bombarde un moment (ou jusqu'à avoir trop souffert), puis s'éloigne au-delà
   * de la brume, en fait le tour hors de vue et revient par un autre côté.
   */
  private harass(dt: number, target: Ship, distance: number) {
    const ship = this.ship;
    const h = HARASS;
    // D'où il voit sa proie : sa position vue depuis elle.
    const angle = Math.atan2(ship.position.x - target.position.x, ship.position.z - target.position.z);
    if (this.phase === 'strike') {
      // L'attaque ne se décompte qu'à portée de tir (pas pendant l'approche).
      if (distance < firingRange(ship) * HARASS.strikeRange) this.phaseTimer -= dt;
      const hurt = this.strikeHealth - ship.health > ship.stats.maxHealth * h.hitLimit;
      if (this.phaseTimer <= 0 || hurt) {
        this.phase = 'fade';
        this.circleSide = Math.random() < 0.5 ? 1 : -1;
        this.returnBearing = angle + this.circleSide * (h.circleAngle[0] + Math.random() * (h.circleAngle[1] - h.circleAngle[0]));
        return;
      }
      this.side = broadside(ship, target, this.side, SAIL.half);
      return;
    }
    // Retraite : il s'éloigne en biais, puis tourne autour de sa proie à distance, jusqu'à l'angle de retour.
    if (distance < h.hideDistance) {
      steerTo(ship, angle + this.circleSide * 0.5, SAIL.full);
      return;
    }
    const remaining = wrapAngle(this.returnBearing - angle);
    if (Math.abs(remaining) < 0.2) {
      this.strike();
      return;
    }
    // Cap tangent au cercle (angle + π/2 fait croître l'angle), corrigé pour rester vers `hideDistance`.
    const turn = Math.sign(remaining);
    const correction = Math.max(-0.6, Math.min(0.6, (distance - h.hideDistance * 1.15) / h.hideDistance));
    steerTo(ship, angle + turn * (Math.PI / 2 + correction), SAIL.full);
  }

  /** Suiveur de flottille : rejoint sa place derrière le chef, puis garde le même cap. */
  private followLeader(leader: Ship) {
    const { side, back } = this.slot!;
    const fx = Math.sin(leader.heading);
    const fz = Math.cos(leader.heading);
    // Bâbord du chef en coordonnées monde : (fz, -fx).
    const tx = leader.position.x - fx * back + fz * side;
    const tz = leader.position.z - fz * back - fx * side;
    const gap = Math.hypot(tx - this.ship.position.x, tz - this.ship.position.z);
    const tolerance = ENEMIES.flotilla.slotTolerance;
    const heading = gap > tolerance ? bearingTo(this.ship, tx, tz) : leader.heading;
    // En retard : plus de voile pour rattraper ; à sa place : la même allure que le chef.
    const sail = Math.min(SAIL.full, Math.max(SAIL.half * 0.6, SAIL.half + (gap - tolerance) / 40));
    steerTo(this.ship, heading, sail);
  }

  /** Siège : approche à pleine voile, puis bordées sur la citadelle à distance de tir. */
  private besiege(fort: THREE.Vector3) {
    const d = Math.hypot(fort.x - this.ship.position.x, fort.z - this.ship.position.z);
    const standoff = CONTRACTS.defend.standoff;
    if (d > standoff * 1.6) steerTo(this.ship, bearingTo(this.ship, fort.x, fort.z), SAIL.full);
    else this.side = broadside(this.ship, { position: fort }, this.side, SAIL.half, standoff);
  }

  private patrol(dt: number) {
    if (this.options.moored) {
      this.backToMooring(this.options.moored);
      return;
    }
    if (this.options.orbit) {
      this.circle(this.options.orbit);
      return;
    }
    this.patrolTimer -= dt;
    if (this.patrolTimer <= 0) {
      this.patrolHeading += (Math.random() - 0.5) * 1.2;
      this.patrolTimer = 8 + Math.random() * 8;
    }
    // Hors de sa zone de patrouille, il y retourne.
    const home = this.options.home;
    if (home && Math.hypot(home.x - this.ship.position.x, home.z - this.ship.position.z) > home.radius) {
      this.patrolHeading = bearingTo(this.ship, home.x, home.z);
    }
    steerTo(this.ship, this.patrolHeading, SAIL.half);
  }

  /** Garnison sans proie : retour au mouillage, où il rejette l'ancre. */
  private backToMooring(spot: { x: number; z: number }) {
    const d = Math.hypot(spot.x - this.ship.position.x, spot.z - this.ship.position.z);
    if (d < GARRISON.mooringRadius) {
      this.anchored = true;
      this.anchorHealth = this.ship.health;
      this.ship.controls.sail = 0;
      return;
    }
    steerTo(this.ship, bearingTo(this.ship, spot.x, spot.z), d < GARRISON.mooringRadius * 4 ? SAIL.half * 0.5 : SAIL.half);
  }

  /** Ronde autour de l'île : cap tangent au cercle, corrigé pour revenir sur son rayon. */
  private circle(o: { x: number; z: number; radius: number; turn: number }) {
    const angle = Math.atan2(this.ship.position.x - o.x, this.ship.position.z - o.z);
    const d = Math.hypot(this.ship.position.x - o.x, this.ship.position.z - o.z);
    const correction = Math.max(-0.6, Math.min(0.6, ((d - o.radius) / o.radius) * 3));
    steerTo(this.ship, angle + o.turn * (Math.PI / 2 + correction), SAIL.half);
  }
}
