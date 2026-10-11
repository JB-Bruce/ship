import * as THREE from 'three';
import type { Livery, ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { TornSail } from '../parts/tornSail';
import type { DeckPlan } from '../deckPlan';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { batteryY, DECK_Y, frigateArmament, frigateLayout, MAIN_COURSE, type FrigateLayout } from './frigateLayout';
import { frigateTemplateFor, type FrigateTemplate } from './frigateTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.5;
/** Tours de roue pour un coup de barre complet (rad). */
const WHEEL_TURNS = 2.6;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.08;
/** Bouche des canons : fût de batterie (pivot au sabord), canon sur affût des gaillards. */
const BATTERY_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts des gaillards par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;

/**
 * Frégate : trois-mâts carré (trois voiles par mât, hunier et perroquet à l'artimon au-dessus de la brigantine qui
 * suit le vent), civadière et contre-civadière au beaupré, un foc, château arrière en escalier à galeries, gaillard
 * d'avant et éperon. Batterie couverte de canons lourds (4 à 8 par bord, 10 allongée, 12 grande frégate) et canons
 * légers sur les gaillards (2 à 4 par bord, 5 allongée, 6 grande frégate), selon les achats. Allongée (setExtension), elle est reconstruite sur le plan
 * long : tout ce qu'elle porte (canons, renfort, voilure, dégâts, pavillon) est remis en place.
 */
export class FrigateModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 29;
  waterline!: readonly number[];
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  deckPlan!: DeckPlan;
  private layout!: FrigateLayout;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private readonly sails: THREE.Mesh[] = [];
  private readonly yards: THREE.Mesh[] = [];
  private readonly jibs: THREE.Mesh[] = [];
  /** Gréement de la brigantine (bôme + voile + corne), qui pivote selon le vent ; `hoist` porte la voile et la corne. */
  private spankerRig!: THREE.Group;
  private hoist!: THREE.Group;
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private spritFlag!: WavingFlag;
  private template!: FrigateTemplate;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Côté sous le vent (+1 bâbord, -1 tribord) : focs et brigantine se creusent de ce côté. */
  private leeSide = 1;
  private boomTarget = 0;
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
    this.build(frigateLayout(0));
  }

  /** Allongements (0, 1, 2) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = frigateLayout(level);
    if (layout === this.layout) return false;
    this.disposeParts();
    this.build(layout);
    return true;
  }

  setSailAmount(amount: number) {
    this.sailAmount = amount;
    this.applySails();
  }

  setSailLevel(level: number) {
    this.sailWidth = 1 + SAIL_GROWTH * level;
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = rudder * WHEEL_TURNS;
  }

  /** La bôme de brigantine part du côté où va le vent : presque dans l'axe au près, très ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.spritFlag.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, rien ne change de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = 0.12 + 1.05 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.boomTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons de batterie dans les sabords du bordé, puis canons légers sur les gaillards, selon leur nombre par bord. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    const L = this.layout;
    const t = this.template;
    const { battery, deck } = frigateArmament(perSide, L);
    for (let k = 0; k < battery; k++) {
      const u = L.batterySlots[k];
      const [y, z] = [batteryY(u), L.station(u).z];
      for (const side of [1, -1] as const) {
        const gun = new THREE.Mesh(t.batteryGun, t.palette.metal);
        gun.position.set(side * L.width(u, y) * 0.99, y, z);
        this.body.add(gun);
        this.cannons.push(cannonMount(gun, (side * Math.PI) / 2, BATTERY_MUZZLE, 'main'));
      }
    }
    for (let k = 0; k < deck; k++) {
      const slot = L.deckSlots[k];
      for (const side of [1, -1] as const) {
        const gun = new THREE.Mesh(t.deckGun, t.palette.metal);
        gun.position.set(side * (L.width(slot.u, slot.y) - DECK_GUN_INSET), slot.y, L.station(slot.u).z);
        this.body.add(gun);
        this.cannons.push(cannonMount(gun, (side * Math.PI) / 2, DECK_MUZZLE, 'deck'));
      }
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
    this.spritFlag.update(dt);
    this.spankerRig.rotation.y = damp(this.spankerRig.rotation.y, this.boomTarget, 1.2, dt);
    this.hoist.scale.x = this.leeSide;
    for (const jib of this.jibs) jib.scale.x = Math.abs(jib.scale.x) * this.leeSide;
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, gouvernail, pavillons, canons. */
  private build(L: FrigateLayout) {
    this.layout = L;
    const t = (this.template = frigateTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    this.ensignStaff = mastheadStaff(L.mizzenMast.z, L.mizzenMast.top);
    // Gaillard d'arrière, pont principal, gaillard d'avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.88, -0.3, L.poop.y],
        [-0.6, 0.35, L.quarterdeck.y],
        [-0.3, -0.4, DECK_Y],
        [0.05, 0.4, DECK_Y],
        [0.35, -0.3, DECK_Y],
        [0.78, 0.2, L.forecastle.y],
        [-0.15, 1, 0.8],
        [0.4, -1, 0.8],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    for (const { geometry, material } of t.statics) this.body.add(new THREE.Mesh(geometry, material));

    L.squareSails.forEach((s, i) => {
      // La grand-voile (la plus grande) porte l'emblème de la livrée, s'il y en a un.
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(i === MAIN_COURSE ? t.squareSails[i] : undefined));
      sail.position.set(0, s.yardY, s.z);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.z - 0.13);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    L.jibs.forEach((j, i) => {
      const jib = new THREE.Mesh(t.jibs[i], this.tornSail.material());
      jib.position.copy(j.tack);
      this.jibs.push(jib);
      this.body.add(jib);
    });
    this.hoist = new THREE.Group();
    this.hoist.add(new THREE.Mesh(t.spanker, this.tornSail.material()), new THREE.Mesh(t.spankerGaff, t.palette.wood));
    this.spankerRig = new THREE.Group();
    this.spankerRig.add(new THREE.Mesh(t.spankerBoom, t.palette.wood), this.hoist);
    this.spankerRig.position.set(0, L.spankerBoomY, L.mizzenMast.z);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 1.2, L.hull.stationAt(-1).z - 0.05);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);
    this.spritFlag = new WavingFlag(t.flagMaterial, L.spritFlag.length, L.spritFlag.height);
    this.spritFlag.mesh.position.copy(L.spritMast.top);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.spankerRig, this.rudder, this.wheel, this.flag.mesh, this.spritFlag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.flag.dispose();
    this.spritFlag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.sails.length = 0;
    this.yards.length = 0;
    this.jibs.length = 0;
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; focs et brigantine réduits. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.sails) sail.scale.set(this.sailWidth, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = this.sailWidth;
    this.hoist.scale.set(this.leeSide, hoisted, 1);
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
  }
}
