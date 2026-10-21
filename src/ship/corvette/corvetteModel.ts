import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { corvetteLamps } from './corvetteLamps';
import { Staysails } from '../parts/staysails';
import type { Waterline } from '../parts/hullShape';
import { SAIL_BILLOW, type Livery, type ShipStats, HELM_WHEEL } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { DeckPlan } from '../deckPlan';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { BATTERY_Y, corvetteArmament, corvetteLayout, DECK_Y, MAIN_COURSE, type CorvetteLayout } from './corvetteLayout';
import { corvetteTemplateFor, type CorvetteTemplate } from './corvetteTemplate';

const { damp } = THREE.MathUtils;
const RUDDER_MAX_ANGLE = 0.5;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.08;
/** Bouche des canons : fût de batterie (pivot au sabord), canon sur affût du pont. */
const BATTERY_MUZZLE = new THREE.Vector3(0.8, 0, 0);
const DECK_MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts du pont par rapport au bordé : la bouche sort par les sabords du pavois. */
const DECK_GUN_INSET = 0.62;

/**
 * Corvette : château arrière haut, gaillard d'avant, pont principal bas au milieu ; trois-mâts mixte (misaine et grand
 * mât à voiles carrées, artimon à voile aurique qui suit le vent), batterie couverte de canons lourds dans le bordé
 * (4 par bord, 6 allongée), et canons légers achetables sur le pont, derrière le pavois. Allongée (setExtension), elle
 * est reconstruite sur le plan long : canons, renfort, voilure, dégâts et pavillon sont remis en place.
 */
export class CorvetteModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 22;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: CorvetteLayout;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  /** Voiles d'étai entre les mâts (parts/staysails.ts), recréées avec le modèle. */
  private staysails!: Staysails;
  private tornSail!: TornSail;
  private readonly sails: THREE.Mesh[] = [];
  private readonly yards: THREE.Mesh[] = [];
  private readonly jibs: THREE.Mesh[] = [];
  /** Gréement de l'artimon (bôme + voile + corne), qui pivote selon le vent ; `hoist` porte la voile et la corne. */
  private mizzenRig!: THREE.Group;
  private hoist!: THREE.Group;
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private template!: CorvetteTemplate;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Niveau de voilure : les voiles d'étai se débloquent avec lui. */
  private sailLevel = 0;
  /** Côté sous le vent (+1 bâbord, -1 tribord) : focs et brigantine se creusent de ce côté. */
  private leeSide = 1;
  private boomTarget = 0;
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
    this.build(corvetteLayout(0));
  }

  /** Allongement (0 ou 1) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = corvetteLayout(level);
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

  /** La bôme d'artimon part du côté où va le vent : presque dans l'axe au près, très ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
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

  /** Canons de la batterie couverte (fûts dans les sabords du bordé), puis canons légers du pont, sur affût derrière le pavois. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    const L = this.layout;
    const t = this.template;
    const { battery, deck } = corvetteArmament(perSide, L);
    const mount = (u: number, onDeck: boolean) => {
      const s = L.station(u);
      for (const side of [1, -1] as const) {
        const gun = new THREE.Mesh(onDeck ? t.deckGun : t.batteryGun, t.palette.metal);
        if (onDeck) gun.position.set(side * (s.halfWidth - DECK_GUN_INSET), DECK_Y, s.z);
        else gun.position.set(side * s.halfWidth * 0.99, BATTERY_Y, s.z);
        this.body.add(gun);
        this.cannons.push(cannonMount(gun, (side * Math.PI) / 2, onDeck ? DECK_MUZZLE : BATTERY_MUZZLE, onDeck ? 'deck' : 'main'));
      }
    };
    for (let k = 0; k < battery; k++) mount(L.batterySlots[k], false);
    for (let k = 0; k < deck; k++) mount(L.deckSlots[k], true);
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.staysails.apply(this.sailAmount, this.leeSide);
    this.flag.update(dt);
    this.mizzenRig.rotation.y = damp(this.mizzenRig.rotation.y, this.boomTarget, 1.2, dt);
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, gouvernail, pavillon, canons. */
  private build(L: CorvetteLayout) {
    this.layout = L;
    const t = (this.template = corvetteTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    this.ensignStaff = mastheadStaff(L.mizzenMast.z, L.mizzenMast.top);
    // Château arrière, pont principal, gaillard d'avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.72, 0.35, L.quarterdeck.y],
        [-0.3, -0.4, DECK_Y],
        [0.05, 0.4, DECK_Y],
        [0.35, -0.3, DECK_Y],
        [0.78, 0.2, L.forecastle.y],
        [-0.15, 1, 0.6],
        [0.4, -1, 0.6],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(corvetteLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];
    this.staysails = new Staysails(this.tornSail, [L.foreMast, L.mainMast]);
    this.body.add(this.staysails.group);
    this.staysails.setLevel(this.sailLevel);

    L.squareSails.forEach((s, i) => {
      // La grand-voile (la plus grande) porte l'emblème de la livrée, s'il y en a un.
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material(t.squareSails[i], 'z', i === MAIN_COURSE));
      sail.position.set(0, s.yardY, s.mastZ + 0.22);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.1);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    L.jibs.forEach((j, i) => {
      const jib = new THREE.Mesh(t.jibs[i], this.tornSail.material(t.jibs[i], 'x'));
      jib.position.copy(j.tack);
      this.jibs.push(jib);
      this.body.add(jib);
    });
    this.hoist = new THREE.Group();
    this.hoist.add(new THREE.Mesh(t.mizzenSail, this.tornSail.material(t.mizzenSail, 'x', false, SAIL_BILLOW.aftSailCurve)), new THREE.Mesh(t.mizzenGaff, t.palette.wood));
    this.mizzenRig = new THREE.Group();
    this.mizzenRig.add(new THREE.Mesh(t.mizzenBoom, t.palette.wood), this.hoist);
    this.mizzenRig.position.set(0, L.mizzenBoomY, L.mizzenMast.z);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 1, L.hull.stationAt(-1).z - 0.04);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.mizzenRig, this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
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
    this.sails.length = 0;
    this.yards.length = 0;
    this.jibs.length = 0;
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; focs et brigantine réduits. */
  private applySails() {
    this.staysails.apply(this.sailAmount, this.leeSide);
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.sails) sail.scale.set(this.sailWidth, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = this.sailWidth;
    this.hoist.scale.set(this.leeSide, hoisted, 1);
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
  }
}
