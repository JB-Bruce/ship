import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { galleassLamps } from './galleassLamps';
import type { Waterline } from '../parts/hullShape';
import { GALLEASS_BOW, SAIL_BILLOW, type Livery, type ShipStats, HELM_WHEEL } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { OarBank } from '../parts/oarBank';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { BATTERY_Y, DECK_Y, galleassArmament, galleassLayout, OAR, TRIPLE_Y, type GalleassLayout } from './galleassLayout';
import { galleassTemplateFor, TRIPLE_MUZZLES, type GalleassTemplate } from './galleassTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.45;
/** Allongement des voiles latines (le long de leur vergue) par niveau de voilure. */
const SAIL_GROWTH = 0.05;
/** Grand-voile (index dans lateens) : la plus grande voile, qui porte l'emblème de la livrée. */
const MAIN_SAIL = 1;
/** Bouches : fût dans un sabord (pivot au sabord), pièce sur affût. */
const PORT_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts du pont par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;
/** Écart des voiles latines par rapport à leur mât (m) : elles pendent du côté sous le vent. */
const LATEEN_OFFSET = 0.26;
/** Ouverture des vergues latines : au près, et en plus au vent arrière (rad). */
const LATEEN_OPENING = { closeHauled: 0.1, running: 0.6 };

/**
 * Galéasse : grande galère longue et basse, château de poupe sous un tendelet aux couleurs du camp, château avant à face
 * plate, éperon ; trois mâts à voiles latines qui pivotent selon le vent. Batterie dans le bordé (4 par bord, jusqu'à 6 ;
 * 7 grande galéasse, 8 galéasse capitane) au-dessus des avirons, pièces du pont sur affût derrière les sabords du pavois
 * (autant), et à la proue (canons de chasse, GALLEASS_BOW) deux triples canons dans la face du château avant et deux
 * pièces légères sur son dessus. Avirons sortis par vent de face (setOars). Allongée (setExtension), elle est
 * reconstruite sur le plan long : canons, renfort, voilure, avirons, dégâts et pavillon sont remis en place.
 */
export class GalleassModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 22;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: GalleassLayout;
  private template!: GalleassTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  /** Gréements latins (vergue + voile), qui pivotent autour de leur mât selon le vent, leurs repères de vergue et leurs voiles. */
  private lateenRigs: THREE.Group[] = [];
  private yardFrames: THREE.Group[] = [];
  private lateens: THREE.Mesh[] = [];
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private oars!: OarBank;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLength = 1;
  /** Côté sous le vent : +1 bâbord, -1 tribord. */
  private leeSide = 1;
  private yardTarget = 0;
  // État remis en place quand le navire est reconstruit (allongement).
  private perSide: number;
  private chase: number;
  private oarsOut = 0;
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
    this.chase = stats.chaseGuns ?? 0;
    this.root.add(this.body);
    this.build(galleassLayout(0));
  }

  /** Allongements (0 à 2) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = galleassLayout(level);
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
    this.sailLength = 1 + SAIL_GROWTH * level;
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = -rudder * HELM_WHEEL.turns;
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

  /**
   * Batterie (fûts dans les sabords du bordé), pièces du pont (sur affût derrière les sabords du pavois), puis les
   * canons de chasse : d'abord les triples canons dans la face du château avant (calibre de la batterie, une salve d'un
   * boulet par fût), puis les pièces légères sur son dessus (second calibre), chacun avec son angle de tir.
   */
  setCannons(perSide: number, chase = 0) {
    this.perSide = perSide;
    this.chase = chase;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    const L = this.layout;
    const { hull, bow } = L;
    const t = this.template;
    const { battery, deck } = galleassArmament(perSide, L);
    const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const gun = new THREE.Mesh(geometry, t.palette.metal);
      gun.position.set(x, y, z);
      this.body.add(gun);
      return gun;
    };
    for (const u of L.batterySlots.slice(0, battery)) {
      const s = L.station(u);
      const y = BATTERY_Y + L.sheer(u);
      for (const side of [1, -1] as const) this.cannons.push(cannonMount(add(t.batteryGun, side * hull.halfWidthAt(s, y) * 0.99, y, s.z), (side * Math.PI) / 2, PORT_MUZZLE));
    }
    for (const u of L.deckSlots.slice(0, deck)) {
      const s = L.station(u);
      for (const side of [1, -1] as const) {
        const x = side * (hull.halfWidthAt(s, DECK_Y) - DECK_GUN_INSET);
        this.cannons.push(cannonMount(add(t.deckGun, x, DECK_Y, s.z), (side * Math.PI) / 2, DECK_MUZZLE, 'deck'));
      }
    }
    const triples = Math.min(chase, GALLEASS_BOW.triples, bow.triples.length);
    for (const x of bow.triples.slice(0, triples)) {
      const mount = cannonMount(add(t.tripleGun, x, TRIPLE_Y, bow.z - 0.05), 0, PORT_MUZZLE);
      this.cannons.push({ ...mount, barrels: TRIPLE_MUZZLES, reloadFactor: GALLEASS_BOW.tripleReload, arcHalfAngle: GALLEASS_BOW.tripleArc });
    }
    for (const { x, z } of bow.pieces.slice(0, Math.max(0, chase - triples))) {
      const mount = cannonMount(add(t.deckGun, x, L.forecastle.y, z), 0, DECK_MUZZLE, 'deck');
      this.cannons.push({ ...mount, arcHalfAngle: GALLEASS_BOW.pieceArc });
    }
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.flag.update(dt);
    for (const rig of this.lateenRigs) {
      rig.rotation.y = damp(rig.rotation.y, this.yardTarget, 1.1, dt);
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, gouvernail, pavillon, avirons, canons. */
  private build(L: GalleassLayout) {
    this.layout = L;
    const t = (this.template = galleassTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    // La vergue latine d'artimon passe au-dessus du château de poupe : le drapeau de rang flotte en tête d'artimon.
    this.ensignStaff = mastheadStaff(L.mizzenMast.z, L.mizzenMast.top);
    // Château de poupe, milieu, château avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.85, 0.3, L.sternDeck.y],
        [-0.45, -0.4, DECK_Y],
        [-0.1, 0.4, DECK_Y],
        [0.25, -0.4, DECK_Y],
        [0.5, 0.35, DECK_Y],
        [0.8, -0.3, L.forecastle.y],
        [-0.2, 1, 1.8],
        [0.3, -1, 1.8],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(galleassLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];

    // Voiles latines : couchées sur leur vergue (repère de la vergue posé au bout bas), dans un gréement qui tourne autour du mât.
    this.lateenRigs = [];
    this.yardFrames = [];
    this.lateens = [];
    L.lateens.forEach((l, i) => {
      const parts = t.lateens[i];
      const yardFrame = new THREE.Group();
      yardFrame.position.copy(l.sail.tack);
      yardFrame.rotation.x = parts.pitch;
      const sail = new THREE.Mesh(parts.sail, this.tornSail.material(parts.sail, 'x', i === MAIN_SAIL, SAIL_BILLOW.aftSailCurve));
      sail.position.x = LATEEN_OFFSET;
      yardFrame.add(sail, new THREE.Mesh(parts.yard, t.palette.wood));
      const rig = new THREE.Group();
      rig.add(yardFrame);
      rig.position.set(0, l.yardY, l.mast.z);
      rig.rotation.y = this.yardTarget;
      rig.scale.x = this.leeSide;
      this.lateenRigs.push(rig);
      this.yardFrames.push(yardFrame);
      this.lateens.push(sail);
      this.body.add(rig);
    });

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    // Sur l'étambot, sous la poupe ronde.
    this.rudder.position.set(0, 1.5, L.hull.stationAt(-1).z - 0.04);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);
    this.oars = new OarBank(L.hull, L.oarZs, OAR, t.oar, t.palette);
    this.oars.setOut(this.oarsOut);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.rudder, this.wheel, this.flag.mesh, this.oars.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide, this.chase);
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
    this.oars.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.lateenRigs = [];
    this.yardFrames = [];
    this.lateens = [];
  }

  /** Voiles latines carguées contre leur vergue (en Y), et allongées avec la voilure (vergue comprise, le long de Z). */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.lateens) sail.scale.set(1, hoisted, 1);
    for (const frame of this.yardFrames) frame.scale.z = this.sailLength;
  }
}
