import * as THREE from 'three';
import type { Waterline } from '../parts/hullShape';
import type { Livery, ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { DECK_Y, RAKE, schoonerLayout, type SchoonerLayout } from './schoonerLayout';
import { BOOM_HEIGHT, FLAG, MAIN_TOPSAIL, schoonerTemplateFor, TOPSAIL, type SchoonerTemplate } from './schoonerTemplate';

const RUDDER_MAX_ANGLE = 0.55;
/** Allongement des bômes et des voiles auriques par niveau de voilure (en longueur seulement). */
const SAIL_GROWTH = 0.06;
/** Élargissement du hunier par niveau de voilure. */
const TOPSAIL_GROWTH = 0.05;
const GUN_INSET = 0.62;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
const { damp } = THREE.MathUtils;

/** Un gréement aurique (bôme, voile, corne) qui pivote autour de son mât incliné ; `hoist` porte la voile et la corne. */
interface GaffRig {
  rig: THREE.Group;
  hoist: THREE.Group;
}

/**
 * Goélette : coque longue et basse, pont ras, deux mâts inclinés vers l'arrière portant chacun une voile aurique qui
 * pivote selon le vent (et une flèche au-dessus de la grand-voile), deux focs sur un long beaupré, canons sur affût le
 * long du pont. Goélette à hunier (setExtension) : reconstruite sur le plan rallongé, avec une voile carrée en tête du
 * mât de misaine ; canons, renfort, voilure, dégâts et pavillon sont remis en place.
 */
export class SchoonerModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 14.8;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: SchoonerLayout;
  private template!: SchoonerTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private rigs: GaffRig[] = [];
  private jibs: THREE.Mesh[] = [];
  private topsail!: THREE.Mesh;
  private rudder!: THREE.Mesh;
  private flag!: WavingFlag;
  private gunports: THREE.Mesh[] = [];
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent : +1 bâbord, -1 tribord (où les bômes sont poussées). */
  private leeSide = 1;
  private boomTarget = 0;
  // État remis en place quand le navire est reconstruit (goélette à hunier).
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
    this.build(schoonerLayout(0));
  }

  /** Goélette à hunier (1) : reconstruit le navire sur le plan rallongé, avec son hunier. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = schoonerLayout(level);
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

  /** Les bômes partent du côté où va le vent : presque dans l'axe au près, largement ouvertes au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, les bômes ne passent pas d'un bord à l'autre sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    const opening = 0.12 + 1.1 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI);
    this.boomTarget = -this.leeSide * opening;
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Canons sur affût, tirant par des sabords répartis régulièrement le long de chaque bord. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    const { hull, gunZone } = this.layout;
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
        port.position.set(side * (s.halfWidth + 0.02), DECK_Y + 0.35, s.z);
        this.body.add(cannon, port);
        this.gunports.push(port);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
    for (const { rig, hoist } of this.rigs) {
      rig.rotation.y = damp(rig.rotation.y, this.boomTarget, 1.2, dt);
      hoist.scale.x = this.leeSide;
    }
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), gréements, focs, hunier, gouvernail, pavillon, canons. */
  private build(L: SchoonerLayout) {
    this.layout = L;
    const t = (this.template = schoonerTemplateFor(L, this.livery));
    const extended = L !== schoonerLayout(0);
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.mainTop.y + 0.1, L.mainTop.z), length: FLAG.length, height: FLAG.height };
    // La bôme de la grand-voile passe au-dessus de la poupe : le drapeau de rang flotte en tête de misaine.
    this.ensignStaff = mastheadStaff(L.foreTop.z, L.foreTop.y);
    this.fireSpots = fireSpots(L.hull, [
      [-0.7, 0.3, DECK_Y],
      [-0.2, -0.4, DECK_Y],
      [0.45, 0.3, DECK_Y],
      [0.75, -0.2, DECK_Y],
      [0.1, 1, 0.45],
      [-0.5, -1, 0.45],
    ]);
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lanterns = addStatics(this.body, t.statics);

    // Grand-voile (elle porte l'emblème de la livrée, s'il y en a un) et sa flèche, puis la misaine.
    const main = this.gaffRig(L.mainMastZ, t.mainBoom, t.mainSail, t.mainGaff, true);
    const gaffTopsail = new THREE.Mesh(t.mainTopsail, this.tornSail.material(t.mainTopsail, 'x'));
    gaffTopsail.position.copy(MAIN_TOPSAIL.tack);
    main.hoist.add(gaffTopsail);
    this.rigs = [main, this.gaffRig(L.foreMastZ, t.foreBoom, t.foreSail, t.foreGaff, false)];
    this.jibs = t.jibs.map((geometry, i) => {
      const jib = new THREE.Mesh(geometry, this.tornSail.material(geometry, 'x'));
      jib.position.copy(L.jibs[i].tack);
      this.body.add(jib);
      return jib;
    });

    // Hunier (goélette à hunier), sur le mât de misaine incliné.
    const foremast = new THREE.Group();
    foremast.position.set(0, DECK_Y, L.foreMastZ);
    foremast.rotation.x = -RAKE;
    this.topsail = new THREE.Mesh(t.topsail, this.tornSail.material(t.topsail, 'z'));
    this.topsail.position.set(0, TOPSAIL.along, 0.2);
    const yard = new THREE.Mesh(t.topsailYard, t.palette.wood);
    yard.position.set(0, TOPSAIL.along, 0.1);
    foremast.add(this.topsail, yard);
    foremast.visible = extended;

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.85, L.hull.stationAt(-1).z - 0.04);
    this.flag = new WavingFlag(t.flagMaterial, FLAG.length, FLAG.height);
    this.flag.mesh.position.set(0, this.flagMount.position.y + this.flagLift, this.flagMount.position.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(foremast, this.rudder, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.tornSail.setDeployment(this.sailAmount);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.gunports.length = 0;
    this.rigs = [];
    this.jibs = [];
  }

  /** Un gréement aurique sur le mât incliné posé en `mastZ` : bôme, et la partie hissée (voile + corne). */
  private gaffRig(mastZ: number, boom: THREE.BufferGeometry, sail: THREE.BufferGeometry, gaff: THREE.BufferGeometry, emblem: boolean): GaffRig {
    const t = this.template;
    const tilt = new THREE.Group();
    tilt.position.set(0, DECK_Y, mastZ);
    tilt.rotation.x = -RAKE;
    const rig = new THREE.Group();
    rig.position.y = BOOM_HEIGHT;
    rig.rotation.y = this.boomTarget;
    const hoist = new THREE.Group();
    hoist.add(new THREE.Mesh(sail, this.tornSail.material(sail, 'x', emblem)), new THREE.Mesh(gaff, t.palette.wood));
    rig.add(new THREE.Mesh(boom, t.palette.wood), hoist);
    tilt.add(rig);
    this.body.add(tilt);
    return { rig, hoist };
  }

  /** Voiles hissées (cran de voile) et agrandies (niveau de voilure) ; focs enroulés vers le beaupré. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const { rig, hoist } of this.rigs) {
      rig.scale.z = 1 + SAIL_GROWTH * this.sailLevel;
      hoist.scale.set(this.leeSide, hoisted, 1);
    }
    this.topsail.scale.set(1 + TOPSAIL_GROWTH * this.sailLevel, hoisted, 1);
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
  }
}
