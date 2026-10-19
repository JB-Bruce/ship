import * as THREE from 'three';
import { COMBAT, FISHING, GRAPHICS, WAKE } from '../config';
import type { Ship } from '../ship/ship';
import type { FishSchool } from '../world/fishSchools';
import type { Crate } from '../world/loot';
import { FADE_FRAGMENT, FULLSCREEN_VERTEX, STAMP_FRAGMENT, STAMP_VERTEX } from './wakeShaders';

/** Types de trace, comme dans STAMP_FRAGMENT. */
const forward = new THREE.Vector3();
const toShip = new THREE.Vector3();
const SHIP = 0;
const RING = 1;
const WRECK = 2;
const FISH = 3;
/** Nombre max de traces peintes par image (bateaux, anneaux, naufrages, butin). */
const CAPACITY = 128;
/** Anneaux en attente (boulets tombés à l'eau depuis la dernière image). */
const MAX_PENDING_RINGS = 32;
/** Intensité de l'anneau autour du butin qui flotte (il est repeint à chaque image). */
const LOOT_INTENSITY = 0.6;

/** Uniforms partagés avec le shader de l'océan (voir WAKE_GLSL). */
export const wakeUniforms = {
  uWakeMap: { value: null as THREE.Texture | null },
  uWakeArea: { value: new THREE.Vector3(0, 0, WAKE.areaSize) },
  uWakeShips: { value: Array.from({ length: WAKE.maxShips }, () => new THREE.Vector4()) },
  uWakeHulls: { value: Array.from({ length: WAKE.maxShips }, () => new THREE.Vector4()) },
  uWakeProfiles: { value: Array.from({ length: WAKE.maxShips * 2 }, () => new THREE.Vector4()) },
  uWakeAttitudes: { value: Array.from({ length: WAKE.maxShips }, () => new THREE.Vector4()) },
  uWakeCount: { value: 0 },
};

function createTarget(resolution: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(resolution, resolution, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

/** Virage en cours, de −1 à 1 (positif = vers bâbord). */
function turnOf(ship: Ship): number {
  return THREE.MathUtils.clamp(ship.yawSpeed / ship.stats.turnRate, -1, 1);
}

/** Force du sillage selon la vitesse : 0 à l'arrêt, 1 lancé. */
function wakeStrength(ship: Ship): number {
  return THREE.MathUtils.smoothstep(ship.speed, WAKE.minSpeed, WAKE.fullSpeed);
}

/**
 * Traces dans l'eau. Chaque image : l'image précédente est recopiée (décalée si le joueur a bougé), étalée et pâlie,
 * puis bateaux, anneaux, naufrages et butin y sont peints (on garde le maximum, pour ne jamais saturer).
 * Le shader de l'océan la lit pour dessiner écume et eau lissée.
 */
export class WakeMap {
  /** Côté de la carte (texels) : réglage graphique. */
  private resolution = WAKE.resolution;
  /** Liseré d'écume des coques : distance max à la caméra (réglage graphique), et les navires retenus, du plus proche au plus loin. */
  private hullFoamRange: number = GRAPHICS.hullFoamRange.detailed;
  private readonly nearShips: (Ship | null)[] = new Array(WAKE.maxShips).fill(null);
  private readonly nearDistance = new Float32Array(WAKE.maxShips);
  private targets = [createTarget(this.resolution), createTarget(this.resolution)];
  private readonly camera = new THREE.Camera();
  private readonly fadeScene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly fadeUniforms = {
    uPrevious: { value: null as THREE.Texture | null },
    uShift: { value: new THREE.Vector2() },
    uTexel: { value: 1 / WAKE.resolution },
    uSpread: { value: 0 },
    uDecay: { value: 0 },
  };
  private readonly stampUniforms = {
    uOrigin: { value: new THREE.Vector2() },
    uHalfSize: { value: WAKE.areaSize / 2 },
  };
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly place = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly shape = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly hull = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly turn = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private readonly attributes = [this.place, this.shape, this.hull, this.turn];
  private count = 0;
  private readonly pendingRings: { x: number; z: number }[] = [];
  private readonly wreckSeeds = new WeakMap<Ship, number>();
  /** Horloge des remous animés (bancs de poissons) (s). */
  private time = 0;
  /** Coin de la zone, toujours aligné sur un texel : les traces ne « glissent » pas quand le joueur avance. */
  private readonly origin = new THREE.Vector2(NaN, NaN);

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    const fade = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        uniforms: this.fadeUniforms,
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: FADE_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    );
    fade.frustumCulled = false;
    this.fadeScene.add(fade);

    this.geometry.index = quad.index;
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    for (const a of this.attributes) a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aPlace', this.place);
    this.geometry.setAttribute('aShape', this.shape);
    this.geometry.setAttribute('aHull', this.hull);
    this.geometry.setAttribute('aTurn', this.turn);
    const stamps = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        uniforms: this.stampUniforms,
        vertexShader: STAMP_VERTEX,
        fragmentShader: STAMP_FRAGMENT,
        depthTest: false,
        depthWrite: false,
        // On garde la plus forte des deux traces : deux sillages qui se croisent ne deviennent pas plus blancs.
        blending: THREE.CustomBlending,
        blendEquation: THREE.MaxEquation,
      }),
    );
    stamps.frustumCulled = false;
    this.stampScene.add(stamps);
    wakeUniforms.uWakeMap.value = this.targets[0].texture;
  }

  /** Nouvelle résolution de la carte : elle repart vide (les traces en cours s'effacent). */
  setResolution(resolution: number) {
    if (resolution === this.resolution) return;
    for (const target of this.targets) target.dispose();
    this.resolution = resolution;
    this.targets = [createTarget(resolution), createTarget(resolution)];
    this.fadeUniforms.uTexel.value = 1 / resolution;
    this.origin.set(NaN, NaN);
    wakeUniforms.uWakeMap.value = this.targets[0].texture;
  }

  /** Distance de la caméra (m) au-delà de laquelle un navire n'a plus de liseré d'écume. */
  setHullFoamRange(range: number) {
    this.hullFoamRange = range;
  }

  /** Un boulet vient de tomber à l'eau en (x, z) : un anneau d'écume y restera un moment. */
  splash(x: number, z: number) {
    if (this.pendingRings.length < MAX_PENDING_RINGS) this.pendingRings.push({ x, z });
  }

  /** `focus` : le bateau piloté (la zone est centrée sur lui). Rien ne bouge pendant la pause (dt = 0). */
  update(renderer: THREE.WebGLRenderer, camera: THREE.Camera, dt: number, focus: THREE.Vector3, ships: readonly Ship[], crates: readonly Crate[], schools: readonly FishSchool[]) {
    if (dt <= 0) return;
    this.time += dt;
    const texel = WAKE.areaSize / this.resolution;
    const ox = Math.round(focus.x / texel) * texel;
    const oz = Math.round(focus.z / texel) * texel;
    if (Number.isNaN(this.origin.x)) this.origin.set(ox, oz);
    const f = this.fadeUniforms;
    f.uShift.value.set((ox - this.origin.x) / WAKE.areaSize, (oz - this.origin.y) / WAKE.areaSize);
    this.origin.set(ox, oz);
    // L'étalement se fait de texel en texel : à plus basse résolution, il faut moins d'étalement par image pour la même
    // diffusion en mètres (elle va comme le carré de la taille d'un texel).
    const ratio = this.resolution / WAKE.resolution;
    f.uSpread.value = Math.min(0.2, WAKE.spread * dt * ratio * ratio);
    f.uDecay.value = dt / WAKE.duration;
    this.stampUniforms.uOrigin.value.copy(this.origin);
    wakeUniforms.uWakeArea.value.set(ox, oz, WAKE.areaSize);

    this.collectStamps(ships, crates, schools);
    this.updateBowWaves(camera, ships);

    // Ping-pong : on lit l'une, on écrit l'autre.
    const [previous, next] = this.targets;
    f.uPrevious.value = previous.texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(next);
    renderer.render(this.fadeScene, this.camera);
    if (this.count > 0) renderer.render(this.stampScene, this.camera);
    renderer.setRenderTarget(null);
    renderer.autoClear = autoClear;
    this.targets = [next, previous];
    wakeUniforms.uWakeMap.value = next.texture;
  }

  /** Prépare les traces de cette image : bateaux (ou naufrages), anneaux des boulets, butin, bancs de poissons. */
  private collectStamps(ships: readonly Ship[], crates: readonly Crate[], schools: readonly FishSchool[]) {
    this.count = 0;
    for (const ship of ships) {
      const halfLength = ship.stats.length / 2;
      const halfWidth = ship.stats.width / 2;
      if (!ship.alive) {
        if (ship.sinkTime !== null && ship.sinkTime < COMBAT.sinkDuration) {
          const r = halfLength * 1.3;
          // Graine tirée une fois par épave (contour qui lui est propre et ne bouge pas) ; le motif tourne avec son cap.
          let seed = this.wreckSeeds.get(ship);
          if (seed === undefined) this.wreckSeeds.set(ship, (seed = Math.random() * 100));
          this.add(ship.position.x, ship.position.z, Math.sin(ship.heading), Math.cos(ship.heading), r, r, WRECK, 1, r, 0, seed, 0);
        }
        continue;
      }
      const strength = wakeStrength(ship);
      if (strength <= 0) continue;
      // Le quad couvre la coque et ses abords (gerbe des virages), décalé vers l'arrière pour le remous de poupe.
      this.add(
        ship.position.x, ship.position.z, Math.sin(ship.heading), Math.cos(ship.heading),
        halfWidth + 3.5, halfLength + 2.5, SHIP, 1, halfLength, halfWidth, strength, -1,
      );
      this.turn.array[this.count - 1] = turnOf(ship);
    }
    for (const ring of this.pendingRings) {
      const r = WAKE.splashRadius + 1;
      this.add(ring.x, ring.z, 0, 1, r, r, RING, 1, WAKE.splashRadius, 0, 0, 0);
    }
    this.pendingRings.length = 0;
    for (const { mesh } of crates) {
      const r = WAKE.lootRadius + 1;
      this.add(mesh.position.x, mesh.position.z, 0, 1, r, r, RING, LOOT_INTENSITY, WAKE.lootRadius, 0, 0, 0);
    }
    for (const s of schools) {
      const r = FISHING.radius + 1;
      this.add(s.x, s.z, 0, 1, r, r, FISH, s.fade, FISHING.radius, s.seed, this.time, 0);
    }
    this.geometry.instanceCount = this.count;
    for (const a of this.attributes) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.count * a.itemSize);
      a.needsUpdate = true;
    }
  }

  private add(x: number, z: number, sin: number, cos: number, halfAcross: number, halfAlong: number, type: number, intensity: number, h0: number, h1: number, h2: number, forward: number) {
    if (this.count >= CAPACITY) return;
    const i = this.count++ * 4;
    const place = this.place.array;
    const shape = this.shape.array;
    const hull = this.hull.array;
    place[i] = x;
    place[i + 1] = z;
    place[i + 2] = sin;
    place[i + 3] = cos;
    shape[i] = halfAcross;
    shape[i + 1] = halfAlong;
    shape[i + 2] = type;
    shape[i + 3] = intensity;
    hull[i] = h0;
    hull[i + 1] = h1;
    hull[i + 2] = h2;
    hull[i + 3] = forward;
    this.turn.array[i / 4] = 0;
  }

  /**
   * Navires dont le shader dessine le liseré d'écume (en route ou à l'arrêt) : les plus proches de la caméra, devant elle
   * et à moins de `hullFoamRange`. Chaque pixel d'eau parcourt cette liste : plus elle est courte, moins l'eau coûte.
   */
  private updateBowWaves(camera: THREE.Camera, ships: readonly Ship[]) {
    const u = wakeUniforms;
    camera.getWorldDirection(forward);
    const near = this.nearShips;
    const distance = this.nearDistance;
    let count = 0;
    for (const ship of ships) {
      if (!ship.alive) continue;
      const half = ship.stats.length / 2;
      toShip.subVectors(ship.position, camera.position);
      const d = toShip.length() - half;
      if (d > this.hullFoamRange || toShip.dot(forward) < -half) continue;
      // Insertion dans la liste triée des plus proches (sans allocation).
      let i = Math.min(count, WAKE.maxShips - 1);
      if (count === WAKE.maxShips && d >= distance[i]) continue;
      while (i > 0 && distance[i - 1] > d) {
        near[i] = near[i - 1];
        distance[i] = distance[i - 1];
        i--;
      }
      near[i] = ship;
      distance[i] = d;
      if (count < WAKE.maxShips) count++;
    }
    for (let n = 0; n < count; n++) {
      const ship = near[n]!;
      const strength = wakeStrength(ship);
      // Le liseré suit la partie mouillée de la coque (son centre n'est pas toujours celui du navire).
      const line = ship.model.waterline;
      const sin = Math.sin(ship.heading);
      const cos = Math.cos(ship.heading);
      const pitch = Math.sin(ship.pitch);
      u.uWakeShips.value[n].set(ship.position.x + sin * line.center, ship.position.z + cos * line.center, sin, cos);
      u.uWakeHulls.value[n].set(line.half, line.maxWidth, strength, turnOf(ship));
      u.uWakeAttitudes.value[n].set(ship.position.y + pitch * line.center, pitch, Math.sin(ship.roll), (ship.stats.width / 2) * WAKE.hullDraft);
      const w = line.widths;
      u.uWakeProfiles.value[n * 2].set(w[0], w[1], w[2], w[3]);
      u.uWakeProfiles.value[n * 2 + 1].set(w[4], w[5], w[6], w[7]);
    }
    u.uWakeCount.value = count;
  }
}
