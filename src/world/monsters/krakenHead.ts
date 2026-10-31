import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KRAKEN } from '../../config';
import type { CreatureTarget } from '../../combat/cannons';
import type { Structure } from '../../combat/projectiles';

/** Profondeur (m) d'où sort la tête, et où elle replonge. */
const DEPTH = 16;
const ease = (k: number) => k * k * (3 - 2 * k);
const EYE = new THREE.Color(0xffc23a);
const EYE_DULL = new THREE.Color(0x8a4a14);
const WHITE = new THREE.Color(1, 1, 1);
const WOUND = new THREE.Color(KRAKEN.woundTint);
const local = new THREE.Vector3();

/** Les deux volumes qui reçoivent les boulets (repère de la tête) : le manteau, et la face au ras de l'eau. */
const MANTLE = { center: new THREE.Vector3(0, 6.2, -1.6), radii: new THREE.Vector3(3.6, 6.2, 4) };
const FACE = { center: new THREE.Vector3(0, 1.8, 0.4), radii: new THREE.Vector3(3.9, 2.8, 3.4) };
const inEllipsoid = (p: THREE.Vector3, e: typeof MANTLE) =>
  ((p.x - e.center.x) / e.radii.x) ** 2 + ((p.y - e.center.y) / e.radii.y) ** 2 + ((p.z - e.center.z) / e.radii.z) ** 2 < 1;

/** Un ellipsoïde low-poly bosselé, teint du dos (sombre) au ventre (clair). */
function lump(e: typeof MANTLE, lean: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(KRAKEN.skin.top);
  const belly = new THREE.Color(KRAKEN.skin.belly);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bump = 1 + 0.07 * Math.sin(x * 5 + seed) * Math.sin(y * 4 - seed) + 0.04 * Math.sin(z * 7 + y * 3);
    pos.setXYZ(i, x * e.radii.x * bump, y * e.radii.y * bump, z * e.radii.z * bump);
    c.lerpColors(top, belly, THREE.MathUtils.smoothstep(z * 0.5 - y, 0.4, 1.1) * 0.8).toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.rotateX(-lean);
  g.translate(e.center.x, e.center.y, e.center.z);
  return g;
}

/** Un bourrelet de sourcil au-dessus d'un œil (bord `side`). */
function brow(side: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.9, 0.45, 0.9).toNonIndexed();
  g.rotateZ(side * 0.32);
  g.translate(side * 2, 3.25, 2.55);
  const colors = new Float32Array(g.attributes.position.count * 3).fill(0);
  const top = new THREE.Color(KRAKEN.skin.top).multiplyScalar(0.7);
  for (let i = 0; i < colors.length; i += 3) top.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * La tête du Kraken : manteau bosselé penché en arrière, face au ras de l'eau, deux grands yeux jaunes à pupille fendue
 * sous des paupières lourdes. Elle ne sort qu'après que plusieurs tentacules ont été tranchées, à côté du navire tenu :
 * c'est alors une cible. Plus elle souffre, plus elle s'assombrit, plus ses paupières tombent et ses yeux s'éteignent.
 */
export class KrakenHead implements CreatureTarget, Structure {
  readonly kind = 'head' as const;
  readonly faction = 'monster' as const;
  readonly flesh = true;
  readonly group = new THREE.Group();
  /** Point visé : entre les yeux. */
  readonly position = new THREE.Vector3();
  velocityX = 0;
  velocityZ = 0;
  readonly radius = 4;
  readonly aimHeight = 0;
  health: number;
  readonly maxHealth: number;
  /** 0 = au fond, 1 = sortie ; `up` : vers où elle va. */
  rise = 0;
  up = false;
  hurt = 0;
  private readonly skin: THREE.MeshStandardMaterial;
  private readonly eyes: THREE.MeshBasicMaterial;
  private readonly lids: THREE.Mesh[] = [];
  private blink = 0;
  private nextBlink = 3;

  constructor(health: number) {
    this.health = this.maxHealth = health;
    this.skin = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45 });
    this.eyes = new THREE.MeshBasicMaterial({ color: EYE.clone() });
    const body = mergeGeometries([lump(MANTLE, 0.35, 1.3), lump(FACE, 0, 4.1), brow(1), brow(-1)])!;
    body.computeVertexNormals();
    this.group.add(new THREE.Mesh(body, this.skin));
    const pupil = new THREE.MeshBasicMaterial({ color: 0x080404 });
    for (const side of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), this.eyes);
      eye.position.set(side * 2, 2.35, 2.75);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.15, 0.12), pupil);
      slit.position.set(side * 2, 2.35, 3.62);
      // Paupière : une demi-coquille qui descend sur l'œil (rotation autour de l'axe des x).
      const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), this.skin);
      lid.position.copy(eye.position);
      this.lids.push(lid);
      this.group.add(eye, slit, lid);
    }
    this.group.visible = false;
  }

  /** Sortie de l'eau et entière : les canons la visent. */
  get alive(): boolean {
    return this.up && this.rise > 0.8 && this.health > 0;
  }

  get wound(): number {
    return 1 - Math.max(0, this.health) / this.maxHealth;
  }

  /** Place la tête en (x, z), tournée vers `facing` (rad) ; `time` : horloge de sa respiration. */
  update(dt: number, x: number, z: number, facing: number, time: number) {
    this.rise = Math.min(1, Math.max(0, this.rise + (this.up ? 1 : -1) * dt / KRAKEN.head.riseTime));
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.group.visible = this.rise > 0;
    if (!this.group.visible) return;
    const k = ease(this.rise);
    const bob = 0.35 * Math.sin(time * 1.1);
    this.group.position.set(x, -DEPTH * (1 - k) + bob - this.hurt * 0.5, z);
    // Elle se cabre en sortant, et recule sous un coup.
    this.group.rotation.set(-0.5 * (1 - k) - this.hurt * 0.15, facing, 0.05 * Math.sin(time * 0.7), 'YXZ');
    this.group.scale.setScalar(KRAKEN.head.size * (1 + 0.025 * Math.sin(time * 1.6)));
    this.group.updateMatrixWorld();
    this.position.set(0, 2.4, 2.4).applyMatrix4(this.group.matrixWorld);
    const w = this.wound;
    this.skin.color.lerpColors(WHITE, WOUND, w * 0.55);
    if (this.hurt > 0) this.skin.color.lerp(WHITE, this.hurt * 0.5).multiplyScalar(1 + this.hurt * 0.3);
    this.eyes.color.lerpColors(EYE, EYE_DULL, w);
    // Paupières : plus lourdes avec les blessures, un clignement de temps en temps, fermées sous un coup.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt * 6);
    const shut = Math.max(0.15 + 0.55 * w, this.blink, this.hurt);
    for (const lid of this.lids) lid.rotation.x = -Math.PI / 2 + (Math.PI / 2 + 0.25) * shut;
  }

  containsPoint(x: number, y: number, z: number): boolean {
    if (!this.group.visible) return false;
    local.set(x, y, z);
    if (local.distanceToSquared(this.group.position) > 14 * 14) return false;
    this.group.worldToLocal(local);
    return inEllipsoid(local, MANTLE) || inEllipsoid(local, FACE);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.skin.dispose();
    this.eyes.dispose();
  }
}
