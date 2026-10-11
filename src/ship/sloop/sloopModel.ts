import * as THREE from 'three';
import { DECK_CREW, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, sternStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { TornSail } from '../parts/tornSail';
import { deckWalks, ropeSpots, type DeckPlan } from '../deckPlan';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { BOOM_Y, BOWSPRIT_TIP, DECK_Y, FLAG, MAST_Z, SLOOP_HULL, SLOOP_LENGTH, sloopTemplateFor } from './sloopTemplate';

const RUDDER_MAX_ANGLE = 0.55;
/** Allongement de la bôme et de la grand-voile par niveau de voilure (en longueur seulement : la voile ne dépasse jamais le mât). */
const SAIL_GROWTH = 0.08;
/** Zone des canons sur affût le long du bord (z, de l'arrière vers l'avant) : ils y sont répartis régulièrement. */
const GUN_ZONE = { aft: -3, fore: 1.8 };
/** Retrait de l'affût par rapport au bordé : la bouche du fût dépasse d'environ 40 cm hors de la coque. */
const GUN_INSET = 0.62;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
const { damp } = THREE.MathUtils;

/**
 * Sloop : un mât, grand-voile aurique sur bôme et foc sur beaupré, pont fermé, canons sur affût.
 * Le gréement pivote autour du mât pour se placer sous le vent, comme un vrai voilier.
 */
export class SloopModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 13.8;
  readonly waterline = SLOOP_HULL.waterlineProfile();
  /** Pont de l'équipage animé : barreur derrière la cabine, vigie à l'avant, promenades entre la caisse et les tonneaux. */
  readonly deckPlan: DeckPlan = {
    hands: DECK_CREW.hands.sloop,
    helm: { x: 0.35, y: DECK_Y, z: -5, facing: 0 },
    lookout: { x: 0, y: DECK_Y, z: 4.3, facing: 0 },
    walks: deckWalks(DECK_Y, [0.55, -0.55], -1.8, 2.2),
    ropes: ropeSpots(DECK_Y, [MAST_Z], (z) => SLOOP_HULL.stationAt(z / SLOOP_HULL.halfLength).halfWidth, 0.45),
    isOpenGun: () => true,
  };
  readonly flagMount: FlagMount = { position: new THREE.Vector3(0, FLAG.y, MAST_Z), length: FLAG.length, height: FLAG.height };
  readonly ensignStaff: EnsignStaff = sternStaff(SLOOP_HULL.stationAt(-1), 0.9);
  // Sur le pont, autour de la cabine et du mât, et deux brèches dans le bordé.
  readonly fireSpots = fireSpots(SLOOP_HULL, [
    [-0.7, 0.3, DECK_Y],
    [-0.2, -0.4, DECK_Y],
    [0.45, 0.3, DECK_Y],
    [0.75, -0.2, DECK_Y],
    [0.1, 1, 0.45],
    [-0.5, -1, 0.45],
  ]);
  private readonly tornSail: TornSail;
  /** Gréement aurique (bôme, grand-voile, corne), qui tourne autour du mât. */
  private readonly rig = new THREE.Group();
  /** Partie hissée (grand-voile + corne) : on l'écrase vers la bôme pour carguer. */
  private readonly hoist = new THREE.Group();
  private readonly jib: THREE.Mesh;
  private readonly rudder: THREE.Mesh;
  private readonly flag: WavingFlag;
  private readonly cannonGeometry: THREE.BufferGeometry;
  private readonly gunportGeometry: THREE.BufferGeometry;
  private readonly cannonMaterial: THREE.Material;
  private readonly gunportMaterial: THREE.Material;
  private readonly gunports: THREE.Mesh[] = [];
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord (où la bôme est poussée). */
  private leeSide = 1;
  private boomTarget = 0;

  constructor(stats: ShipStats, livery: Livery) {
    const t = sloopTemplateFor(livery);
    this.tornSail = new TornSail(t.sailMaterial, livery.sailEmblem);
    this.cannonGeometry = t.cannon;
    this.gunportGeometry = t.gunport;
    this.cannonMaterial = t.palette.metal;
    this.gunportMaterial = t.palette.dark;
    for (const { geometry, material } of t.statics) this.root.add(new THREE.Mesh(geometry, material));

    this.hoist.add(new THREE.Mesh(t.mainSail, this.tornSail.material(t.mainSail, 'x', true)), new THREE.Mesh(t.gaff, t.palette.wood));
    if (t.patchMaterial) this.hoist.add(new THREE.Mesh(t.patches, this.tornSail.patchMaterial(t.patchMaterial, t.mainSail, 'x')));
    this.rig.add(new THREE.Mesh(t.boom, t.palette.wood), this.hoist, new THREE.LineSegments(t.rigLines, riggingMaterial));
    this.rig.position.set(0, BOOM_Y, MAST_Z);

    this.jib = new THREE.Mesh(t.jib, this.tornSail.material(t.jib, 'x'));
    this.jib.position.copy(BOWSPRIT_TIP);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.9, SLOOP_HULL.stationAt(-1).z - 0.04);

    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, FLAG.y, MAST_Z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.root.add(this.rig, this.jib, this.rudder, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.setCannons(stats.cannonsPerSide);
    this.applySails();

    this.root.scale.setScalar(stats.length / SLOOP_LENGTH);
  }

  setSailAmount(amount: number) {
    this.sailAmount = amount;
    this.tornSail.setDeployment(amount);
    this.applySails();
  }

  setSailLevel(level: number) {
    this.sailLevel = level;
    this.applySails();
  }

  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
  }

  /**
   * La bôme part du côté où va le vent : presque dans l'axe au près (vent de face),
   * largement ouverte au vent arrière.
   */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, la bôme ne passe pas d'un bord à l'autre sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = 0.12 + 1.15 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.boomTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    if (this.armor) this.root.remove(this.armor);
    this.armor = null;
    const armor = armorFor(SLOOP_HULL, level);
    if (armor) this.root.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons sur affût, sur le pont, tirant par des sabords répartis le long de chaque bord. */
  setCannons(perSide: number) {
    for (const { object } of this.cannons) this.root.remove(object);
    for (const port of this.gunports) this.root.remove(port);
    this.cannons.length = 0;
    this.gunports.length = 0;
    for (let i = 0; i < perSide; i++) {
      const z = perSide === 1 ? 0 : THREE.MathUtils.lerp(GUN_ZONE.aft, GUN_ZONE.fore, i / (perSide - 1));
      const s = SLOOP_HULL.stationAt(z / SLOOP_HULL.halfLength);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(this.cannonGeometry, this.cannonMaterial);
        cannon.position.set(side * (s.halfWidth - GUN_INSET), DECK_Y, s.z);
        const port = new THREE.Mesh(this.gunportGeometry, this.gunportMaterial);
        port.position.set(side * (s.halfWidth + 0.02), DECK_Y + 0.4, s.z);
        this.root.add(cannon, port);
        this.gunports.push(port);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
    this.rig.rotation.y = damp(this.rig.rotation.y, this.boomTarget, 1.2, dt);
    this.hoist.scale.x = this.leeSide;
    this.jib.scale.x = Math.abs(this.jib.scale.x) * this.leeSide;
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

  /** Voiles hissées (cran de voile) et agrandies (niveau de voilure). */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    this.rig.scale.z = 1 + SAIL_GROWTH * this.sailLevel;
    this.hoist.scale.set(this.leeSide, hoisted, 1);
    // Le foc garde sa taille : il est tendu entre le haut du mât et le beaupré.
    const jib = 0.15 + 0.85 * this.sailAmount;
    this.jib.scale.set(jib * this.leeSide, jib, jib);
  }
}
