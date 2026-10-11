import * as THREE from 'three';
import { COMBAT, CRIT, DAMAGE, LIVERIES, RECOIL, REPAIR, type Faction, type Livery, type ShipStats } from '../config';
import type { CannonTarget } from '../combat/cannons';
import type { Waves } from '../ocean/waves';
import { applyModifiers, factor, noModifiers, standardGuns, type Guns, type StatModifiers } from '../progression/modifiers';
import { deriveStats, shipMass, type UpgradeLevels } from '../progression/upgrades';
import { SHIP_TYPES, type ShipType } from '../shipTypes';
import { moveTowards, wrapAngle } from '../utils/math';
import type { Wind } from '../world/wind';
import { conditions } from '../world/weather';
import { Buoyancy } from './buoyancy';
import { ShipDressing } from './shipDressing';
import { createShipModel, type ShipModel } from './shipModel';
import { ShipCrits } from './shipCrits';

/** Ordres donnés à un bateau. Écrits par un contrôleur (clavier, IA), lus par Ship. */
export interface ShipControls {
  /** Jauge de voile : 0 = affalée, 1 = pleine voile. */
  sail: number;
  /** Barre : +1 = vers bâbord (gauche), -1 = vers tribord (droite). */
  rudder: number;
}

const { damp } = THREE.MathUtils;
/** Ordres d'un bateau qui coule : plus personne à la barre. */
const ADRIFT: ShipControls = { sail: 0, rudder: 0 };

/** Tout ce qui appartient à un camp et peut tirer : bateaux, fort… */
export interface Combatant {
  readonly faction: Faction;
}

/** Joueur et alliés contre ennemis. */
export function isHostile(a: Combatant, b: Combatant): boolean {
  return (a.faction === 'enemy') !== (b.faction === 'enemy');
}

/** Crée un bateau d'un type et d'un camp donnés, avec ses améliorations (stats et apparence). La livrée par défaut est celle du camp. */
export function createShip(type: ShipType, faction: Faction, levels: UpgradeLevels, livery: Livery = LIVERIES[faction]): Ship {
  const def = SHIP_TYPES[type];
  const ship = new Ship(type, deriveStats(type, faction === 'enemy' ? def.enemyStats : def.stats, levels), faction, livery);
  ship.applyLooks(levels);
  return ship;
}

/**
 * Un bateau, quel que soit son camp : joueur, allié ou ennemi partagent ce code.
 * Seul le contrôleur qui remplit `controls` change.
 */
export class Ship {
  readonly position = new THREE.Vector3();
  /** Cap (rad). 0 = proue vers +Z (nord) ; augmente en tournant vers bâbord. */
  heading = 0;
  /** Vitesse vers l'avant (m/s). */
  speed = 0;
  health: number;
  /** Secondes écoulées depuis le naufrage, ou null si le bateau est à flot. */
  sinkTime: number | null = null;
  /** Temps restant avant que chaque canon soit rechargé (s), dans l'ordre de model.cannons. */
  cannonCooldowns: number[];
  /** Temps avant de pouvoir subir un nouvel éperonnage (s). */
  ramCooldown = 0;
  /** Masse (type, blindage, canons, voilure) : elle pèse dans les chocs. */
  mass: number;
  /** Effets des officiers et du rang (fleet/refit.ts), et types de canons de chaque calibre. */
  modifiers: StatModifiers = noModifiers();
  guns: Guns = standardGuns();
  /** Drapeau de rang, pavillons des boss coulés, allure des canons. */
  readonly dressing: ShipDressing;
  /** Secondes écoulées sans tirer ni être touché : au-delà de REPAIR.delay, le bateau se répare. */
  calmTime = 0;
  readonly controls: ShipControls = { sail: 0, rudder: 0 };
  /** Avaries des coups critiques (gréement, gouvernail, incendie). */
  readonly crits = new ShipCrits();
  readonly model: ShipModel;
  /** Point que ce bateau bombarde quand aucun ennemi n'est à portée (assiégeant d'une mission de défense), ou null. */
  siegeTarget: CannonTarget | null = null;

  private rudder = 0;
  private yawRate = 0;
  private readonly buoyancy: Buoyancy;
  private sailAmount = 0;
  /** Voiles en lambeaux même intactes (livrée du Spectre). */
  private readonly tattered: number;

  constructor(
    readonly type: ShipType,
    readonly stats: ShipStats,
    readonly faction: Faction,
    livery: Livery = LIVERIES[faction],
  ) {
    this.model = createShipModel(type, stats, livery);
    this.dressing = new ShipDressing(this.model);
    this.buoyancy = new Buoyancy(SHIP_TYPES[type].mass.base);
    this.mass = SHIP_TYPES[type].mass.base;
    this.tattered = livery.tattered ?? 0;
    this.health = stats.maxHealth;
    this.cannonCooldowns = this.randomCooldowns();
  }

  /** Applique de nouveaux niveaux d'amélioration (stats + apparence). */
  upgrade(levels: UpgradeLevels) {
    const def = SHIP_TYPES[this.type];
    this.applyStats(applyModifiers(deriveStats(this.type, this.faction === 'enemy' ? def.enemyStats : def.stats, levels), this.modifiers, this.guns));
    this.applyLooks(levels);
  }

  /** Ce qui se voit et pèse des améliorations : renfort de coque, voiles élargies, masse (les canons suivent les stats). */
  applyLooks(levels: UpgradeLevels) {
    this.mass = shipMass(this.type, levels);
    // Navire allongé : le modèle est reconstruit (nouveaux canons, nouvelles positions du pavillon et de la hampe).
    if (this.model.setExtension?.(levels.extension)) {
      this.cannonCooldowns = this.randomCooldowns();
      this.dressing.refresh(this.guns);
    }
    this.model.setArmorLevel(levels.hull);
    this.model.setSailLevel(levels.sails);
  }

  /** Le bateau vient de tirer : il est en combat, la réparation attend. */
  markCombat() {
    this.calmTime = 0;
  }

  /**
   * Remplace les caractéristiques (après une amélioration). La vie gagnée est ajoutée tout de suite,
   * et les canons du modèle sont reconstruits si leur nombre change.
   */
  applyStats(next: ShipStats) {
    const healthGain = next.maxHealth - this.stats.maxHealth;
    const cannonsChanged = next.cannonsPerSide !== this.stats.cannonsPerSide;
    Object.assign(this.stats, next, {
      cannon: { ...next.cannon },
      deckCannon: next.deckCannon && { ...next.deckCannon },
      buoyancy: { ...next.buoyancy },
    });
    if (this.alive) this.health = Math.min(this.stats.maxHealth, this.health + Math.max(0, healthGain));
    if (cannonsChanged) {
      this.model.setCannons(this.stats.cannonsPerSide);
      this.cannonCooldowns = this.randomCooldowns();
    }
    this.dressing.applyGunLook(this.guns);
  }

  /** Rechargements décalés : tous les canons ne partent pas à la même image. */
  private randomCooldowns(): number[] {
    return this.model.cannons.map(() => Math.random() * this.stats.cannon.reloadTime);
  }

  /** Tangage (rad, positif = proue haute) et roulis (rad, positif = bâbord haut) de la coque. */
  get pitch(): number {
    return this.buoyancy.pitch;
  }

  get roll(): number {
    return this.buoyancy.roll;
  }

  /** Vie perdue : 0 = intact, 1 = coulé. */
  get damageLevel(): number {
    return 1 - this.health / this.stats.maxHealth;
  }

  /**
   * Recul d'un coup de canon tiré vers `angle` (repère du bateau : 0 = proue, +π/2 = bâbord) : le bateau roule
   * du côté opposé (un tir à bâbord fait monter bâbord), d'autant moins qu'il est lourd.
   */
  recoil(angle: number) {
    const kick = RECOIL.rollKick * Math.pow(RECOIL.referenceMass / SHIP_TYPES[this.type].mass.base, RECOIL.massExponent);
    this.buoyancy.kick(kick * Math.sin(angle), kick * RECOIL.pitchShare * Math.cos(angle));
  }

  /** Vitesse de rotation (rad/s), positive en virant vers bâbord. */
  get yawSpeed(): number {
    return this.yawRate;
  }

  get alive(): boolean {
    return this.sinkTime === null;
  }

  /** Le naufrage est terminé : le bateau peut être retiré (ou le joueur réapparaître). */
  get sunk(): boolean {
    return this.sinkTime !== null && this.sinkTime >= COMBAT.sinkDuration;
  }

  get velocityX(): number {
    return Math.sin(this.heading) * this.speed;
  }

  get velocityZ(): number {
    return Math.cos(this.heading) * this.speed;
  }

  /** Inflige des dégâts. Renvoie true si ce coup coule le bateau. */
  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.calmTime = 0;
    this.health = Math.max(0, this.health - amount * factor(this.modifiers, 'damageTaken'));
    if (this.health > 0) return false;
    this.sinkTime = 0;
    return true;
  }

  /** Le point (x, y, z) est-il dans la coque ? Boîte orientée selon le cap. */
  containsPoint(x: number, y: number, z: number): boolean {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const forward = dx * s + dz * c;
    const side = dx * c - dz * s;
    const up = y - this.position.y;
    return Math.abs(forward) < this.stats.length / 2 && Math.abs(side) < this.stats.width / 2 + 0.15 && up > -1.2 && up < 2.2;
  }

  /** Remet le bateau à flot, intact, à la position donnée. */
  respawn(x: number, z: number) {
    this.position.set(x, 0, z);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = this.yawRate = 0;
    this.buoyancy.reset(0);
    this.health = this.stats.maxHealth;
    this.sinkTime = null;
    this.calmTime = 0;
    this.controls.sail = 0;
    this.crits.reset();
  }

  update(dt: number, waves: Waves, wind: Wind) {
    if (this.sinkTime !== null) this.sinkTime += dt;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.calmTime += dt;
    const repairing = this.alive && this.calmTime > REPAIR.delay;
    if (repairing) {
      this.health = Math.min(this.stats.maxHealth, this.health + REPAIR.rate * factor(this.modifiers, 'repair') * this.stats.maxHealth * dt);
    }
    // Avaries : l'incendie ronge la coque (sans la couler), la réparation en mer les efface peu à peu.
    const burn = this.crits.update(dt, repairing);
    if (burn > 0 && this.alive) this.health = Math.max(Math.min(this.health, CRIT.fireFloor * this.stats.maxHealth), this.health - burn * this.stats.maxHealth);
    const controls = this.alive ? this.controls : ADRIFT;
    this.updateMotion(dt, controls, wind);
    this.updateBuoyancy(dt, waves);
    this.syncModel(dt, controls, wind);
  }

  /** Distance horizontale jusqu'à un autre bateau (m). */
  distanceTo(other: Ship): number {
    return Math.hypot(other.position.x - this.position.x, other.position.z - this.position.z);
  }

  dispose() {
    this.dressing.dispose();
    this.model.dispose();
  }

  private updateMotion(dt: number, controls: ShipControls, wind: Wind) {
    const s = this.stats;
    // Voilure trouée : la vitesse max baisse avec les dégâts.
    const torn = 1 - DAMAGE.maxSpeedLoss * Math.min(1, this.damageLevel / DAMAGE.fullDamageAt);
    // Un navigateur tire plus du vent favorable et souffre moins du vent contraire.
    const w = wind.speedFactor(this.heading) - 1;
    const windEffect = 1 + w * (w > 0 ? factor(this.modifiers, 'wind') : 1 / factor(this.modifiers, 'wind'));
    const targetSpeed = s.maxSpeed * torn * this.crits.speedFactor * controls.sail * windEffect;
    const accel = targetSpeed > this.speed ? s.acceleration : s.deceleration;
    this.speed = moveTowards(this.speed, targetSpeed, accel * dt);

    this.rudder = moveTowards(this.rudder, controls.rudder, s.rudderSpeed * dt);
    // Le safran n'agit que si l'eau coule dessus : immobile, le bateau ne tourne pas du tout,
    // et la barre devient pleinement efficace à 40 % de la vitesse max.
    const steering = Math.min(1, this.speed / (0.4 * s.maxSpeed));
    // Par mer démontée, la barre est plus dure (conditions.turnFactor < 1).
    this.yawRate = damp(this.yawRate, this.rudder * s.turnRate * steering * conditions.turnFactor * this.crits.turnFactor, 3, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);

    this.position.x += this.velocityX * dt;
    this.position.z += this.velocityZ * dt;
  }

  /** La coque suit la surface de l'eau (voir Buoyancy), et s'enfonce quand le bateau coule. */
  private updateBuoyancy(dt: number, waves: Waves) {
    const sinking = this.sinkTime === null ? 0 : Math.min(1, this.sinkTime / COMBAT.sinkDuration);
    // En virage, un navire gîte vers l'extérieur.
    const heel = this.yawRate * this.speed * this.stats.turnHeel;
    this.buoyancy.update(dt, this.stats, this.position.x, this.position.z, this.heading, heel, sinking, waves);
    this.position.y = this.buoyancy.y;
  }

  private syncModel(dt: number, controls: ShipControls, wind: Wind) {
    this.sailAmount = damp(this.sailAmount, controls.sail, 1.5, dt);
    this.model.setSailAmount(this.sailAmount);
    this.model.setRudder(this.rudder);
    this.model.setDamage(Math.max(this.damageLevel, this.tattered));
    this.model.setWind(wind.direction - this.heading, wind.strength);
    this.model.animate(dt);
    this.dressing.update(dt, wind.direction - this.heading, wind.strength);
    this.model.root.position.copy(this.position);
    // Ordre YXZ : cap d'abord, puis tangage (proue haute = x négatif), puis roulis (bâbord haut = z positif).
    this.model.root.rotation.set(-this.buoyancy.pitch, this.heading, this.buoyancy.roll, 'YXZ');
  }
}
