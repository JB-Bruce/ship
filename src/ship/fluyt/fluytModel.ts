import * as THREE from 'three';
import { Staysails } from '../parts/staysails';
import type { Waterline } from '../parts/hullShape';
import { SAIL_BILLOW, type Livery, type ShipStats, HELM_WHEEL } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { BATTERY_Y, DECK_Y, fluytArmament, fluytLayout, type FluytLayout } from './fluytLayout';
import { fluytTemplateFor, type FluytTemplate } from './fluytTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.5;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.07;
/** Grand-voile basse (index dans squareSails) : la plus grande voile, qui porte l'emblème de la livrée. */
const MAIN_COURSE = 3;
/** Bouche des canons : fût de batterie (pivot au sabord), canon sur affût des gaillards. */
const BATTERY_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts des gaillards par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;
/** Écart de la voile latine par rapport au mât (m) : elle pend du côté sous le vent. */
const LATEEN_OFFSET = 0.22;

/**
 * Flûte : coque ventrue en banane, flancs très rentrés (pont étroit), haute poupe à dunette ; trois-mâts (misaine et
 * grand mât à trois voiles carrées, artimon à voile latine qui pivote selon le vent et perroquet de fougue), civadière
 * sous un beaupré très relevé. Batterie couverte de canons dans le bordé (4 par bord, jusqu'à 6, 7 allongée) et canons
 * légers sur affût derrière le pavois des gaillards (2 sur celui d'arrière, un de plus sur celui d'avant une fois
 * allongée). Allongée (setExtension), elle est reconstruite sur le plan long : canons, renfort, voilure, dégâts et
 * pavillon sont remis en place.
 */
export class FluytModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 22;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: FluytLayout;
  private template!: FluytTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  /** Voiles d'étai entre les mâts (parts/staysails.ts), recréées avec le modèle. */
  private staysails!: Staysails;
  private tornSail!: TornSail;
  private sails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private spritsail!: THREE.Mesh;
  /** Gréement latin de l'artimon (vergue + voile), qui pivote autour du mât selon le vent. */
  private lateenRig!: THREE.Group;
  /** La voile latine, dans le repère de sa vergue : on l'écrase en Y pour la carguer contre la vergue. */
  private lateen!: THREE.Mesh;
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private yardTarget = 0;
  // État remis en place quand le navire est reconstruit (allongement).
  private perSide: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.root.add(this.body);
    this.build(fluytLayout(0));
  }

  /** Allongement (0 ou 1) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = fluytLayout(level);
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
    this.sailWidth = 1 + SAIL_GROWTH * level;
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = -rudder * HELM_WHEEL.turns;
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
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons de la batterie couverte (fûts dans les sabords du bordé), puis canons légers des gaillards, sur affût derrière le pavois. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    const L = this.layout;
    const { hull } = L;
    const t = this.template;
    const { battery, deck } = fluytArmament(perSide, L);
    const mount = (u: number, y: number, onDeck: boolean) => {
      const s = L.station(u);
      for (const side of [1, -1] as const) {
        const gun = new THREE.Mesh(onDeck ? t.deckGun : t.batteryGun, t.palette.metal);
        gun.position.set(side * (onDeck ? hull.halfWidthAt(s, y) - DECK_GUN_INSET : hull.halfWidthAt(s, y) * 0.99), y, s.z);
        this.body.add(gun);
        this.cannons.push(cannonMount(gun, (side * Math.PI) / 2, onDeck ? DECK_MUZZLE : BATTERY_MUZZLE, onDeck ? 'deck' : 'main'));
      }
    };
    for (let k = 0; k < battery; k++) mount(L.batterySlots[k], BATTERY_Y + L.sheer(L.batterySlots[k]), false);
    for (let k = 0; k < deck; k++) mount(L.deckSlots[k].u, L.deckSlots[k].y, true);
  }

  animate(dt: number) {
    this.staysails.apply(this.sailAmount, this.leeSide);
    this.flag.update(dt);
    this.lateenRig.rotation.y = damp(this.lateenRig.rotation.y, this.yardTarget, 1.2, dt);
    this.lateenRig.scale.x = this.leeSide;
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, gouvernail, pavillon, canons. */
  private build(L: FluytLayout) {
    this.layout = L;
    const t = (this.template = fluytTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    // La vergue latine passe au-dessus de la poupe : le drapeau de rang flotte en tête d'artimon.
    this.ensignStaff = mastheadStaff(L.mizzenMast.z, L.mizzenMast.top);
    // Dunette, gaillard d'arrière, pont principal, gaillard d'avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.9, 0.3, L.poop.y],
        [-0.55, -0.35, L.quarterdeck.y],
        [-0.15, 0.4, DECK_Y],
        [0.3, -0.4, DECK_Y],
        [0.82, 0.2, L.forecastle.y],
        [-0.1, 1, 1.1],
        [0.4, -1, 1.1],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lanterns = addStatics(this.body, t.statics);
    this.staysails = new Staysails(this.tornSail, [L.foreMast, L.mainMast]);
    this.body.add(this.staysails.group);

    this.sails = [];
    this.yards = [];
    L.squareSails.forEach((s, i) => {
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(t.squareSails[i], 'z', i === MAIN_COURSE));
      sail.position.set(0, s.yardY, s.mastZ + 0.22);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.1);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    // Civadière sous le beaupré.
    this.spritsail = new THREE.Mesh(t.spritsail, this.tornSail.material(t.spritsail, 'z'));
    this.spritsail.position.copy(L.spritsail.yard);

    // Voile latine : couchée sur sa vergue (repère de la vergue posé au bout bas), dans un gréement qui tourne autour du mât.
    const yardFrame = new THREE.Group();
    yardFrame.position.copy(L.mizzenSail.tack);
    yardFrame.rotation.x = t.lateenPitch;
    this.lateen = new THREE.Mesh(t.lateen, this.tornSail.material(t.lateen, 'x', false, SAIL_BILLOW.aftSailCurve));
    this.lateen.position.x = LATEEN_OFFSET;
    yardFrame.add(this.lateen, new THREE.Mesh(t.lateenYard, t.palette.wood));
    this.lateenRig = new THREE.Group();
    this.lateenRig.add(yardFrame);
    this.lateenRig.position.set(0, L.mizzenYardY, L.mizzenMast.z);
    this.lateenRig.rotation.y = this.yardTarget;
    this.lateenRig.scale.x = this.leeSide;

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    // Sur l'étambot, sous la voûte de la poupe.
    this.rudder.position.set(0, 1.3, L.at(-0.92).z);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.spritsail, this.lateenRig, this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.tornSail.setDeployment(this.sailAmount);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.staysails.dispose();
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.sails = [];
    this.yards = [];
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; voile latine carguée contre la sienne. */
  private applySails() {
    this.staysails.apply(this.sailAmount, this.leeSide);
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.sails) sail.scale.set(this.sailWidth, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = this.sailWidth;
    this.spritsail.scale.set(this.sailWidth, hoisted, 1);
    this.lateen.scale.y = hoisted;
  }
}
