import * as THREE from 'three';
import type { Waterline } from '../parts/hullShape';
import { FIRESHIP, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { DECK_Y, fireshipLayout, type FireshipLayout } from './fireshipLayout';
import { FLAG, fireshipTemplateFor } from './fireshipTemplate';

const RUDDER_MAX_ANGLE = 0.5;
/** Élargissement des voiles carrées par niveau de voilure. */
const SAIL_GROWTH = 0.05;
const { damp } = THREE.MathUtils;
/** Le feu vert : une seule matière sans lumière (jamais délavée par l'allure des maudits), deux teintes. */
const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const FLAME_COLORS = [new THREE.Color(FIRESHIP.flame.color), new THREE.Color(FIRESHIP.flame.core)];
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const place = new THREE.Vector3();

/** Une flamme : sa place sur un tas de tonneaux, sa phase et sa largeur. */
interface Flame {
  x: number;
  y: number;
  z: number;
  phase: number;
  width: number;
}

/**
 * Brûlot (navire maudit) : vieille coque ventrue, pont chargé de tonneaux de poudre et de fagots où couve un feu vert
 * qui vacille, aucun canon ; un mât à basse voile et hunier, foc sur le beaupré, grappins pendus aux bouts de la grande
 * vergue et du beaupré. Grand brûlot (setExtension) : reconstruit sur la coque rallongée, avec un petit artimon à voile
 * aurique qui pivote selon le vent, et plus de poudre. L'explosion elle-même est dans combat/fireships.ts.
 */
export class FireshipModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 18;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: FireshipLayout;
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private sails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private jib!: THREE.Mesh;
  /** Gréement aurique de l'artimon (grand brûlot) : il pivote autour du mât ; `hoist` porte la voile et la corne. */
  private spankerRig: THREE.Group | null = null;
  private hoist: THREE.Group | null = null;
  private flames!: THREE.InstancedMesh;
  private flameSpots: Flame[] = [];
  private time = 0;
  private rudder!: THREE.Mesh;
  private flag!: WavingFlag;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  private leeSide = 1;
  private boomTarget = 0;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;

  constructor(
    _stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.root.add(this.body);
    this.build(fireshipLayout(0));
  }

  /** Grand brûlot (1) : reconstruit le navire. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = fireshipLayout(level);
    if (layout === this.layout) return false;
    this.disposeParts();
    this.build(layout);
    return true;
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

  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    this.boomTarget = -this.leeSide * (0.12 + 1 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI));
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Aucun canon : toute la cale est une charge. */
  setCannons() {}

  animate(dt: number) {
    this.time += dt;
    this.flag.update(dt);
    this.jib.scale.x = Math.abs(this.jib.scale.x) * this.leeSide;
    if (this.spankerRig && this.hoist) {
      this.spankerRig.rotation.y = damp(this.spankerRig.rotation.y, this.boomTarget, 1.2, dt);
      this.hoist.scale.x = this.leeSide;
    }
    this.writeFlames();
  }

  setFlagLift(lift: number) {
    this.flagLift = lift;
    this.flag.mesh.position.y = this.flagMount.position.y + lift;
  }

  setDamage(damage: number) {
    this.damage = damage;
    this.tornSail.setDamage(damage);
  }

  dispose() {
    this.disposeParts();
  }

  private build(L: FireshipLayout) {
    this.layout = L;
    const t = fireshipTemplateFor(L, this.livery);
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    const main = L.mainMast;
    this.flagMount = { position: new THREE.Vector3(0, main.top - 0.2, main.z), length: FLAG.length, height: FLAG.height };
    this.ensignStaff = mastheadStaff(main.z, main.top + 0.4);
    this.fireSpots = fireSpots(L.hull, ([[-0.6, 0.3], [-0.25, -0.35], [0.3, 0.3], [0.6, -0.3]] as const).map(([u, side]) => [L.base(u), side, DECK_Y] as const));
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lanterns = addStatics(this.body, t.statics);

    this.sails = [];
    this.yards = [];
    L.squareSails.forEach((s, i) => {
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(t.squareSails[i], 'z', i === 0));
      sail.position.set(0, s.yardY, s.mastZ + 0.26);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.13);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    this.jib = new THREE.Mesh(t.jib, this.tornSail.material(t.jib, 'x'));
    this.jib.position.copy(L.jib.tack);
    this.body.add(this.jib);

    this.spankerRig = this.hoist = null;
    if (L.mizzen && t.spanker && t.boom && t.gaff) {
      this.hoist = new THREE.Group();
      this.hoist.add(new THREE.Mesh(t.spanker, this.tornSail.material(t.spanker, 'x')), new THREE.Mesh(t.gaff, t.palette.wood));
      this.spankerRig = new THREE.Group();
      this.spankerRig.add(new THREE.Mesh(t.boom, t.palette.wood), this.hoist);
      this.spankerRig.position.set(0, L.mizzen.boomY, L.mizzen.z);
      this.spankerRig.rotation.y = this.boomTarget;
      this.body.add(this.spankerRig);
    }

    // Le feu vert sur chaque tas de tonneaux : quelques flammes, chacune avec sa phase.
    this.flameSpots = L.kegs.flatMap((keg, k) =>
      Array.from({ length: FIRESHIP.flame.perKeg }, (_, i) => ({
        x: keg.x + (i - (FIRESHIP.flame.perKeg - 1) / 2) * 0.32,
        y: DECK_Y + 0.95,
        z: keg.z + (i % 2 ? 0.16 : -0.12),
        phase: k * 1.7 + i * 2.3,
        width: FIRESHIP.flame.width * (0.8 + 0.4 * ((k + i) % 2)),
      })),
    );
    this.flames = new THREE.InstancedMesh(t.flame, flameMaterial, this.flameSpots.length);
    this.flames.frustumCulled = false;
    this.flameSpots.forEach((_, i) => this.flames.setColorAt(i, FLAME_COLORS[i % 2]));
    this.writeFlames();

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.9, L.hull.stationAt(-1).z - 0.04);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, this.flagMount.position.y + this.flagLift, this.flagMount.position.z);
    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.flames, this.rudder, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.tornSail.setDeployment(this.sailAmount);
    this.applySails();
  }

  /** Flammes qui vacillent : hauteur et largeur qui ondulent, chacune à son rythme. */
  private writeFlames() {
    const [low, high] = FIRESHIP.flame.height;
    const f = FIRESHIP.flame.flicker;
    for (let i = 0; i < this.flameSpots.length; i++) {
      const spot = this.flameSpots[i];
      const wave = 0.5 + 0.25 * Math.sin(this.time * f + spot.phase) + 0.25 * Math.sin(this.time * f * 1.7 + spot.phase * 2.1);
      const h = low + (high - low) * wave;
      scale.set(spot.width * (1.1 - 0.3 * wave), h, spot.width * (1.1 - 0.3 * wave));
      matrix.compose(place.set(spot.x, spot.y, spot.z), quaternion, scale);
      this.flames.setMatrixAt(i, matrix);
    }
    this.flames.instanceMatrix.needsUpdate = true;
  }

  private disposeParts() {
    this.flag.dispose();
    this.tornSail.dispose();
    this.flames.dispose();
    this.body.clear();
    this.sails = [];
    this.yards = [];
  }

  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    const width = 1 + SAIL_GROWTH * this.sailLevel;
    for (const sail of this.sails) sail.scale.set(width, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = width;
    const jib = 0.15 + 0.85 * this.sailAmount;
    this.jib.scale.set(jib * this.leeSide, jib, jib);
    this.hoist?.scale.set(this.leeSide, hoisted, 1);
  }
}
