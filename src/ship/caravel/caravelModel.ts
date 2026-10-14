import * as THREE from 'three';
import { SAIL_BILLOW, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import {
  CARAVEL_DECK,
  CARAVEL_HULL as hull,
  CARAVEL_LENGTH,
  CHASE_PORT,
  DECK_Y,
  FLAG,
  FORECASTLE,
  GUN_ZONE,
  MAIN_COURSE,
  MAIN_MAST,
  MIZZEN_MAST,
  MIZZEN_SAIL,
  MIZZEN_YARD_Y,
  QUARTERDECK,
  SPRITSAIL,
  WHEEL,
} from './caravelLayout';
import { CHASE_GUN_SCALE, caravelTemplateFor, type CaravelTemplate } from './caravelTemplate';

const RUDDER_MAX_ANGLE = 0.55;
/** Tours de la roue de gouvernail barre à fond (rad). */
const WHEEL_TURNS = 2.6;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.08;
/** Retrait des affûts par rapport au bordé : la bouche des fûts sort par les sabords. */
const GUN_INSET = 0.62;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Bouche du fût de chasse (fût de batterie : 0,8 m devant son pivot), à son échelle. */
const CHASE_MUZZLE = new THREE.Vector3(0.8 * CHASE_GUN_SCALE, 0, 0);
/** Pivot du fût de chasse, juste en retrait de la face avant du sabord. */
const CHASE_PIVOT_INSET = 0.06;
/** Écart de la voile latine par rapport au mât (m) : elle pend du côté sous le vent. */
const LATEEN_OFFSET = 0.22;
const { damp } = THREE.MathUtils;

/**
 * Caravelle : coque courte et haute, château arrière (fenêtres, fanal), gaillard d'avant ; grand mât à voile carrée
 * (avec hune), artimon à voile latine qui pivote selon le vent, beaupré et civadière. Canons sur affût sur le pont
 * principal, et, une fois acheté, le gros canon de chasse à l'abri sous le gaillard d'avant, dont le fût sort de l'étrave.
 */
export class CaravelModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 15.5;
  readonly waterline = hull.waterlineProfile();
  readonly deckPlan = CARAVEL_DECK;
  readonly flagMount: FlagMount = { position: new THREE.Vector3(0, FLAG.y, MAIN_MAST.z), length: FLAG.length, height: FLAG.height };
  /** La vergue latine passe au-dessus de la poupe : le drapeau de rang flotte en tête d'artimon. */
  readonly ensignStaff: EnsignStaff = mastheadStaff(MIZZEN_MAST.z, MIZZEN_MAST.top);
  readonly lanterns: LanternSpot[];
  // Château arrière, pont principal, gaillard d'avant, et deux brèches dans le bordé.
  readonly fireSpots = fireSpots(hull, [
    [-0.75, 0.35, QUARTERDECK.y],
    [-0.25, -0.4, DECK_Y],
    [0.15, 0.4, DECK_Y],
    [0.7, 0.2, FORECASTLE.y],
    [-0.1, 1, 0.6],
    [0.45, -1, 0.6],
  ]);
  private readonly template: CaravelTemplate;
  private readonly tornSail: TornSail;
  private readonly mainCourse: THREE.Mesh;
  private readonly mainYard: THREE.Mesh;
  private readonly spritsail: THREE.Mesh;
  /** Gréement latin de l'artimon (vergue + voile), qui pivote autour du mât selon le vent. */
  private readonly lateenRig = new THREE.Group();
  /** La voile latine, dans le repère de sa vergue : on l'écrase en Y pour la carguer contre la vergue. */
  private readonly lateen: THREE.Mesh;
  private readonly rudder: THREE.Mesh;
  private readonly wheel: THREE.Mesh;
  private readonly flag: WavingFlag;
  private readonly gunports: THREE.Mesh[] = [];
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private yardTarget = 0;

  constructor(stats: ShipStats, livery: Livery) {
    const t = (this.template = caravelTemplateFor(livery));
    this.tornSail = new TornSail(t.sailMaterial, livery.sailEmblem);
    this.lanterns = addStatics(this.root, t.statics);

    // Grand-voile carrée (elle porte l'emblème de la livrée, s'il y en a un) et sa vergue.
    this.mainCourse = new THREE.Mesh(t.mainCourse, this.tornSail.material(t.mainCourse, 'z', true));
    this.mainCourse.position.set(0, MAIN_COURSE.yardY, MAIN_MAST.z + 0.22);
    this.mainYard = new THREE.Mesh(t.mainYard, t.palette.wood);
    this.mainYard.position.set(0, MAIN_COURSE.yardY, MAIN_MAST.z + 0.1);
    // Civadière sous le beaupré.
    this.spritsail = new THREE.Mesh(t.spritsail, this.tornSail.material(t.spritsail, 'z'));
    this.spritsail.position.copy(SPRITSAIL.yard);
    const spritYard = new THREE.Mesh(t.spritYard, t.palette.wood);
    spritYard.position.copy(SPRITSAIL.yard);

    // Voile latine : couchée sur sa vergue (repère de la vergue posé au bout bas), dans un gréement qui tourne autour du mât.
    const yardFrame = new THREE.Group();
    yardFrame.position.copy(MIZZEN_SAIL.tack);
    yardFrame.rotation.x = t.lateenPitch;
    this.lateen = new THREE.Mesh(t.lateen, this.tornSail.material(t.lateen, 'x', false, SAIL_BILLOW.aftSailCurve));
    this.lateen.position.x = LATEEN_OFFSET;
    yardFrame.add(this.lateen, new THREE.Mesh(t.lateenYard, t.palette.wood));
    this.lateenRig.add(yardFrame);
    this.lateenRig.position.set(0, MIZZEN_YARD_Y, MIZZEN_MAST.z);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, WHEEL.y, WHEEL.z);
    this.rudder.position.set(0, 0.9, hull.stationAt(-1).z - 0.04);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, FLAG.y, MAIN_MAST.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.root.add(this.mainCourse, this.mainYard, this.spritsail, spritYard, this.lateenRig, this.rudder, this.wheel, this.flag.mesh);
    this.root.add(new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.setCannons(stats.cannonsPerSide, stats.chaseGuns ?? 0);
    this.applySails();
    this.root.scale.setScalar(stats.length / CARAVEL_LENGTH);
  }

  setSailAmount(amount: number) {
    this.sailAmount = amount;
    this.tornSail.setDeployment(amount);
    this.applySails();
  }

  setSailLevel(level: number) {
    this.sailWidth = 1 + SAIL_GROWTH * level;
    this.applySails();
  }

  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = rudder * WHEEL_TURNS;
  }

  /** La vergue latine pivote du côté où va le vent : presque dans l'axe au près, très ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, la voile ne change pas de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = 0.12 + 0.95 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.yardTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    if (this.armor) this.root.remove(this.armor);
    this.armor = null;
    const armor = armorFor(hull, level);
    if (armor) this.root.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons sur affût répartis le long du pont principal, puis le canon de chasse (second calibre) dans l'axe, sous le gaillard. */
  setCannons(perSide: number, chase = 0) {
    const t = this.template;
    for (const { object } of this.cannons) this.root.remove(object);
    for (const port of this.gunports) this.root.remove(port);
    this.cannons.length = 0;
    this.gunports.length = 0;
    for (let i = 0; i < perSide; i++) {
      const u = perSide === 1 ? (GUN_ZONE.aft + GUN_ZONE.fore) / 2 : THREE.MathUtils.lerp(GUN_ZONE.aft, GUN_ZONE.fore, i / (perSide - 1));
      const s = hull.stationAt(u);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(t.cannon, t.palette.metal);
        cannon.position.set(side * (hull.halfWidthAt(s, DECK_Y) - GUN_INSET), DECK_Y, s.z);
        const port = new THREE.Mesh(t.gunport, t.palette.dark);
        port.position.set(side * (hull.halfWidthAt(s, DECK_Y + 0.4) + 0.02), DECK_Y + 0.4, s.z);
        this.root.add(cannon, port);
        this.gunports.push(port);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
    if (chase > 0) {
      const gun = new THREE.Mesh(t.chaseGun, t.palette.metal);
      gun.position.set(0, CHASE_PORT.y, CHASE_PORT.front - CHASE_PIVOT_INSET);
      this.root.add(gun);
      this.cannons.push(cannonMount(gun, 0, CHASE_MUZZLE, 'deck'));
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
    this.lateenRig.rotation.y = damp(this.lateenRig.rotation.y, this.yardTarget, 1.2, dt);
    this.lateenRig.scale.x = this.leeSide;
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

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; voile latine carguée contre la sienne. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    this.mainCourse.scale.set(this.sailWidth, hoisted, 1);
    this.mainYard.scale.x = this.sailWidth;
    this.spritsail.scale.set(this.sailWidth, hoisted, 1);
    this.lateen.scale.y = hoisted;
  }
}
