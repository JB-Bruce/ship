import * as THREE from 'three';
import type { Livery, ShipStats } from '../../config';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, sternStaff, waterMaskMaterial, WavingFlag } from '../parts/common';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { BOW_GUN_U, FLAG, FLOOR_Y, ROWBOAT_HULL, ROWBOAT_LENGTH, ROWER_BENCHES_U, rowboatTemplateFor } from './rowboatTemplate';

const RUDDER_MAX_ANGLE = 0.6;
const MUZZLE = new THREE.Vector3(0.75, 0.1, 0);
/** Cadence de nage à plein effort (coups d'aviron par seconde). */
const STROKE_RATE = 0.85;
/** Amplitude du balayage des avirons (rad) et inclinaison pelle dans l'eau / hors de l'eau. */
const SWEEP = 0.45;
const DIP = { water: -0.3, air: -0.04, rest: -0.08 };
const { damp } = THREE.MathUtils;

interface Oar {
  pivot: THREE.Object3D;
  side: 1 | -1;
  sweep: number;
  lift: number;
}

/**
 * Barque à rames (ennemis seulement) : pas de voile, quatre rameurs dont les avirons battent
 * au rythme de l'effort (la « jauge de voile » sert ici de cadence de nage), un pierrier à l'avant.
 */
export class RowboatModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 3.4;
  readonly waterline = ROWBOAT_HULL.waterlineProfile();
  readonly flagMount: FlagMount = { position: new THREE.Vector3(0, FLAG.y, ROWBOAT_HULL.stationAt(-1).z + 0.05), length: FLAG.length, height: FLAG.height };
  readonly ensignStaff: EnsignStaff = sternStaff(ROWBOAT_HULL.stationAt(-1), 0.5);
  // Fond de la barque et une brèche dans le bordé.
  readonly fireSpots = fireSpots(ROWBOAT_HULL, [
    [-0.5, 0.2, FLOOR_Y + 0.15],
    [0.3, -0.3, FLOOR_Y + 0.15],
    [0, 1, 0.25],
  ]);
  private readonly rudder: THREE.Mesh;
  private readonly flag: WavingFlag;
  private readonly oars: Oar[] = [];
  private readonly cannonGeometry: THREE.BufferGeometry;
  private readonly cannonMaterial: THREE.Material;
  private armor: THREE.Mesh | null = null;
  /** Effort de nage 0..1 et phase du coup d'aviron (rad). */
  private effort = 0;
  private stroke = Math.random() * Math.PI * 2;

  constructor(stats: ShipStats, livery: Livery) {
    const t = rowboatTemplateFor(livery);
    this.cannonGeometry = t.cannon;
    this.cannonMaterial = t.palette.metal;
    for (const { geometry, material } of t.statics) this.root.add(new THREE.Mesh(geometry, material));

    for (const u of ROWER_BENCHES_U) {
      const s = ROWBOAT_HULL.stationAt(u);
      for (const side of [1, -1] as const) {
        const pivot = new THREE.Mesh(t.oar, t.palette.wood);
        pivot.position.set(side * (s.halfWidth - 0.02), s.gunwale + 0.08, s.z + 0.32);
        this.root.add(pivot);
        this.oars.push({ pivot, side, sweep: 0, lift: DIP.rest });
      }
    }

    const stern = ROWBOAT_HULL.stationAt(-1);
    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.28, stern.z - 0.03);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, FLAG.y, stern.z + 0.05);
    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.root.add(this.rudder, this.flag.mesh, waterMask);
    this.setCannons(stats.cannonsPerSide);

    this.root.scale.setScalar(stats.length / ROWBOAT_LENGTH);
  }

  /** Pas de voile : la jauge règle l'effort des rameurs. */
  setSailAmount(amount: number) {
    this.effort = amount;
  }

  setSailLevel(_level: number) {}

  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
  }

  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
  }

  setArmorLevel(level: number) {
    if (this.armor) this.root.remove(this.armor);
    this.armor = null;
    const armor = armorFor(ROWBOAT_HULL, level);
    if (armor) this.root.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Pierrier(s) à l'avant, tirant vers la proue. */
  setCannons(count: number) {
    for (const { object } of this.cannons) this.root.remove(object);
    this.cannons.length = 0;
    const s = ROWBOAT_HULL.stationAt(BOW_GUN_U);
    for (let i = 0; i < count; i++) {
      const cannon = new THREE.Mesh(this.cannonGeometry, this.cannonMaterial);
      const x = count === 1 ? 0 : THREE.MathUtils.lerp(-0.2, 0.2, i / (count - 1));
      cannon.position.set(x, s.gunwale + 0.14, s.z);
      this.root.add(cannon);
      this.cannons.push(cannonMount(cannon, 0, MUZZLE));
    }
  }

  /**
   * Coup d'aviron : la pelle plonge et balaie vers l'arrière (propulsion), puis remonte et revient.
   * À l'arrêt, les avirons se posent à l'horizontale, pelles hors de l'eau.
   */
  animate(dt: number) {
    this.flag.update(dt);
    const rowing = this.effort > 0.05;
    this.stroke += dt * Math.PI * 2 * STROKE_RATE * this.effort;
    const sweep = rowing ? -Math.cos(this.stroke) * SWEEP : 0;
    const lift = rowing ? (Math.sin(this.stroke) > 0 ? DIP.water : DIP.air) : DIP.rest;
    for (const oar of this.oars) {
      oar.sweep = damp(oar.sweep, sweep, 10, dt);
      oar.lift = damp(oar.lift, lift, 8, dt);
      // Bâbord : l'aviron pointe vers +X. Tribord : retourné (π), balayage inversé pour rester symétrique.
      const yaw = oar.side === 1 ? oar.sweep : Math.PI - oar.sweep;
      oar.pivot.rotation.set(0, yaw, oar.lift);
    }
  }

  /** Pas de voile à trouer. */
  setFlagLift(lift: number) {
    this.flag.mesh.position.y = this.flagMount.position.y + lift;
  }

  setDamage() {}

  dispose() {
    this.flag.dispose();
  }
}
