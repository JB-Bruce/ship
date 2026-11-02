import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { galleonLamps } from './galleonLamps';
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
import { DECK_Y, galleonArmament, galleonLayout, HIGH_Y, LOW_Y, type GalleonLayout } from './galleonLayout';
import { galleonTemplateFor, type GalleonTemplate } from './galleonTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.45;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.05;
/** Bouches : fût dans un sabord (pivot au sabord), pièce sur affût d'un château. */
const PORT_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts des pièces légères par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;
/** Écart des voiles latines par rapport à leur mât (m) : elles pendent du côté sous le vent. */
const LATEEN_OFFSET = 0.24;

/**
 * Galion : coque haute aux flancs rentrés, hauts peints aux couleurs du camp et dorures ; château arrière à trois étages
 * (demi-pont, gaillard, dunette) et galeries de poupe, château avant bas, poulaine et lion de proue ; quatre mâts
 * (misaine et grand mât carrés à hunes rondes, artimon et contre-artimon à voiles latines qui pivotent selon le vent),
 * civadière. Deux batteries dans le bordé (5 et 4 par bord, jusqu'à 7 et 6 ; 8 et 7 grand galion, 9 et 8 galion amiral)
 * et des pièces légères sur affût (3 sur le demi-pont et le château avant, puis 4 ; deux de plus sur le pont à chaque
 * allongement). Allongé (setExtension), il est reconstruit sur le plan long : canons, renfort, voilure, dégâts et pavillon
 * sont remis en place.
 */
export class GalleonModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 37;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: GalleonLayout;
  private template!: GalleonTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  /** Voiles d'étai entre les mâts (parts/staysails.ts), recréées avec le modèle. */
  private staysails!: Staysails;
  private tornSail!: TornSail;
  private sails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private spritsail!: THREE.Mesh;
  /** Gréements latins (vergue + voile), qui pivotent autour de leur mât selon le vent, et leurs voiles. */
  private lateenRigs: THREE.Group[] = [];
  private lateens: THREE.Mesh[] = [];
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Niveau de voilure : les voiles d'étai se débloquent avec lui. */
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private yardTarget = 0;
  // État remis en place quand le navire est reconstruit (allongement).
  private perSide: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;

  /** Appliques, lampadaires et lanternes suspendues (parts/shipLamps.ts), recréés avec le modèle. */
  private lamps!: ShipLamps;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.root.add(this.body);
    this.build(galleonLayout(0));
  }

  /** Allongements (0 à 2) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = galleonLayout(level);
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
    this.sailLevel = level;
    this.staysails.setLevel(level);
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = -rudder * HELM_WHEEL.turns;
  }

  /** Les vergues latines pivotent du côté où va le vent : presque dans l'axe au près, très ouvertes au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, les voiles ne changent pas de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = 0.12 + 0.9 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.yardTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /**
   * Batteries basse et haute (fûts dans les sabords du bordé, au même calibre), puis les pièces légères (second calibre,
   * sur affût derrière les sabords du pavois du demi-pont, du château avant, puis du pont du milieu).
   */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    const L = this.layout;
    const { hull } = L;
    const t = this.template;
    const { low, high, pieces } = galleonArmament(perSide, L);
    const pair = (u: number, y: number, onDeck: boolean) => {
      const s = L.station(u);
      for (const side of [1, -1] as const) {
        const gun = new THREE.Mesh(onDeck ? t.deckGun : t.batteryGun, t.palette.metal);
        gun.position.set(side * (onDeck ? hull.halfWidthAt(s, y) - DECK_GUN_INSET : hull.halfWidthAt(s, y) * 0.99), y, s.z);
        this.body.add(gun);
        this.cannons.push(cannonMount(gun, (side * Math.PI) / 2, onDeck ? DECK_MUZZLE : PORT_MUZZLE, onDeck ? 'deck' : 'main'));
      }
    };
    for (const u of L.lowSlots.slice(0, low)) pair(u, LOW_Y + L.sheer(u), false);
    for (const u of L.highSlots.slice(0, high)) pair(u, HIGH_Y + L.sheer(u), false);
    for (const slot of L.pieceSlots.slice(0, pieces)) pair(slot.u, slot.y, true);
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.staysails.apply(this.sailAmount, this.leeSide);
    this.flag.update(dt);
    for (const rig of this.lateenRigs) {
      rig.rotation.y = damp(rig.rotation.y, this.yardTarget, 1.1, dt);
      rig.scale.x = this.leeSide;
    }
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
  private build(L: GalleonLayout) {
    this.layout = L;
    const t = (this.template = galleonTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    // Les vergues latines passent au-dessus de la poupe : le drapeau de rang flotte en tête du contre-artimon.
    this.ensignStaff = mastheadStaff(L.bonaventureMast.z, L.bonaventureMast.top);
    // Dunette, gaillard, demi-pont, milieu, château avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.9, 0.3, L.poop.y],
        [-0.6, -0.35, L.quarterdeck.y],
        [-0.35, 0.4, L.halfDeck.y],
        [-0.05, -0.4, DECK_Y],
        [0.3, 0.4, DECK_Y],
        [0.78, -0.25, L.forecastle.y],
        [-0.1, 1, 3.3],
        [0.3, -1, 3.3],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(galleonLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];
    this.staysails = new Staysails(this.tornSail, [L.foreMast, L.mainMast, L.mizzenMast], true);
    this.body.add(this.staysails.group);
    this.staysails.setLevel(this.sailLevel);

    this.sails = [];
    this.yards = [];
    L.squareSails.forEach((s, i) => {
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(t.squareSails[i], 'z', i === L.mainCourse));
      sail.position.set(0, s.yardY, s.mastZ + 0.26);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.12);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    // Civadière sous le beaupré.
    this.spritsail = new THREE.Mesh(t.spritsail, this.tornSail.material(t.spritsail, 'z'));
    this.spritsail.position.copy(L.spritsail.yard);

    // Voiles latines : couchées sur leur vergue (repère de la vergue posé au bout bas), dans un gréement qui tourne autour du mât.
    this.lateenRigs = [];
    this.lateens = [];
    L.lateens.forEach((l, i) => {
      const parts = t.lateens[i];
      const yardFrame = new THREE.Group();
      yardFrame.position.copy(l.sail.tack);
      yardFrame.rotation.x = parts.pitch;
      const sail = new THREE.Mesh(parts.sail, this.tornSail.material(parts.sail, 'x', false, SAIL_BILLOW.aftSailCurve));
      sail.position.x = LATEEN_OFFSET;
      yardFrame.add(sail, new THREE.Mesh(parts.yard, t.palette.wood));
      const rig = new THREE.Group();
      rig.add(yardFrame);
      rig.position.set(0, l.yardY, l.mast.z);
      rig.rotation.y = this.yardTarget;
      rig.scale.x = this.leeSide;
      this.lateenRigs.push(rig);
      this.lateens.push(sail);
      this.body.add(rig);
    });

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    // Sur l'étambot, sous la voûte de la poupe.
    this.rudder.position.set(0, 1, L.at(-0.97).z);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.spritsail, this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
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
    this.staysails.dispose();
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.sails = [];
    this.yards = [];
    this.lateenRigs = [];
    this.lateens = [];
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; voiles latines carguées contre la leur. */
  private applySails() {
    this.staysails.apply(this.sailAmount, this.leeSide);
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.sails) sail.scale.set(this.sailWidth, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = this.sailWidth;
    this.spritsail.scale.set(this.sailWidth, hoisted, 1);
    for (const lateen of this.lateens) lateen.scale.y = hoisted;
  }
}
