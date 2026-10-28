import * as THREE from 'three';
import { ShipLamps } from '../parts/shipLamps';
import { senauLamps } from './senauLamps';
import type { Waterline } from '../parts/hullShape';
import { HELM_WHEEL, SAIL_BILLOW, type Livery, type ShipStats } from '../../config';
import { wrapAngle } from '../../utils/math';
import { RENDER_ORDER } from '../../utils/renderOrder';
import type { DeckPlan } from '../deckPlan';
import { armorFor, cannonMount, fireSpots, mastheadStaff, riggingMaterial, waterMaskMaterial, WavingFlag } from '../parts/common';
import { addStatics, type LanternSpot } from '../parts/nightGlow';
import { TornSail } from '../parts/tornSail';
import type { CannonMount, EnsignStaff, FlagMount, ShipModel } from '../shipModel';
import { alongMast, DECK_Y, QUARTERDECK, RAKE, senauLayout, type SenauLayout, type SenauMast } from './senauLayout';
import { senauTemplateFor, type SenauTemplate } from './senauTemplate';

const RUDDER_MAX_ANGLE = 0.5;
/** Élargissement des voiles carrées par niveau de voilure (en largeur seulement). */
const SAIL_GROWTH = 0.06;
/** Allongement de la bôme et de la voile de senau par niveau de voilure. */
const SPANKER_GROWTH = 0.04;
const MUZZLE = new THREE.Vector3(1, 0.38, 0);
/** Retrait des affûts par rapport au bordé : la bouche des fûts sort par les sabords. */
const GUN_INSET = 0.62;
const { damp } = THREE.MathUtils;

/**
 * Senau : coque haute à petit gaillard d'arrière et poupe à galerie, chaloupe sur le pont ; deux mâts inclinés vers
 * l'arrière à quatre voiles carrées ; la voile de senau (aurique), dont la bôme déborde de la poupe et pivote selon le
 * vent, sur un mât fin planté juste derrière le grand mât ; trois focs sur un long bout-dehors, figure de proue. Tous
 * les canons sur affût derrière les sabords du pont. Grand senau (setExtension) : reconstruit sur le plan rallongé,
 * tout est remis en place.
 */
export class SenauModel implements ShipModel {
  readonly root = new THREE.Group();
  readonly cannons: CannonMount[] = [];
  readonly barHeight = 23.5;
  waterline!: Waterline;
  flagMount!: FlagMount;
  ensignStaff!: EnsignStaff;
  fireSpots!: THREE.Vector3[];
  lanterns!: LanternSpot[];
  deckPlan!: DeckPlan;
  private layout!: SenauLayout;
  private template!: SenauTemplate;
  /** Tout le navire (le plan courant) ; les drapeaux de rang et les trophées sont posés à côté, sur `root`. */
  private readonly body = new THREE.Group();
  private tornSail!: TornSail;
  private sails: THREE.Mesh[] = [];
  private yards: THREE.Mesh[] = [];
  private jibs: THREE.Mesh[] = [];
  /** Gréement de la voile de senau (bôme + voile + corne), qui pivote autour du mât de senau ; `hoist` porte la voile et la corne. */
  private spankerRig!: THREE.Group;
  private hoist!: THREE.Group;
  private rudder!: THREE.Mesh;
  private wheel!: THREE.Mesh;
  private flag!: WavingFlag;
  private armor: THREE.Mesh | null = null;
  private sailAmount = 0;
  private sailLevel = 0;
  /** Côté sous le vent (+1 bâbord, -1 tribord) : focs et voile de senau se creusent de ce côté. */
  private leeSide = 1;
  private boomTarget = 0;
  // État remis en place quand le navire est reconstruit (allongement).
  private perSide: number;
  private armorLevel = 0;
  private damage = 0;
  private flagLift = 0;
  /** Lanternes de hune, appliques et lanternes de potence (parts/shipLamps.ts), recréées avec le modèle. */
  private lamps!: ShipLamps;

  constructor(
    stats: ShipStats,
    private readonly livery: Livery,
  ) {
    this.perSide = stats.cannonsPerSide;
    this.root.add(this.body);
    this.build(senauLayout(0));
  }

  /** Grand senau (1) : reconstruit le navire sur le plan rallongé. Renvoie true s'il a changé. */
  setExtension(level: number): boolean {
    const layout = senauLayout(level);
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

  /** Le safran suit la barre, et la roue tourne avec. */
  setRudder(rudder: number) {
    this.rudder.rotation.y = -rudder * RUDDER_MAX_ANGLE;
    this.wheel.rotation.z = -rudder * HELM_WHEEL.turns;
  }

  /** La bôme de la voile de senau part du côté où va le vent : presque dans l'axe au près, très ouverte au vent arrière. */
  setWind(relativeDirection: number, strength: number) {
    this.flag.setWind(relativeDirection, strength);
    this.tornSail.setWind(relativeDirection, strength);
    const s = Math.sin(relativeDirection);
    // Hystérésis : au vent arrière pile, rien ne change de bord sans arrêt.
    if (s > 0.15) this.leeSide = 1;
    else if (s < -0.15) this.leeSide = -1;
    this.boomTarget = -this.leeSide * (0.12 + 1.05 * (1 - Math.abs(wrapAngle(relativeDirection)) / Math.PI));
  }

  setArmorLevel(level: number) {
    this.armorLevel = level;
    if (this.armor) this.body.remove(this.armor);
    this.armor = null;
    const armor = armorFor(this.layout.hull, level);
    if (armor) this.body.add((this.armor = new THREE.Mesh(armor.geometry, armor.material)));
  }

  /** Les `perSide` premiers sabords de chaque bord dans l'ordre d'achat (d'abord le milieu), canons sur affût. */
  setCannons(perSide: number) {
    this.perSide = perSide;
    const { hull, gunSlots } = this.layout;
    const t = this.template;
    for (const { object } of this.cannons) this.body.remove(object);
    this.cannons.length = 0;
    for (const z of gunSlots.slice(0, perSide)) {
      const s = hull.stationAt(z / hull.halfLength);
      for (const side of [1, -1] as const) {
        const cannon = new THREE.Mesh(t.cannon, t.palette.metal);
        cannon.position.set(side * (hull.halfWidthAt(s, DECK_Y) - GUN_INSET), DECK_Y, z);
        this.body.add(cannon);
        this.cannons.push(cannonMount(cannon, (side * Math.PI) / 2, MUZZLE));
      }
    }
  }

  animate(dt: number) {
    this.lamps.animate(dt, this.root);
    this.flag.update(dt);
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

  /** Construit le navire sur un plan : coque et décor (gabarit partagé), voiles, gouvernail, pavillon, canons. */
  private build(L: SenauLayout) {
    this.layout = L;
    const t = (this.template = senauTemplateFor(L, this.livery));
    this.waterline = L.hull.waterlineProfile();
    this.deckPlan = L.deck;
    const mainCap = alongMast(L.mainMast, L.mainMast.length);
    this.flagMount = { position: new THREE.Vector3(0, mainCap.y + 0.1, mainCap.z), length: L.flag.length, height: L.flag.height };
    // La bôme de la voile de senau passe au-dessus de la poupe : le drapeau de rang flotte en tête de misaine.
    const foreCap = alongMast(L.foreMast, L.foreMast.length);
    this.ensignStaff = mastheadStaff(foreCap.z, foreCap.y);
    this.fireSpots = fireSpots(L.hull, [
      [-0.75, 0.4, QUARTERDECK.y],
      [-0.3, -0.4, DECK_Y],
      [0.1, 0.4, DECK_Y],
      [0.6, -0.3, DECK_Y],
      [-0.1, 1, 1.2],
      [0.45, -1, 1.2],
    ]);
    this.tornSail = new TornSail(t.sailMaterial, this.livery.sailEmblem);
    this.lamps = new ShipLamps(senauLamps(L), t.palette);
    this.body.add(this.lamps.object);
    this.lanterns = [...addStatics(this.body, t.statics), ...this.lamps.lanterns];

    // Voiles carrées ; la basse voile du grand mât (la plus grande) porte l'emblème de la livrée.
    this.sails = [];
    this.yards = [];
    [L.foreMast, L.mainMast].forEach((mast, m) => {
      const frame = this.mastFrame(mast);
      mast.sails.forEach((s, i) => {
        const geometry = t.squareSails[m][i];
        const sail = new THREE.Mesh(geometry, this.tornSail.material(geometry, 'z', m === 1 && i === 0));
        sail.position.set(0, s.along, 0.28);
        const yard = new THREE.Mesh(t.yards[m][i], t.palette.wood);
        yard.position.set(0, s.along, 0.14);
        frame.add(sail, yard);
        this.sails.push(sail);
        this.yards.push(yard);
      });
    });
    this.jibs = L.jibs.map((j, i) => {
      const jib = new THREE.Mesh(t.jibs[i], this.tornSail.material(t.jibs[i], 'x'));
      jib.position.copy(j.tack);
      this.body.add(jib);
      return jib;
    });
    // Voile de senau : elle pivote autour du mât de senau, à la hauteur de sa bôme.
    this.hoist = new THREE.Group();
    this.hoist.add(new THREE.Mesh(t.spanker, this.tornSail.material(t.spanker, 'x', false, SAIL_BILLOW.aftSailCurve)), new THREE.Mesh(t.gaff, t.palette.wood));
    this.spankerRig = new THREE.Group();
    this.spankerRig.add(new THREE.Mesh(t.boom, t.palette.wood), this.hoist);
    this.spankerRig.position.y = L.boomAlong;
    this.spankerRig.rotation.y = this.boomTarget;
    this.mastFrame(L.senauMast).add(this.spankerRig);

    this.rudder = new THREE.Mesh(t.rudder, t.palette.trim);
    this.rudder.position.set(0, 1.1, L.hull.stationAt(-1).z - 0.04);
    this.wheel = new THREE.Mesh(t.wheel, t.palette.wood);
    this.wheel.position.set(0, L.wheel.y, L.wheel.z);
    this.flag = new WavingFlag(t.flagMaterial, L.flag.length, L.flag.height);
    this.flag.mesh.position.set(0, this.flagMount.position.y + this.flagLift, this.flagMount.position.z);

    const waterMask = new THREE.Mesh(t.waterMask, waterMaskMaterial);
    waterMask.renderOrder = RENDER_ORDER.waterMask;
    this.body.add(this.rudder, this.wheel, this.flag.mesh, new THREE.LineSegments(t.rigging, riggingMaterial), waterMask);
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
    this.sails = [];
    this.yards = [];
    this.jibs = [];
  }

  /** Repère d'un mât incliné vers l'arrière (Y le long du mât), posé sur son pont. */
  private mastFrame(mast: SenauMast): THREE.Group {
    const frame = new THREE.Group();
    frame.position.set(0, mast.base, mast.z);
    frame.rotation.x = -RAKE;
    this.body.add(frame);
    return frame;
  }

  /** Voiles carrées carguées vers leur vergue (et élargies avec la voilure) ; focs et voile de senau réduits. */
  private applySails() {
    const hoisted = 0.1 + 0.9 * this.sailAmount;
    const width = 1 + SAIL_GROWTH * this.sailLevel;
    for (const sail of this.sails) sail.scale.set(width, hoisted, 1);
    for (const yard of this.yards) yard.scale.x = width;
    this.spankerRig.scale.z = 1 + SPANKER_GROWTH * this.sailLevel;
    this.hoist.scale.set(this.leeSide, hoisted, 1);
    const jib = 0.15 + 0.85 * this.sailAmount;
    for (const j of this.jibs) j.scale.set(jib * this.leeSide, jib, jib);
  }
}
