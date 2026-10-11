import * as THREE from 'three';
import { COMBAT, FORT, LIVERIES, type Faction, type IslandId } from '../config';
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
const muzzle = new THREE.Vector3();
const velocity = new THREE.Vector3();
const centered = () => Math.random() + Math.random() - 1;

interface FortGun {
  readonly slot: GunSlot;
  readonly object: THREE.Mesh;
  /** Cap actuel du fût (rad, même convention que les bateaux). */
  yaw: number;
  cooldown: number;
}

/**
 * Fort bastionné d'un port (décor : `fortModel.ts` ; fort de la Tortue ou citadelle de Port-Sabre). Ses canons, sur
 * les bastions et les courtines côté mer, pivotent chacun dans son secteur vers l'ennemi le plus proche à portée,
 * anticipent sa trajectoire et tirent par-dessus le parapet. Les améliorations de l'île mettent en service plus de
 * canons et augmentent la portée et les dégâts (`setArmament`). Pendant un siège (mission de défense), l'enceinte
 * peut être touchée : sans vie, ses canons se taisent.
 */
export class Fort {
  readonly faction: Faction = 'player';
  readonly group: THREE.Group;
  /** Volume de l'enceinte, pour les boulets d'un siège. */
  readonly bounds: FortModel['bounds'];
  /** Cap du bastion principal (vers le large) : c'est par là qu'arrivent les assiégeants. */
  readonly facing: number;
  readonly maxHealth: number;
  health: number;
  private readonly guns: FortGun[] = [];
  private readonly flag: WavingFlag;
  private range = FORT.range;
  private damage = FORT.damage;

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
    this.facing = model.facing;
    this.maxHealth = this.health = maxHealth;
    const p = paletteFor(LIVERIES.player);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, FLAG_POLE, 5), p.dark);
    pole.position.copy(model.flagBase).setY(model.flagBase.y + FLAG_POLE / 2);
    this.flag = new WavingFlag(flagMaterialFor(LIVERIES.player), 1.8, 1.1);
    this.flag.mesh.position.copy(model.flagBase).setY(model.flagBase.y + FLAG_POLE - 0.6);
    this.group.add(pole, this.flag.mesh);

    const gunGeometry = buildCarriageGunGeometry();
    const iron = std(0x2a2a2e, { roughness: 0.5, metalness: 0.6 });
    for (const slot of model.slots) {
      const object = new THREE.Mesh(gunGeometry, iron);
      object.position.copy(slot.position);
      object.rotation.y = slot.restYaw - Math.PI / 2;
      this.group.add(object);
      this.guns.push({ slot, object, yaw: slot.restYaw, cooldown: Math.random() * FORT.reloadTime });
    }
    this.setArmament(FORT.guns, FORT.range, FORT.damage);
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
    this.health = Math.max(0, this.health - amount);
    return this.health === 0;
  }

  /** Remise en état complète (fin d'un siège). */
  restore() {
    this.health = this.maxHealth;
  }

  update(dt: number, ships: readonly Ship[], projectiles: Projectiles, effects: Effects, wind: Wind) {
    this.flag.setWind(wind.direction, wind.strength);
    this.flag.update(dt);
    // Une enceinte tombée ne tire plus.
    if (!this.alive) return;
    for (const gun of this.guns) {
      if (!gun.object.visible) continue;
      gun.cooldown = Math.max(0, gun.cooldown - dt);
      const target = this.findTarget(gun, ships);
      let desired = gun.slot.restYaw;
      let aimX = 0;
      let aimZ = 0;
      if (target) {
        // Anticipation : où sera la cible quand le boulet arrivera.
        aimX = target.position.x;
        aimZ = target.position.z;
        for (let k = 0; k < 2; k++) {
          const flight = Math.hypot(aimX - gun.object.position.x, aimZ - gun.object.position.z) / FORT.ballSpeed;
          aimX = target.position.x + target.velocityX * flight;
          aimZ = target.position.z + target.velocityZ * flight;
        }
        desired = Math.atan2(aimX - gun.object.position.x, aimZ - gun.object.position.z);
      }
      const diff = wrapAngle(desired - gun.yaw);
      gun.yaw = wrapAngle(gun.yaw + moveTowards(0, diff, FORT.turnSpeed * dt));
      gun.object.rotation.y = gun.yaw - Math.PI / 2;
      if (target && gun.cooldown === 0 && Math.abs(diff) < AIM_TOLERANCE) {
        this.fire(gun, aimX, aimZ, projectiles, effects);
        gun.cooldown = FORT.reloadTime * (0.9 + Math.random() * 0.2);
      }
    }
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
    const angle = Math.atan2(dx, dz) + centered() * FORT.spread;
    const flight = Math.hypot(dx, dz) / FORT.ballSpeed;
    // Visée au niveau moyen de la mer plutôt qu'à la hauteur instantanée de la cible : la houle s'annule en moyenne.
    const vy = (0.6 - muzzle.y + 0.5 * COMBAT.gravity * flight * flight) / flight;
    velocity.set(Math.sin(angle) * FORT.ballSpeed, vy, Math.cos(angle) * FORT.ballSpeed);
    projectiles.fire(muzzle, velocity, this, this.damage);
    effects.muzzleFlash(muzzle, Math.sin(angle), Math.cos(angle));
  }
}
