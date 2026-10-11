import * as THREE from 'three';
import type { Livery, ShipStats } from '../../config';
import { RENDER_ORDER } from '../../utils/renderOrder';
import { armorFor, cannonMount, fireSpots, riggingMaterial, sternStaff, waterMaskMaterial, WavingFlag } from '../parts/common';
import { TornSail } from '../parts/tornSail';
import type { DeckPlan } from '../deckPlan';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { brigantineLayout, DECK_Y, MAIN_COURSE, type BrigantineLayout } from './brigantineLayout';
import { brigantineTemplateFor, type BrigantineTemplate } from './brigantineTemplate';

const RUDDER_MAX_ANGLE = 0.5;
/** Tours de roue pour un coup de barre complet (rad). */
const WHEEL_TURNS = 2.6;
/**
 * Élargissement des voiles carrées par niveau de voilure (en largeur seulement), jusqu'au niveau SAIL_WIDE_LEVELS ; au-delà
 * (niveaux du brigantin allongé), la toile est surtout mieux taillée : elle ne s'élargit presque plus.
 */
const SAIL_GROWTH = 0.08;
const SAIL_WIDE_LEVELS = 3;
const SAIL_LATE_GROWTH = 0.02;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts par rapport au bordé : la bouche des fûts sort par les sabords. */
const GUN_INSET = 0.62;

/**
 * Brigantin : château arrière (deux canons à l'abri à l'intérieur, fenêtres, roue de gouvernail), gaillard d'avant
 * surélevé, deux mâts à voiles carrées avec hunes, deux focs sur le beaupré. Allongé (setExtension), il est reconstruit
 * sur le plan long (un canon de plus au milieu, un sous le gaillard d'avant) : canons, renfort, voilure, dégâts et
 * pavillon sont remis en place.
 */
export class BrigantineModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 17.5;
  waterline!: readonly number[];
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  deckPlan!: DeckPlan;
  private layout!: BrigantineLayout;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private readonly sails: THREE.Mesh[] = [];
  private readonly yards: THREE.Mesh[] = [];
  private readonly jibs: THREE.Mesh[] = [];
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private template!: BrigantineTemplate;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailWidth = 1;
  /** Côté sous le vent (+1 bâbord, -1 tribord) : les focs se creusent de ce côté. */
  private leeSide = 1;
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
    this.build(brigantineLayout(0));
  }

  /** Allongement (0 ou 1) : reconstruit le navire sur le plan correspondant. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = brigantineLayout(level);
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
    this.sailWidth = 1 + SAIL_GROWTH * Math.min(level, SAIL_WIDE_LEVELS) + SAIL_LATE_GROWTH * Math.max(0, level - SAIL_WIDE_LEVELS);
    this.applySails();
  }

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = rudder * WHEEL_TURNS;
  }

  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, les focs ne changent pas de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Les `perSide` premiers emplacements de chaque bord : château arrière, avant, pont principal, sous le gaillard d'avant. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    for (const u of this.layout.gunSlots.slice(0, perSide)) {
      const s = this.layout.station(u);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(this.template.cannon, this.template.palette.metal);
        cannon.position.set(side * (s.halfWidth - GUN_INSET), DECK_Y, s.z);
        this.body.add(cannon);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
  }

  animate(dt: number) {
    this.flag.update(dt);
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
  private build(L: BrigantineLayout) {
    this.layout = L;
    const t = (this.template = brigantineTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    this.flagMount = { position: new THREE.Vector3(0, L.flag.y, L.mainMast.z), length: L.flag.length, height: L.flag.height };
    this.ensignStaff = sternStaff(L.hull.stationAt(-1), 1.6);
    // Château arrière, pont principal, gaillard d'avant, et deux brèches dans le bordé (u de base).
    this.fireSpots = fireSpots(
      L.hull,
      ([
        [-0.75, 0.4, L.quarterdeck.y],
        [-0.2, -0.45, DECK_Y],
        [0.1, 0.45, DECK_Y],
        [0.3, -0.2, DECK_Y],
        [0.7, 0.3, L.forecastle.y],
        [-0.1, 1, 0.6],
        [0.55, -1, 0.6],
      ] as const).map(([u, side, y]) => [L.base(u), side, y] as const),
    );
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    for (const { geometry, material } of t.statics) this.body.add(new THREE.Mesh(geometry, material));

    L.squareSails.forEach((s, i) => {
      // La grand-voile (la plus grande) porte l'emblème de la livrée, s'il y en a un.
      const sail = new THREE.Mesh(t.squareSails[i], this.tornSail.material('z', i === MAIN_COURSE ? t.squareSails[i] : undefined));
      sail.position.set(0, s.yardY, s.mastZ + 0.2);
      const yard = new THREE.Mesh(t.yards[i], t.palette.wood);
      yard.position.set(0, s.yardY, s.mastZ + 0.1);
      this.sails.push(sail);
      this.yards.push(yard);
      this.body.add(sail, yard);
    });
    L.jibs.forEach((j, i) => {
      const jib = new THREE.Mesh(t.jibs[i], this.tornSail.material('x'));
      jib.position.copy(j.tack);
      this.jibs.push(jib);
      this.body.add(jib);
    });

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 0.8, L.hull.stationAt(-1).z - 0.04);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, L.flag.y + this.flagLift, L.mainMast.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
    this.armor = null;
    this.setCannons(this.perSide);
    this.setArmorLevel(this.armorLevel);
    this.tornSail.setDamage(this.damage);
    this.applySails();
  }

  /** Défait ce qui est propre à cette instance (le gabarit, partagé, reste en cache). */
  private disposeParts() {
    this.flag.dispose();
    this.tornSail.dispose();
    this.body.clear();
    this.cannons.length = 0;
    this.sails.length = 0;
    this.yards.length = 0;
    this.jibs.length = 0;
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; focs enroulés vers le beaupré. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    for (const sail of this.sails) sail.scale.set(this.sailWidth, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = this.sailWidth;
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
  }
}
