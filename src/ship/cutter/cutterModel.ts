import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { cutterLamps } from './cutterLamps';
import type { Waterline } from '../parts/hullShape';
import type { Livery, ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { cutterLayout, DECK_Y, RAKE, type CutterLayout } from './cutterLayout';
import { BOOM_HEIGHT, cutterTemplateFor, FLAG, FLYING_TOPSAIL, GAFF_TOPSAIL, rigStretch, type CutterTemplate } from './cutterTemplate';

const RUDDER_MAX_ANGLE = 0.55;
/** Allongement de la bôme et de la grand-voile par niveau de voilure (en longueur seulement). */
const SAIL_GROWTH = 0.06;
/** Élargissement du hunier par niveau de voilure. */
const TOPSAIL_GROWTH = 0.04;
const GUN_INSET = 0.6;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Bouche du pierrier, dans le repère de la pièce (props.buildCannonGeometry). */
const SWIVEL_MUZZLE = new THREE.Vector3(0.75, 0.1, 0);
const { damp } = THREE.MathUtils;

/**
 * Cotre : coque fine et basse, un seul mât très haut, immense grand-voile aurique dont la bôme déborde de la poupe (elle
 * pivote selon le vent, flèche au-dessus), trois voiles d'avant (trinquette, foc, clin-foc) sur un très long beaupré,
 * canons sur affût le long du pont et un pierrier par flanc sur le plat-bord, près de la poupe. Cotre armé
 * (setExtension) : reconstruit sur le plan rallongé, avec un hunier volant, voile carrée devant le mât qui se règle comme
 * les autres ; canons, renfort, voilure, dégâts et pavillon sont remis en place.
 */
export class CutterModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 16.2;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: CutterLayout;
  private template!: CutterTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private rig!: THREE.Group;
  private hoist!: THREE.Group;
  private headsails: THREE.Mesh[] = [];
  private topsail: THREE.Mesh | null = null;
  private rudder!: THREE.Mesh;
  private flag!: WavingFlag;
  private gunports: THREE.Mesh[] = [];
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord (où la bôme est poussée). */
  private leeSide = 1;
  private boomTarget = 0;
  // État remis en place quand le navire est reconstruit (cotre armé).
  private perSide: number;
  private readonly swivels: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;
  /** Lanterne de potence et lampadaire (parts/shipLamps.ts), recréés avec le modèle. */
  private lamps!: ShipLamps;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.swivels = stats.swivels ?? 0;
    this.root.add(this.body);
    this.build(cutterLayout(0));
  }

  /** Cotre armé (1) : reconstruit le navire sur le plan rallongé, avec son hunier volant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = cutterLayout(level);
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

  /** La bôme part du côté où va le vent : presque dans l'axe au près, largement ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, la bôme ne passe pas d'un bord à l'autre sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    this.boomTarget = -this.leeSide * (0.12 + 1.1 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI));
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons sur affût répartis le long de chaque bord, et les pierriers sur le plat-bord près de la poupe (second calibre). */
  setCannons(perSide: number) {
    this.perSide = perSide;
    const { hull, gunZone, swivelZ } = this.layout;
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
        cannon.position.set(side * (s.halfWidth - GUN_INSET), DECK_Y, s.z);
        const port = new THREE.Mesh(t.gunport, t.palette.dark);
        port.position.set(side * (s.halfWidth + 0.02), DECK_Y + 0.3, s.z);
        this.body.add(cannon, port);
        this.gunports.push(port);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
    for (let i = 0; i < this.swivels; i++) {
      const s = hull.stationAt((swivelZ + i * 1.2) / hull.halfLength);
      for (const side of [1, -1] as const) {
        const swivel = new THREE.Mesh(t.swivel, t.palette.metal);
        swivel.position.set(side * (s.halfWidth - 0.04), s.gunwale + 0.14, s.z);
        this.body.add(swivel);
        this.cannons.push(cannonMount(swivel, (side * Math.PI) / 2, SWIVEL_MUZZLE, 'deck'));
      }
    }
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.flag.update(dt);
    this.rig.rotation.y = damp(this.rig.rotation.y, this.boomTarget, 1.2, dt);
    this.hoist.scale.x = this.leeSide;
    for (const sail of this.headsails) sail.scale.x = Math.abs(sail.scale.x) * this.leeSide;
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), gréement, voiles d'avant, hunier, gouvernail, pavillon, canons. */
  private build(L: CutterLayout) {
    this.layout = L;
    const t = (this.template = cutterTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    // La bôme passe au-dessus de la poupe : le drapeau de rang flotte au-dessus de la tête du mât, le pavillon dessous.
    this.flagMount = { position: new THREE.Vector3(0, L.mastTop.y - 0.6, L.mastTop.z), length: FLAG.length, height: FLAG.height };
    this.ensignStaff = mastheadStaff(L.mastTop.z, L.mastTop.y);
    this.fireSpots = fireSpots(L.hull, [
      [-0.7, 0.3, DECK_Y],
      [-0.2, -0.4, DECK_Y],
      [0.4, 0.3, DECK_Y],
      [0.7, -0.2, DECK_Y],
      [0.1, 1, 0.45],
      [-0.5, -1, 0.45],
    ]);
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(cutterLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];

    // Grand-voile (elle porte l'emblème de la livrée) et sa flèche, sur le gréement qui pivote autour du mât.
    const tilt = new THREE.Group();
    tilt.position.set(0, DECK_Y, L.mastZ);
    tilt.rotation.x = -RAKE;
    this.rig = new THREE.Group();
    this.rig.position.y = BOOM_HEIGHT;
    this.rig.rotation.y = this.boomTarget;
    this.hoist = new THREE.Group();
    const gaffTopsail = new THREE.Mesh(t.gaffTopsail, this.tornSail.material(t.gaffTopsail, 'x'));
    gaffTopsail.position.copy(GAFF_TOPSAIL.tack);
    this.hoist.add(new THREE.Mesh(t.mainSail, this.tornSail.material(t.mainSail, 'x', true)), new THREE.Mesh(t.gaff, t.palette.wood), gaffTopsail);
    this.rig.add(new THREE.Mesh(t.boom, t.palette.wood), this.hoist);
    tilt.add(this.rig);
    this.headsails = t.headsails.map((geometry, i) => {
      const sail = new THREE.Mesh(geometry, this.tornSail.material(geometry, 'x'));
      sail.position.copy(L.headsails[i].tack);
      this.body.add(sail);
      return sail;
    });

    // Hunier volant du cotre armé : voile carrée sur sa vergue, devant le mât.
    this.topsail = null;
    if (L.level > 0) {
      const mast = new THREE.Group();
      mast.position.set(0, DECK_Y, L.mastZ);
      mast.rotation.x = -RAKE;
      this.topsail = new THREE.Mesh(t.topsail, this.tornSail.material(t.topsail, 'z'));
      this.topsail.position.set(0, FLYING_TOPSAIL.along, 0.28);
      const yard = new THREE.Mesh(t.topsailYard, t.palette.wood);
      yard.position.set(0, FLYING_TOPSAIL.along, 0.2);
      mast.add(this.topsail, yard);
      this.body.add(mast);
    }

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.8, L.hull.stationAt(-1).z - 0.04);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, this.flagMount.position.y + this.flagLift, this.flagMount.position.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(tilt, this.rudder, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.tornSail.setDeployment(this.sailAmount);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.lamps.dispose();
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.gunports.length = 0;
    this.headsails = [];
  }

  /** Voiles hissées (cran de voile) et allongées (niveau de voilure, cotre armé) ; voiles d'avant roulées vers leur amure. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    this.rig.scale.z = (1 + SAIL_GROWTH * this.sailLevel) * rigStretch(this.layout);
    this.hoist.scale.set(this.leeSide, hoisted, 1);
    const head = 0.15 + 0.85 * this.sailAmount;
    for (const s of this.headsails) s.scale.set(head * this.leeSide, head, head);
    this.topsail?.scale.set(1 + TOPSAIL_GROWTH * this.sailLevel, hoisted, 1);
  }
}
