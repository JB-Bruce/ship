import * as THREE from 'three';
import { STAYSAILS } from '../../config';
import { riggingMaterial } from './common';
import type { TornSail } from './tornSail';

/** Ce qu'il faut savoir d'un mât (repère du navire) : position, pied, hune. */
export interface StayMast {
  readonly z: number;
  readonly base: number;
  readonly topPlatform: number;
}

/** Une voile d'étai et son étai : hauteur de l'étai le long du navire, sommets de la toile. */
interface StayShape {
  /** L'étai : de la hune du mât arrière (z, y) au mât avant (z, y). */
  aft: THREE.Vector2;
  fore: THREE.Vector2;
  /** Coins de la toile : haut avant et haut arrière (sur l'étai), bas arrière et bas avant. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

function shapeOf(fore: StayMast, aft: StayMast): StayShape {
  const s = STAYSAILS;
  const a = new THREE.Vector2(aft.z, aft.base + (aft.topPlatform - aft.base) * s.stayHigh);
  const f = new THREE.Vector2(fore.z, fore.base + (fore.topPlatform - fore.base) * s.stayLow);
  const stay = (z: number) => f.y + ((z - f.x) / (a.x - f.x)) * (a.y - f.y);
  const zFore = f.x - s.foreGap;
  const zAft = a.x + s.aftGap;
  const foot = Math.max(fore.base, aft.base) + s.footClearance;
  return {
    aft: a,
    fore: f,
    corners: [new THREE.Vector3(0, stay(zFore), zFore), new THREE.Vector3(0, stay(zAft), zAft), new THREE.Vector3(0, foot, zAft), new THREE.Vector3(0, foot, zFore)],
  };
}

/**
 * Toile à quatre côtés en grille (repère du navire, plan x = 0), creusée sur +X : bord haut le long de l'étai, deux
 * côtés à peu près verticaux près des mâts, bas au-dessus du pont. Garde pour chaque sommet sa hauteur sous l'étai,
 * pour qu'elle se cargue en remontant vers lui.
 */
function buildQuad(shape: StayShape) {
  const [tf, ta, ba, bf] = shape.corners;
  const n = STAYSAILS.segments;
  const positions: number[] = [];
  const drop: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    top.lerpVectors(tf, ta, u);
    bottom.lerpVectors(bf, ba, u);
    for (let j = 0; j <= n; j++) {
      const v = j / n;
      p.lerpVectors(top, bottom, v);
      p.x = STAYSAILS.bulge * 16 * u * (1 - u) * v * (1 - v);
      positions.push(p.x, p.y, p.z);
      drop.push(top.y - p.y);
      if (i < n && j < n) {
        const k = i * (n + 1) + j;
        index.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { geometry, drop: Float32Array.from(drop), rest: Float32Array.from(positions) };
}

/**
 * Voiles d'étai : une entre chaque paire de mâts consécutifs donnés de l'avant vers l'arrière (grand mât → misaine sur
 * la plupart des trois-mâts ; aussi artimon → grand mât sur le galion). Chacune pend sous son étai (dessiné), en toile
 * des voiles trouées du navire (trous, gonflement, usure) ; elle se cargue en remontant vers l'étai et se creuse sous
 * le vent comme les focs. Géométrie propre à chaque navire (sommets déplacés quand la voilure change).
 */
export class Staysails {
  readonly group = new THREE.Group();
  private readonly sails: { mesh: THREE.Mesh; drop: Float32Array; rest: Float32Array }[] = [];
  private amount = -1;
  private side = 0;

  constructor(tornSail: TornSail, masts: readonly StayMast[]) {
    const stays: number[] = [];
    for (let i = 0; i + 1 < masts.length; i++) {
      const shape = shapeOf(masts[i], masts[i + 1]);
      const { geometry, drop, rest } = buildQuad(shape);
      const mesh = new THREE.Mesh(geometry, tornSail.material(geometry, 'x'));
      this.sails.push({ mesh, drop, rest });
      this.group.add(mesh);
      stays.push(0, shape.aft.y, shape.aft.x, 0, shape.fore.y, shape.fore.x);
    }
    const rope = new THREE.BufferGeometry();
    rope.setAttribute('position', new THREE.Float32BufferAttribute(stays, 3));
    this.group.add(new THREE.LineSegments(rope, riggingMaterial));
  }

  /** Voilure (0 = carguées sous l'étai, 1 = pleine voile) et côté sous le vent (+1 bâbord, -1 tribord). */
  apply(amount: number, leeSide: number) {
    if (Math.abs(amount - this.amount) < STAYSAILS.step && leeSide === this.side) return;
    this.amount = amount;
    this.side = leeSide;
    const k = STAYSAILS.furled + (1 - STAYSAILS.furled) * amount;
    for (const { mesh, drop, rest } of this.sails) {
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        // Carguée, la toile remonte vers l'étai (sa chute se raccourcit) ; le creux passe sous le vent.
        pos.setXYZ(i, rest[i * 3] * leeSide * k, rest[i * 3 + 1] + drop[i] * (1 - k), rest[i * 3 + 2]);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }

  dispose() {
    for (const { mesh } of this.sails) mesh.geometry.dispose();
  }
}
