import * as THREE from 'three';
import type { Livery, ShipStats } from '../../config';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, sternStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { FLAG, FLOOR_Y, LONGBOAT_HULL, LONGBOAT_LENGTH, longboatTemplateFor, MAST_U, SAIL } from './longboatTemplate';

/** Angle max du safran (rad). */
const RUDDER_MAX_ANGLE = 0.6;
/** Élargissement de la voile par niveau de voilure (surtout en largeur, un peu en hauteur). */
const SAIL_GROWTH = { x: 0.12, y: 0.03 };
const MUZZLE = new THREE.Vector3(0.75, 0.1, 0);

/**
 * Chaloupe low-poly détaillée. Les pièces fixes sont partagées entre toutes les chaloupes d'un camp ;
 * seules la voile, la vergue, le gouvernail, les canons et le pavillon sont propres à chaque instance.
 * Repère : proue +Z, bâbord +X, ligne de flottaison y = 0.
 */
export class LongboatModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 7.6;
  readonly waterline = LONGBOAT_HULL.waterlineProfile();
  readonly flagMount: FlagMount = { position: new THREE.Vector3(0, FLAG.y, LONGBOAT_HULL.stationAt(MAST_U).z), length: FLAG.length, height: FLAG.height };
  readonly ensignStaff: EnsignStaff = sternStaff(LONGBOAT_HULL.stationAt(-1), 0.9);
  // Fond de la chaloupe entre les bancs, et deux brèches dans le bordé.
  readonly lanterns: LanternSpot[];
  readonly fireSpots = fireSpots(LONGBOAT_HULL, [
    [-0.6, 0.3, FLOOR_Y + 0.15],
    [0.3, -0.35, FLOOR_Y + 0.15],
    [0, 0.4, FLOOR_Y + 0.15],
    [-0.2, 1, 0.3],
    [0.45, -1, 0.3],
  ]);
  private readonly tornSail: TornSail;
  private readonly sail: THREE.Mesh;
  private readonly yard: THREE.Mesh;
  private readonly rudder: THREE.Mesh;
  private readonly flag: WavingFlag;
  private readonly cannonGeometry: THREE.BufferGeometry;
  private readonly cannonMaterial: THREE.Material;
  private armor: THREE.Mesh | null = null;
  private sailScale = { x: 1, y: 1 };
  private sailAmount = 0;

  constructor(stats: ShipStats, livery: Livery) {
    const t = longboatTemplateFor(livery);
    this.tornSail = new TornSail(t.sailMaterial, livery.sailEmblem);
    this.cannonGeometry = t.cannon;
    this.cannonMaterial = t.palette.metal;
    this.lanterns = addStatics(this.root, t.statics);

    const mastZ = LONGBOAT_HULL.stationAt(MAST_U).z;
    this.sail = new THREE.Mesh(t.sail, this.tornSail.material(t.sail, 'z', true));
    this.sail.position.set(0, SAIL.yardY, mastZ + 0.14);
    if (t.patches) this.sail.add(new THREE.Mesh(t.patches.geometry, this.tornSail.patchMaterial(t.patches.material, t.sail, 'z')));
    this.yard = new THREE.Mesh(t.yard, t.palette.wood);
    this.yard.position.set(0, SAIL.yardY, mastZ + 0.08);

    const stern = LONGBOAT_HULL.stationAt(-1);
    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.4, stern.z - 0.04);

    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, FLAG.y, mastZ);

    const rigging = new THREE.LineSegments(t.rigging, riggingMaterial);
    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.root.add(this.sail, this.yard, this.rudder, this.flag.mesh, rigging, waterMask);
    this.setCannons(stats.cannonsPerSide);

    this.root.scale.setScalar(stats.length / LONGBOAT_LENGTH);
  }

  setSailAmount(amount: number) {
    this.sailAmount = amount;
    this.tornSail.setDeployment(amount);
    this.sail.scale.set(this.sailScale.x, this.sailScale.y * (0.1 + 0.9 * amount), 1);
  }

  setSailLevel(level: number) {
    this.sailScale = { x: 1 + SAIL_GROWTH.x * level, y: 1 + SAIL_GROWTH.y * level };
    this.yard.scale.x = this.sailScale.x;
    this.setSailAmount(this.sailAmount);
  }

  /** Le safran part du côté du virage, la barre franche à l'opposé. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
  }

  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
  }

  setArmorLevel(level: number) {
    if (this.armor) this.root.remove(this.armor);
    this.armor = null;
    const armor = armorFor(LONGBOAT_HULL, level);
    if (armor) this.root.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Pierriers sur le plat-bord, répartis le long de la coque. */
  setCannons(perSide: number) {
    for (const { object } of this.cannons) this.root.remove(object);
    this.cannons.length = 0;
    for (let i = 0; i < perSide; i++) {
      const u = perSide === 1 ? 0.02 : THREE.MathUtils.lerp(-0.3, 0.3, i / (perSide - 1));
      const s = LONGBOAT_HULL.stationAt(u);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(this.cannonGeometry, this.cannonMaterial);
        cannon.position.set(side * (s.halfWidth - 0.04), s.gunwale + 0.14, s.z);
        this.root.add(cannon);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
  }

  setFlagLift(lift: number) {
    this.flag.mesh.position.y = this.flagMount.position.y + lift;
  }

  setDamage(damage: number) {
    this.tornSail.setDamage(damage);
  }

  dispose() {
    this.flag.dispose();
    this.tornSail.dispose();
  }
}
