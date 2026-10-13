import * as THREE from 'three';
import { SAIL_BILLOW, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { alongMast, chaseSlots, CHASE_Y, DECK_Y, POOP, RAKE, xebecLayout, type XebecLateen, type XebecLayout } from './xebecLayout';
import { XebecOars } from './xebecOars';
import { CHASE_GUN_SCALE, FLAG, xebecTemplateFor, type XebecTemplate } from './xebecTemplate';

const RUDDER_MAX_ANGLE = 0.55;
/** Élargissement des voiles carrées et allongement des vergues latines par niveau de voilure. */
const SAIL_GROWTH = 0.06;
const GUN_INSET = 0.62;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Bouche d'un fût de chasse (fût de batterie : 0,8 m devant son pivot), à son échelle ; pivot juste en retrait du bordé. */
const CHASE_MUZZLE = new THREE.Vector3(0.8 * CHASE_GUN_SCALE, 0, 0);
const CHASE_PIVOT_INSET = 0.08;
/** Écart des voiles latines par rapport à leur mât (m) : elles pendent du côté sous le vent. */
const LATEEN_OFFSET = 0.24;
/** Ouverture des vergues latines : au près, et en plus au vent arrière (rad) ; l'amure reste près de l'étrave. */
const LATEEN_OPENING = { closeHauled: 0.1, running: 0.6 };
const { damp } = THREE.MathUtils;

/** Un gréement latin : il pivote autour de son mât ; `sail` est la voile, carguée contre sa vergue en Y. */
interface LateenRig {
  rig: THREE.Group;
  sail: THREE.Mesh;
}

/**
 * Chébec : coque longue, basse et étroite, dunette basse à balustrade et galerie de poupe en surplomb, éperon ; trois
 * mâts inclinés vers l'avant : latines de misaine et d'artimon qui pivotent selon le vent, basse voile et hunier carrés
 * au grand mât. Canons sur affût le long des flancs, canons de chasse (1 à 3) qui sortent de l'étrave. Avirons sous le
 * pont, sortis par vent de face (setOars) et qui nagent en cadence. Grand chébec (setExtension) : reconstruit sur le plan
 * rallongé ; canons, renfort, voilure, dégâts et pavillon sont remis en place.
 */
export class XebecModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 17.5;
  waterline!: readonly number[];
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: XebecLayout;
  private template!: XebecTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private lateens: LateenRig[] = [];
  private squareSails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private rudder!: THREE.Mesh;
  private flag!: WavingFlag;
  private oars!: XebecOars;
  private gunports: THREE.Mesh[] = [];
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private yardTarget = 0;
  /** Rames sorties (0..1), remises au nouveau lot quand le navire est reconstruit. */
  private oarsOut = 0;
  // État remis en place quand le navire est reconstruit (grand chébec).
  private perSide: number;
  private chase: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.chase = stats.chaseGuns ?? 0;
    this.root.add(this.body);
    this.build(xebecLayout(0));
  }

  /** Grand chébec (1) : reconstruit le navire sur le plan rallongé. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = xebecLayout(level);
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

  setOars(out: number) {
    this.oarsOut = out;
    this.oars.setOut(out);
  }

  /** Les vergues latines pivotent du côté où va le vent : presque dans l'axe au près, plus ouvertes au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, les voiles ne changent pas de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = LATEEN_OPENING.closeHauled + LATEEN_OPENING.running * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.yardTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons sur affût répartis le long des flancs, puis les canons de chasse (second calibre) qui sortent de l'étrave. */
  setCannons(perSide: number, chase = 0) {
    this.perSide = perSide;
    this.chase = chase;
    const { hull, gunZone, chasePorts } = this.layout;
    const t = this.template;
    for (const { object } of this.cannons) this.body.remove(object);
    for (const port of this.gunports) this.body.remove(port);
    this.cannons.length = 0;
    this.gunports.length = 0;
    for (let i = 0; i < perSide; i++) {
      const z = perSide === 1 ? (gunZone.aft + gunZone.fore) / 2 : THREE.MathUtils.lerp(gunZone.aft, gunZone.fore, i / (perSide - 1));
      const s = hull.stationAt(z / hull.halfLength);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(t.cannon, t.palette.metal);
        cannon.position.set(side * (hull.halfWidthAt(s, DECK_Y) - GUN_INSET), DECK_Y, s.z);
        const port = new THREE.Mesh(t.gunport, t.palette.dark);
        port.position.set(side * (hull.halfWidthAt(s, DECK_Y + 0.32) + 0.02), DECK_Y + 0.32, s.z);
        this.body.add(cannon, port);
        this.gunports.push(port);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
    for (const slot of chaseSlots(chase)) {
      const port = chasePorts[slot];
      const gun = new THREE.Mesh(t.chaseGun, t.palette.metal);
      gun.position.set(port.x, CHASE_Y, port.z - CHASE_PIVOT_INSET);
      this.body.add(gun);
      this.cannons.push(cannonMount(gun, 0, CHASE_MUZZLE, 'deck'));
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
    for (const { rig } of this.lateens) {
      rig.rotation.y = damp(rig.rotation.y, this.yardTarget, 1.2, dt);
      rig.scale.x = this.leeSide;
    }
    this.oars.update(dt);
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), gréements, gouvernail, pavillon, avirons, canons. */
  private build(L: XebecLayout) {
    this.layout = L;
    const t = (this.template = xebecTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    const mainTop = alongMast(L.mainMast.z, L.mainMast.length);
    this.flagMount = { position: new THREE.Vector3(0, mainTop.y + 0.1, mainTop.z), length: FLAG.length, height: FLAG.height };
    // La vergue latine d'artimon passe au-dessus de la dunette : le drapeau de rang flotte en tête d'artimon.
    const mizzenTop = alongMast(L.mizzenMast.z, L.mizzenMast.length);
    this.ensignStaff = mastheadStaff(mizzenTop.z, mizzenTop.y);
    this.fireSpots = fireSpots(L.hull, [
      [-0.85, 0.35, POOP.y],
      [-0.4, -0.4, DECK_Y],
      [0.05, 0.4, DECK_Y],
      [0.5, -0.3, DECK_Y],
      [-0.15, 1, 0.55],
      [0.35, -1, 0.55],
    ]);
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lanterns = addStatics(this.body, t.statics);

    // Grand mât : basse voile (elle porte l'emblème de la livrée, s'il y en a un) et hunier, sur le mât incliné.
    const main = this.mastFrame(L.mainMast.z);
    this.squareSails = [];
    this.yards = [];
    for (const [shape, sail, yard, emblem] of [[L.course, t.course, t.courseYard, true], [L.topsail, t.topsail, t.topsailYard, false]] as const) {
      const mesh = new THREE.Mesh(sail, this.tornSail.material(sail, 'z', emblem));
      mesh.position.set(0, shape.along, 0.25);
      const spar = new THREE.Mesh(yard, t.palette.wood);
      spar.position.set(0, shape.along, 0.12);
      main.add(mesh, spar);
      this.squareSails.push(mesh);
      this.yards.push(spar);
    }
    this.lateens = [L.fore, L.mizzen].map((def, i) => this.lateenRig(def, t.lateens[i]));

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.8, L.hull.stationAt(-1).z - 0.04);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, this.flagMount.position.y + this.flagLift, this.flagMount.position.z);

    this.oars = new XebecOars(L, t.oar, t.palette);
    this.oars.setOut(this.oarsOut);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.rudder, this.flag.mesh, this.oars.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide, this.chase);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.tornSail.setDeployment(this.sailAmount);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.flag.dispose();
    this.tornSail.dispose();
    this.oars.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.gunports.length = 0;
    this.lateens = [];
  }

  /** Repère d'un mât incliné vers l'avant (Y le long du mât), posé sur le pont. */
  private mastFrame(z: number): THREE.Group {
    const frame = new THREE.Group();
    frame.position.set(0, DECK_Y, z);
    frame.rotation.x = RAKE;
    this.body.add(frame);
    return frame;
  }

  /** Gréement latin : vergue et voile couchées sur la vergue (repère posé au bout bas), tournant autour du mât. */
  private lateenRig(def: XebecLateen, parts: XebecTemplate['lateens'][number]): LateenRig {
    const rig = new THREE.Group();
    rig.position.y = def.along;
    rig.rotation.y = this.yardTarget;
    const yardFrame = new THREE.Group();
    yardFrame.position.copy(def.sail.tack);
    yardFrame.rotation.x = parts.pitch;
    const sail = new THREE.Mesh(parts.sail, this.tornSail.material(parts.sail, 'x', false, SAIL_BILLOW.aftSailCurve));
    sail.position.x = LATEEN_OFFSET;
    yardFrame.add(sail, new THREE.Mesh(parts.yard, this.template.palette.wood));
    rig.add(yardFrame);
    this.mastFrame(def.mast.z).add(rig);
    return { rig, sail };
  }

  /** Voiles carrées carguées vers leur vergue et élargies avec la voilure ; latines carguées contre leur vergue. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    const width = 1 + SAIL_GROWTH * this.sailLevel;
    for (const sail of this.squareSails) sail.scale.set(width, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = width;
    for (const { sail } of this.lateens) sail.scale.set(1, hoisted, 1);
  }
}
