import * as THREE from 'three';
import { SHIP_LAMPS } from '../../config';
import { tf } from '../../utils/geometryBatch';
import { LANTERN_PARTS, LANTERN_TOP, yawOf, type HangingLamp, type LampSpec } from './lampParts';
import type { LanternSpot } from './nightGlow';
import type { Palette } from './props';

export {
  addLampFixtures,
  doorSconces,
  hangingBottom,
  lampCount,
  lampsFor,
  layoutLevel,
  mastPotences,
  mastTopLamp,
  potenceHeight,
  sconceHeight,
  type HangingLamp,
  type LampSpec,
  type PostLamp,
  type WallLamp,
} from './lampParts';

const H = SHIP_LAMPS.hanging;
/** Boîte unité de toutes les pièces des lanternes suspendues (partagée, jamais libérée). */
const unitBox = new THREE.BoxGeometry(1, 1, 1);
/** Le verre, et les pièces sombres de la lanterne (montants, plaques, chapeau, anneau). */
const GLASS = LANTERN_PARTS.find((p) => p.glow)!.matrix;
const FRAME = LANTERN_PARTS.filter((p) => !p.glow).map((p) => p.matrix);
/**
 * État d'une lanterne suspendue (flottants à la suite) : penchant dans le monde (tangentes x, z de sa direction avec la
 * verticale) et sa vitesse, point d'attache (monde) à l'image d'avant et sa vitesse, accélération lissée de ce point.
 */
const STATE = 13;

/** Une lanterne qui se balance : son point d'attache et ses pièces dans le repère qui pivote autour de lui. */
interface Swinging {
  anchor: THREE.Vector3;
  yaw: THREE.Quaternion;
  /** Tige puis pièces sombres de la lanterne ; verre. */
  parts: THREE.Matrix4[];
  glass: THREE.Matrix4;
  index: number;
  center: THREE.Vector3;
  spot: LanternSpot;
  /** Longueur du pendule (m, repère du navire) : du point d'attache au centre du verre. */
  length: number;
}

// Objets réutilisés à chaque image (pas d'allocation dans la boucle).
const DOWN = new THREE.Vector3(0, -1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const shipPosition = new THREE.Vector3();
const shipRotation = new THREE.Quaternion();
const shipScale = new THREE.Vector3();
const toShip = new THREE.Quaternion();
const world = new THREE.Vector3();
const accel = new THREE.Vector3();
const hang = new THREE.Vector3();
const swing = new THREE.Quaternion();
const frame = new THREE.Matrix4();
const matrix = new THREE.Matrix4();

/**
 * Les lanternes suspendues d'un navire (leurs pièces fixes, potences et pitons, sont dans le gabarit :
 * `addLampFixtures`). Propres à chaque instance puisqu'elles bougent, en deux lots `InstancedMesh` par navire
 * (montures sombres, verres) : deux appels de rendu quel que soit leur nombre. La navigation du pont ignore les
 * `InstancedMesh` : elles ne gênent ni l'équipage ni le joueur à pied (d'où leur place au-dessus des têtes).
 * Chacune est un pendule amorti qui reste à peu près d'aplomb dans le monde : le navire roule et tangue autour d'elle,
 * et seule l'accélération de son point d'attache (roulis d'une hune haute, virage, départ) la fait se balancer.
 * Ses `lanterns` (halos, lumière) suivent sur place.
 *
 * Usage dans un modèle : `this.lamps = new ShipLamps(lampes, palette)` ; `body.add(this.lamps.object)` (dans le
 * repère des lampes : `root`, ou un groupe sans transformation comme `body`) ;
 * `this.lanterns = [...addStatics(body, t.statics), ...this.lamps.lanterns]` ; `this.lamps.animate(dt, this.root)` à
 * chaque `animate` ; `this.lamps.dispose()` quand le modèle est défait ou reconstruit.
 */
export class ShipLamps {
  /** À poser dans le repère des lampes (`root`, ou un groupe sans transformation comme `body`). */
  readonly object = new THREE.Group();
  /** Lanternes suspendues (repère du navire, mises à jour sur place), à ajouter à `ShipModel.lanterns`. */
  readonly lanterns: LanternSpot[] = [];
  private readonly dark: THREE.InstancedMesh | null = null;
  private readonly glow: THREE.InstancedMesh | null = null;
  private readonly swinging: Swinging[] = [];
  private readonly state: Float32Array;
  private started = false;

  /** `lamps` : toutes les lampes du plan (seules les suspendues sont prises ici). */
  constructor(lamps: readonly LampSpec[], palette: Palette) {
    const hangs = lamps.filter((l): l is HangingLamp => l.kind === 'hanging');
    this.state = new Float32Array(hangs.length * STATE);
    if (hangs.length === 0) return;
    const perLamp = 1 + FRAME.length;
    this.dark = new THREE.InstancedMesh(unitBox, palette.dark, hangs.length * perLamp);
    this.glow = new THREE.InstancedMesh(unitBox, palette.glow, hangs.length);
    this.object.add(this.dark, this.glow);
    const color = (palette.glow as THREE.MeshStandardMaterial).emissive;
    hangs.forEach((lamp, index) => {
      const s = lamp.scale ?? 1;
      const arm = lamp.arm ?? 0;
      const drop = lamp.drop ?? H.drop;
      const yaw = yawOf(lamp.facing ?? 0);
      const anchor = new THREE.Vector3(0, 0, arm).applyQuaternion(yaw).add(lamp.at);
      const length = drop + LANTERN_TOP * s;
      const body = tf(0, -length, 0, 0, 0, 0, s);
      const parts = [tf(0, -drop / 2, 0, 0, 0, 0, [H.rod * s, drop, H.rod * s]), ...FRAME.map((m) => body.clone().multiply(m))];
      const center = new THREE.Vector3(0, -length, 0);
      const spot = { at: center.clone().add(anchor), color, seed: anchor.x * 3 + anchor.y + anchor.z * 7, halo: lamp.halo };
      this.swinging.push({ anchor, yaw, parts, glass: body.clone().multiply(GLASS), index, center, spot, length });
      this.lanterns.push(spot);
    });
    // Au repos (d'aplomb dans le repère du navire), puis une sphère englobante qui couvre tout le balancement.
    hang.copy(DOWN);
    for (let i = 0; i < this.swinging.length; i++) this.pose(i);
    const reach = Math.max(...this.swinging.map((l) => l.length + LANTERN_TOP));
    for (const mesh of [this.dark, this.glow]) {
      mesh.computeBoundingSphere();
      mesh.boundingSphere!.radius += reach;
    }
  }

  /**
   * Balance les lanternes : chacune tend, comme un pendule amorti, vers la pesanteur apparente à son point d'attache
   * (la verticale du monde, moins l'accélération de ce point), sans jamais s'écarter de plus de `maxAngle` de la
   * verticale du navire. `root` : la racine du modèle (son assiette est lue dans sa matrice, posée juste avant).
   */
  animate(dt: number, root: THREE.Object3D) {
    const count = this.swinging.length;
    if (count === 0) return;
    root.updateWorldMatrix(false, false);
    const m = root.matrixWorld;
    m.decompose(shipPosition, shipRotation, shipScale);
    toShip.copy(shipRotation).invert();
    // Première image, ou retour après une absence (navire lointain, dans la brume, menu) : d'aplomb, sans élan.
    const fresh = !this.started || dt <= 0 || dt > H.resetAfter;
    this.started = true;
    const limit = Math.tan(H.maxAngle);
    const st = this.state;
    for (let i = 0; i < count; i++) {
      const lamp = this.swinging[i];
      const k = i * STATE;
      world.copy(lamp.anchor).applyMatrix4(m);
      let reset = fresh;
      if (!reset) {
        const vx = (world.x - st[k + 4]) / dt;
        const vy = (world.y - st[k + 5]) / dt;
        const vz = (world.z - st[k + 6]) / dt;
        // Un saut (réapparition, navire resté longtemps sans être animé) : on repart d'aplomb.
        reset = vx * vx + vy * vy + vz * vz > H.jump * H.jump;
        if (!reset) {
          accel.set((vx - st[k + 7]) / dt, (vy - st[k + 8]) / dt, (vz - st[k + 9]) / dt).clampLength(0, H.maxAccel);
          const f = Math.min(1, dt * H.accelSmoothing);
          st[k + 10] += (accel.x - st[k + 10]) * f;
          st[k + 11] += (accel.y - st[k + 11]) * f;
          st[k + 12] += (accel.z - st[k + 12]) * f;
          st[k + 7] = vx;
          st[k + 8] = vy;
          st[k + 9] = vz;
        }
      }
      if (reset) st.fill(0, k + 7, k + STATE);
      st[k + 4] = world.x;
      st[k + 5] = world.y;
      st[k + 6] = world.z;
      // Pesanteur apparente (monde) : g vers le bas, moins l'accélération ressentie du point d'attache.
      const down = Math.max(H.gravity + st[k + 11] * H.inertia, H.gravity * H.minWeight);
      const tx = (-st[k + 10] * H.inertia) / down;
      const tz = (-st[k + 12] * H.inertia) / down;
      if (reset) {
        st[k] = tx;
        st[k + 1] = tz;
        st[k + 2] = st[k + 3] = 0;
      } else this.integrate(k, tx, tz, dt, lamp.length * shipScale.y);
      this.hangInShip(k, limit);
      this.pose(i);
    }
    this.dark!.instanceMatrix.needsUpdate = true;
    this.glow!.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.dark?.dispose();
    this.glow?.dispose();
  }

  /** Pendule amorti (dans le monde) vers le penchant visé (tx, tz), en petits pas ; `length` : sa longueur (m). */
  private integrate(k: number, tx: number, tz: number, dt: number, length: number) {
    const st = this.state;
    const omega = H.pace * Math.sqrt(H.gravity / length);
    const steps = Math.ceil(dt / H.maxStep);
    const h = dt / steps;
    for (let n = 0; n < steps; n++) {
      st[k + 2] += (-omega * omega * (st[k] - tx) - 2 * H.damping * omega * st[k + 2]) * h;
      st[k + 3] += (-omega * omega * (st[k + 1] - tz) - 2 * H.damping * omega * st[k + 3]) * h;
      st[k] += st[k + 2] * h;
      st[k + 1] += st[k + 3] * h;
    }
  }

  /**
   * Direction de la lanterne dans le repère du navire (`hang`, unitaire), tirée de son penchant dans le monde ; au-delà
   * de l'écart permis avec la verticale du navire, elle bute (penchant ramené à la limite, élan perdu).
   */
  private hangInShip(k: number, limit: number) {
    const st = this.state;
    hang.set(st[k], -1, st[k + 1]).applyQuaternion(toShip);
    const below = -hang.y;
    const r = Math.hypot(hang.x, hang.z);
    if (below <= 0 || r > limit * below) {
      // Butée : le même cap dans le navire, à l'écart permis ; repassé dans le monde.
      const f = r > 0 ? limit / r : 0;
      hang.set(hang.x * f, -1, hang.z * f).applyQuaternion(shipRotation);
      st[k] = hang.x / -hang.y;
      st[k + 1] = hang.z / -hang.y;
      st[k + 2] = st[k + 3] = 0;
      hang.set(st[k], -1, st[k + 1]).applyQuaternion(toShip);
    }
    hang.normalize();
  }

  /** Pose la lanterne `i` le long de `hang` (repère du navire), et sa lueur avec elle. */
  private pose(i: number) {
    const lamp = this.swinging[i];
    swing.setFromUnitVectors(DOWN, hang).multiply(lamp.yaw);
    frame.compose(lamp.anchor, swing, ONE);
    const first = lamp.index * lamp.parts.length;
    for (let j = 0; j < lamp.parts.length; j++) this.dark!.setMatrixAt(first + j, matrix.multiplyMatrices(frame, lamp.parts[j]));
    this.glow!.setMatrixAt(lamp.index, matrix.multiplyMatrices(frame, lamp.glass));
    lamp.spot.at.copy(lamp.center).applyMatrix4(frame);
  }
}
