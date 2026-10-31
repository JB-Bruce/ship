import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { shipOfLineLamps } from './shipOfLineLamps';
import { Staysails } from '../parts/staysails';
import type { Waterline } from '../parts/hullShape';
import { GUNPORTS, HELM_WHEEL, SAIL_BILLOW, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, sideTf, waterMaskMaterial, WavingFlag } from '../parts/common';
import { GunportLids, type LidPlace } from '../parts/gunportLids';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { DECK_Y, HIGH_Y, LOW_Y, PORT, shipOfLineArmament, shipOfLineLayout, type ShipOfLineLayout } from './shipOfLineLayout';
import { shipOfLineTemplateFor, type ShipOfLineTemplate } from './shipOfLineTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.45;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement), allongement de la brigantine. */
const SAIL_GROWTH = 0.05;
const SPANKER_GROWTH = 0.04;
/** Bouches : fût dans un sabord (pivot au sabord), pièce sur affût du pont. */
const PORT_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts des pièces légères par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;
/** Charnière des mantelets : au-dessus du sabord, un peu hors du bordé (m). */
const LID_OUTSET = 0.075;

/** Un fût de batterie : sa monture, son bord, et sa place quand il est sorti (x). */
interface BatteryGun {
  mesh: THREE.Mesh;
  side: 1 | -1;
  outX: number;
}

/**
 * Vaisseau de ligne (64, 74, 80) : coque large en bas aux flancs très rentrés, bandes ocre des deux batteries serrées
 * l'une sur l'autre, hauts peints aux couleurs du camp ; gaillard d'arrière et dunette bas, gaillard d'avant, poupe à
 * deux galeries et bouteilles, poulaine et lion de proue (comme le galion) ; trois mâts carrés, hunier d'artimon au-dessus
 * de la brigantine qui pivote selon le vent, civadière et contre-civadière, deux focs, voiles d'étai débloquées par la
 * voilure.
 * Batteries dans le bordé derrière des mantelets fermés en route : au combat, ils se relèvent et les fûts sortent
 * (setGunports) ; pièces légères sur affût sur le pont et les gaillards. Allongé (64 → 74 → 80), il est reconstruit.
 */
export class ShipOfLineModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 44;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: ShipOfLineLayout;
  private template!: ShipOfLineTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private staysails!: Staysails;
  private tornSail!: TornSail;
  private sails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private spritsail!: THREE.Mesh;
  private jibs: THREE.Mesh[] = [];
  /** Gréement de la brigantine (bôme + voile + corne), qui pivote autour de l'artimon ; `hoist` porte la voile et la corne. */
  private spankerRig!: THREE.Group;
  private hoist!: THREE.Group;
  private lids!: GunportLids;
  private batteryGuns: BatteryGun[] = [];
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private boomTarget = 0;
  // État remis en place quand le navire est reconstruit (allongement).
  private perSide: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;
  private portsOpen = 0;
  /** Lanternes de hune, appliques et potences (parts/shipLamps.ts), recréées avec le modèle. */
  private lamps!: ShipLamps;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.root.add(this.body);
    this.build(shipOfLineLayout(0));
  }

  /** Allongements (0 : vaisseau de 64, 1 : de 74, 2 : de 80) : reconstruit le navire. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = shipOfLineLayout(level);
    if (layout === this.layout) return false;
    this.portsOpen = this.lids.open;
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
    this.staysails.setLevel(level);
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = -rudder * HELM_WHEEL.turns;
  }

  /** La bôme de la brigantine part du côté où va le vent : presque dans l'axe au près, très ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, rien ne change de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    this.boomTarget = -this.leeSide * (0.12 + 1 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI));
  }

  /** Branle-bas de combat : les mantelets se relèvent et les fûts sortent (animés dans `animate`). */
  setGunports(open: boolean) {
    this.lids.setTarget(open);
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /**
   * Batteries basse et haute (fûts dans les sabords du bordé, au même calibre ; rentrés tant que les mantelets sont
   * fermés), puis les pièces légères (second calibre, sur affût derrière le pavois du pont et des gaillards).
   */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    this.batteryGuns = [];
    const L = this.layout;
    const { hull } = L;
    const t = this.template;
    const { low, high, pieces } = shipOfLineArmament(perSide, L);
    const pair = (u: number, y: number, onDeck: boolean) => {
      const s = L.station(u);
      for (const side of [1, -1] as const) {
        const mesh = new THREE.Mesh(onDeck ? t.deckGun : t.batteryGun, t.palette.metal);
        const outX = side * (onDeck ? hull.halfWidthAt(s, y) - DECK_GUN_INSET : hull.halfWidthAt(s, y) * 0.99);
        mesh.position.set(outX, y, s.z);
        this.body.add(mesh);
        this.cannons.push(cannonMount(mesh, (side * Math.PI) / 2, onDeck ? DECK_MUZZLE : PORT_MUZZLE, onDeck ? 'deck' : 'main'));
        if (!onDeck) this.batteryGuns.push({ mesh, side, outX });
      }
    };
    for (const u of L.lowSlots.slice(0, low)) pair(u, LOW_Y + L.sheer(u), false);
    for (const u of L.highSlots.slice(0, high)) pair(u, HIGH_Y + L.sheer(u), false);
    for (const slot of L.pieceSlots.slice(0, pieces)) pair(slot.u, slot.y, true);
    this.runOut();
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.staysails.apply(this.sailAmount, this.leeSide);
    this.flag.update(dt);
    this.spankerRig.rotation.y = damp(this.spankerRig.rotation.y, this.boomTarget, 1.1, dt);
    this.hoist.scale.x = this.leeSide;
    for (const jib of this.jibs) jib.scale.x = Math.abs(jib.scale.x) * this.leeSide;
    if (this.lids.update(dt)) this.runOut();
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, mantelets, gouvernail, pavillon, canons. */
  private build(L: ShipOfLineLayout) {
    this.layout = L;
    const t = (this.template = shipOfLineTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    // La bôme de la brigantine passe au-dessus de la poupe : le drapeau de rang flotte en tête d'artimon.
    this.ensignStaff = mastheadStaff(L.mizzenMast.z, L.mizzenMast.top);
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.9, 0.3, L.poop.y],
        [-0.6, -0.35, L.quarterdeck.y],
        [-0.2, 0.4, DECK_Y],
        [0.3, -0.4, DECK_Y],
        [0.8, 0.25, L.forecastle.y],
        [-0.1, 1, 3.4],
        [0.35, -1, 3.4],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(shipOfLineLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];
    this.staysails = new Staysails(this.tornSail, [L.foreMast, L.mainMast, L.mizzenMast], true);
    this.body.add(this.staysails.group);
    this.staysails.setLevel(this.sailLevel);

    this.sails = [];
    this.yards = [];
    L.squareSails.forEach((s, i) => {
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(t.squareSails[i], 'z', i === L.mainCourse));
      sail.position.set(0, s.yardY, s.mastZ + 0.28);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.13);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    this.spritsail = new THREE.Mesh(t.spritsail, this.tornSail.material(t.spritsail, 'z'));
    this.spritsail.position.copy(L.spritsail.yard);
    this.jibs = L.jibs.map((j, i) => {
      const jib = new THREE.Mesh(t.jibs[i], this.tornSail.material(t.jibs[i], 'x'));
      jib.position.copy(j.tack);
      this.body.add(jib);
      return jib;
    });
    // Brigantine : elle pivote autour de l'artimon, à la hauteur de sa bôme.
    this.hoist = new THREE.Group();
    this.hoist.add(new THREE.Mesh(t.spanker, this.tornSail.material(t.spanker, 'x', false, SAIL_BILLOW.aftSailCurve)), new THREE.Mesh(t.gaff, t.palette.wood));
    this.spankerRig = new THREE.Group();
    this.spankerRig.add(new THREE.Mesh(t.boom, t.palette.wood), this.hoist);
    this.spankerRig.position.set(0, L.boomY, L.mizzenMast.z);
    this.spankerRig.rotation.y = this.boomTarget;

    // Mantelets des deux batteries, sur tous les sabords (même sans canon).
    const places = (ports: readonly number[], y: number, height: number): LidPlace[] =>
      ports.flatMap((u) => ([1, -1] as const).map((side) => ({ hinge: sideTf(L.hull, L.station(u), y + L.sheer(u) + height / 2 + 0.04, side, LID_OUTSET), side })));
    this.lids = new GunportLids(t.lidMaterial, [
      { geometry: t.lowLid, places: places(L.lowPorts, LOW_Y, PORT.low[0]) },
      { geometry: t.highLid, places: places(L.highPorts, HIGH_Y, PORT.high[0]) },
    ]);
    this.lids.snap(this.portsOpen);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 1.2, L.at(-0.93).z);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.spritsail, this.spankerRig, this.lids.group, this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
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
    this.lids.dispose();
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.batteryGuns = [];
    this.sails = [];
    this.yards = [];
    this.jibs = [];
  }

  /** Les fûts des batteries suivent les mantelets : rentrés derrière un sabord fermé, sortis quand il s'ouvre. */
  private runOut() {
    const back = GUNPORTS.runIn * (1 - this.lids.open);
    for (const { mesh, side, outX } of this.batteryGuns) mesh.position.x = outX - side * back;
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; focs et brigantine réduits. */
  private applySails() {
    this.staysails.apply(this.sailAmount, this.leeSide);
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    const width = 1 + SAIL_GROWTH * this.sailLevel;
    for (const sail of this.sails) sail.scale.set(width, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = width;
    this.spritsail.scale.set(width, hoisted, 1);
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
    this.spankerRig.scale.z = 1 + SPANKER_GROWTH * this.sailLevel;
    this.hoist.scale.set(this.leeSide, hoisted, 1);
  }
}
