import * as THREE from 'three';
import { COMBAT, FORT, FORT_FX, LIVERIES, type Faction, type IslandId } from '../config';
import { aimSpot, distanceSpread, newAimPoint, pickAimPoint, type AimPoint } from '../combat/aimSpread';
import type { Projectiles } from '../combat/projectiles';
import type { Effects } from '../fx/effects';
import { flagMaterialFor, paletteFor, std, WavingFlag } from '../ship/parts/common';
import { buildCarriageGunGeometry } from '../ship/parts/props';
import { isHostile, type Ship } from '../ship/ship';
import { moveTowards, wrapAngle } from '../utils/math';
import { buildFort, type FortLayout, type FortModel, type GunSlot } from './fortModel';
import type { Wind } from './wind';
import { conditions } from './weather';

const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Écart toléré entre le canon et la visée pour tirer (rad). */
const AIM_TOLERANCE = 0.04;
/** Hauteur du mât du pavillon sur la tour de guet (m). */
const FLAG_POLE = 5;
/** Les assiégeants visent l'enceinte à cette hauteur sous son terre-plein (m) : plus bas, un fort perché sur une falaise ne prendrait que des coups dans la roche. */
const AIM_BELOW_RAMPART = 1;
const muzzle = new THREE.Vector3();
const velocity = new THREE.Vector3();
const spot = new THREE.Vector3();
const aimed = { x: 0, z: 0 };
const centered = () => Math.random() + Math.random() - 1;

interface FortGun {
  readonly slot: GunSlot;
  readonly object: THREE.Mesh;
  /** Cap actuel du fût (rad, même convention que les bateaux). */
  yaw: number;
  cooldown: number;
  /** Point visé sur sa cible, tiré à nouveau à chaque coup. */
  readonly aim: AimPoint;
}

/**
 * Fort bastionné d'un port (décor : `fortModel.ts` ; fort de la Tortue ou citadelle de Port-Sabre). Ses canons, sur
 * les bastions et les courtines côté mer, pivotent chacun dans son secteur vers l'ennemi le plus proche à portée,
 * anticipent sa trajectoire et tirent par-dessus le parapet. Les améliorations de l'île mettent en service plus de
 * canons et augmentent la portée et les dégâts (`setArmament`). Pendant un siège (mission de défense), l'enceinte
 * peut être touchée : sans vie, ses canons se taisent. Un fort de la Marine (Fort-Royal) est du camp ennemi jusqu'à
 * ce que tu prennes l'île (`setFaction`) : il tire sur ta flotte, tes boulets le touchent, et il se répare si on le
 * laisse en paix (`regen`). Abîmé, il fume ; tombé, il brûle.
 */
export class Fort {
  faction: Faction = 'player';
  /** Réparation d'un fort de la Marine : délai sans être touché (s), puis part de sa vie rendue par seconde ; null = aucune. */
  regen: { delay: number; rate: number } | null = null;
  /** Temps depuis le dernier coup reçu (s). */
  sinceHit = Infinity;
  readonly group: THREE.Group;
  /** Volume de l'enceinte, pour les boulets d'un siège. */
  readonly bounds: FortModel['bounds'];
  /** Point que visent les assiégeants : le centre de l'enceinte, juste sous le parapet. */
  readonly aim: THREE.Vector3;
  /** Cap du bastion principal (vers le large) : c'est par là qu'arrivent les assiégeants. */
  readonly facing: number;
  readonly maxHealth: number;
  health: number;
  private readonly guns: FortGun[] = [];
  private readonly flag: WavingFlag;
  private range = FORT.range;
  private damage = FORT.damage;
  /** Foyers de fumée et d'incendie (haut de la tour, deux barbettes), et accumulateurs d'émission. */
  private readonly fireSpots: THREE.Vector3[];
  private readonly emit = { smoke: 0, flame: 0, ember: 0 };
  /** Debout à l'image précédente (pour l'explosion de sa chute). */
  private standing = true;

  /** `facing` : cap du bastion principal (par défaut, vers le large le plus proche). */
  constructor(
    readonly island: IslandId,
    spot: { x: number; z: number },
    layout: FortLayout,
    maxHealth: number,
    facing?: number,
  ) {
    const model = buildFort(spot.x, spot.z, layout, facing);
    this.group = model.group;
    this.bounds = model.bounds;
    this.aim = new THREE.Vector3(model.bounds.x, model.bounds.rampart - AIM_BELOW_RAMPART, model.bounds.z);
    this.facing = model.facing;
    this.maxHealth = this.health = maxHealth;
    const p = paletteFor(LIVERIES.player);
    const k = model.flagScale;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * k, 0.1 * k, FLAG_POLE * k, 5), p.dark);
    pole.position.copy(model.flagBase).setY(model.flagBase.y + (FLAG_POLE * k) / 2);
    this.flag = new WavingFlag(flagMaterialFor(LIVERIES.player), 1.8 * k, 1.1 * k);
    this.flag.mesh.position.copy(model.flagBase).setY(model.flagBase.y + (FLAG_POLE - 0.6) * k);
    this.group.add(pole, this.flag.mesh);

    const gunGeometry = buildCarriageGunGeometry();
    const iron = std(0x2a2a2e, { roughness: 0.5, metalness: 0.6 });
    for (const slot of model.slots) {
      const object = new THREE.Mesh(gunGeometry, iron);
      object.position.copy(slot.position);
      object.rotation.y = slot.restYaw - Math.PI / 2;
      this.group.add(object);
      this.guns.push({ slot, object, yaw: slot.restYaw, cooldown: Math.random() * FORT.reloadTime, aim: newAimPoint() });
    }
    this.setArmament(FORT.guns, FORT.range, FORT.damage);
    const slots = model.slots;
    this.fireSpots = [model.flagBase.clone(), slots[1 % slots.length].position.clone(), slots[slots.length - 1].position.clone()];
  }

  /** Change de camp (île prise ou reprise) : le pavillon suit. */
  setFaction(faction: Faction) {
    this.faction = faction;
    this.flag.mesh.material = flagMaterialFor(LIVERIES[faction]);
  }

  /** Nombre de canons en service (dans l'ordre des emplacements), portée (m) et dégâts d'un boulet. */
  setArmament(guns: number, range: number, damage: number) {
    this.range = range;
    this.damage = damage;
    this.guns.forEach((gun, i) => (gun.object.visible = gun.slot.barbette.visible = i < guns));
  }

  /** L'enceinte tient encore (sa vie ne baisse que pendant un siège). */
  get alive(): boolean {
    return this.health > 0;
  }

  /** Le point (x, y, z) est-il dans l'enceinte ? Cylindre approximatif. */
  containsPoint(x: number, y: number, z: number): boolean {
    const b = this.bounds;
    return y > b.bottom && y < b.top && Math.hypot(x - b.x, z - b.z) < b.radius;
  }

  /** Inflige des dégâts à l'enceinte. Renvoie true si ce coup la fait tomber. */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.sinceHit = 0;
    this.health = Math.max(0, this.health - amount);
    return this.health === 0;
  }

  /** Remise en état complète (fin d'un siège). */
  restore() {
    this.setHealthShare(1);
  }

  /** Vie rétablie à cette part du maximum (chargement d'une partie), sans explosion s'il est à terre. */
  setHealthShare(share: number) {
    this.health = this.maxHealth * share;
    this.standing = this.alive;
  }

  update(dt: number, ships: readonly Ship[], projectiles: Projectiles, effects: Effects, wind: Wind) {
    this.flag.setWind(wind.direction, wind.strength);
    this.flag.update(dt);
    this.sinceHit += dt;
    this.updateDamage(dt, effects);
    // Une enceinte tombée ne tire plus.
    if (!this.alive) return;
    const r = this.regen;
    if (r && this.sinceHit > r.delay) this.health = Math.min(this.maxHealth, this.health + r.rate * this.maxHealth * dt);
    for (const gun of this.guns) {
      if (!gun.object.visible) continue;
      gun.cooldown = Math.max(0, gun.cooldown - dt);
      const target = this.findTarget(gun, ships);
      let desired = gun.slot.restYaw;
      let aimX = 0;
      let aimZ = 0;
      if (target) {
        // Anticipation : où sera le point visé sur la cible quand le boulet arrivera.
        if (gun.aim.target !== target) pickAimPoint(gun.aim, target);
        aimSpot(gun.aim, target, aimed);
        aimX = aimed.x;
        aimZ = aimed.z;
        for (let k = 0; k < 2; k++) {
          const flight = Math.hypot(aimX - gun.object.position.x, aimZ - gun.object.position.z) / FORT.ballSpeed;
          aimX = aimed.x + target.velocityX * flight;
          aimZ = aimed.z + target.velocityZ * flight;
        }
        desired = Math.atan2(aimX - gun.object.position.x, aimZ - gun.object.position.z);
      } else gun.aim.target = null;
      const diff = wrapAngle(desired - gun.yaw);
      gun.yaw = wrapAngle(gun.yaw + moveTowards(0, diff, FORT.turnSpeed * dt));
      gun.object.rotation.y = gun.yaw - Math.PI / 2;
      if (target && gun.cooldown === 0 && Math.abs(diff) < AIM_TOLERANCE) {
        this.fire(gun, aimX, aimZ, projectiles, effects);
        gun.cooldown = FORT.reloadTime * (0.9 + Math.random() * 0.2);
        pickAimPoint(gun.aim, target);
      }
    }
  }

  /** Fumée sous FORT_FX.smokeBelow de sa vie ; quand il tombe, une explosion, puis l'incendie tant qu'il est à terre. */
  private updateDamage(dt: number, effects: Effects) {
    const fx = FORT_FX;
    if (this.standing && !this.alive) {
      this.standing = false;
      effects.explosion(this.fireSpots[0], fx.fallScale);
    }
    const share = this.health / this.maxHealth;
    if (share >= fx.smokeBelow) return;
    const spots = this.fireSpots;
    for (this.emit.smoke += dt * fx.smokeRate * (this.alive ? 1 : spots.length); this.emit.smoke >= 1; this.emit.smoke--) {
      effects.plume(spot.copy(spots[Math.floor(Math.random() * spots.length)]), 1.6);
    }
    if (this.alive) return;
    for (this.emit.flame += dt * fx.flameRate; this.emit.flame >= 1; this.emit.flame--) effects.flame(spot.copy(spots[Math.floor(Math.random() * spots.length)]));
    for (this.emit.ember += dt * fx.emberRate; this.emit.ember >= 1; this.emit.ember--) effects.ember(spot.copy(spots[Math.floor(Math.random() * spots.length)]));
  }

  /** L'ennemi à flot le plus proche de ce canon, à portée et dans son secteur de tir (vers le large). */
  private findTarget(gun: FortGun, ships: readonly Ship[]): Ship | null {
    let best: Ship | null = null;
    let bestDistance = this.range * conditions.rangeFactor;
    const { x, z } = gun.slot.position;
    for (const ship of ships) {
      if (!ship.alive || !isHostile(this, ship)) continue;
      const d = Math.hypot(ship.position.x - x, ship.position.z - z);
      if (d >= bestDistance) continue;
      const bearing = Math.atan2(ship.position.x - x, ship.position.z - z);
      if (Math.abs(wrapAngle(bearing - gun.slot.restYaw)) > FORT.arcHalfAngle) continue;
      best = ship;
      bestDistance = d;
    }
    return best;
  }

  private fire(gun: FortGun, aimX: number, aimZ: number, projectiles: Projectiles, effects: Effects) {
    gun.object.updateMatrixWorld();
    gun.object.localToWorld(muzzle.copy(MUZZLE));
    const dx = aimX - muzzle.x;
    const dz = aimZ - muzzle.z;
    const distance = Math.hypot(dx, dz);
    // Imprécision qui grandit avec la distance, comme sur les navires.
    const angle = Math.atan2(dx, dz) + centered() * FORT.spread * distanceSpread(distance, this.range * conditions.rangeFactor);
    const flight = distance / FORT.ballSpeed;
    // Hauteur visée au-dessus du niveau moyen de la mer plutôt que de la hauteur instantanée de la cible : la houle s'annule en moyenne.
    const vy = (gun.aim.height - muzzle.y + 0.5 * COMBAT.gravity * flight * flight) / flight;
    velocity.set(Math.sin(angle) * FORT.ballSpeed, vy, Math.cos(angle) * FORT.ballSpeed);
    projectiles.fire(muzzle, velocity, this, this.damage);
    effects.muzzleFlash(muzzle, Math.sin(angle), Math.cos(angle));
  }
}
