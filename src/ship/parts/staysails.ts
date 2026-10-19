import * as THREE from 'three';
import { STAYSAILS } from '../../config';
import { buildTriangleSail } from './sails';
import type { TornSail } from './tornSail';

/** Ce qu'il faut savoir d'un mât (repère du navire) : position, pied, tête, hune. */
export interface StayMast {
  readonly z: number;
  readonly base: number;
  readonly top: number;
  readonly topPlatform: number;
}

const geometries = new Map<string, { tack: THREE.Vector3; geometry: THREE.BufferGeometry }>();

/**
 * Voile d'étai entre deux mâts : triangle dont le guindant suit l'étai, qui descend de la hune du mât arrière vers le
 * bas du mât avant ; la chute tombe à peu près droite sous la têtière. Gabarit en cache par paire de mâts.
 */
function staysail(fore: StayMast, aft: StayMast) {
  const key = [fore.z, fore.base, fore.topPlatform, aft.z, aft.base, aft.topPlatform].map((v) => v.toFixed(2)).join(':');
  let g = geometries.get(key);
  if (g) return g;
  const s = STAYSAILS;
  const low = new THREE.Vector3(0, fore.base + (fore.topPlatform - fore.base) * s.stayLow, fore.z);
  const high = new THREE.Vector3(0, aft.base + (aft.topPlatform - aft.base) * s.stayHigh, aft.z);
  const tack = low.clone().lerp(high, s.tack);
  const head = low.clone().lerp(high, s.head);
  const clew = new THREE.Vector3(0, tack.y + (head.y - tack.y) * s.clewRise, head.z + (tack.z - head.z) * s.clewIn);
  g = { tack, geometry: buildTriangleSail(head.sub(tack), clew.sub(tack), s.bulge) };
  geometries.set(key, g);
  return g;
}

/**
 * Voiles d'étai d'un trois-mâts (et plus) : une entre chaque paire de mâts consécutifs donnés de l'avant vers
 * l'arrière (misaine → grand mât → artimon). Toile des voiles trouées du navire (trous, gonflement, usure) ; elles se
 * réduisent avec la voilure et se creusent sous le vent comme les focs.
 */
export class Staysails {
  readonly group = new THREE.Group();
  private readonly sails: THREE.Mesh[] = [];
  private amount = 1;
  private side = 1;

  constructor(tornSail: TornSail, masts: readonly StayMast[]) {
    for (let i = 0; i + 1 < masts.length; i++) {
      const { tack, geometry } = staysail(masts[i], masts[i + 1]);
      const mesh = new THREE.Mesh(geometry, tornSail.material(geometry, 'x'));
      mesh.position.copy(tack);
      this.sails.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Voilure (0 = affalées, 1 = pleine voile) et côté sous le vent (+1 bâbord, -1 tribord). */
  apply(amount: number, leeSide: number) {
    this.amount = amount;
    this.side = leeSide;
    const k = STAYSAILS.furled + (1 - STAYSAILS.furled) * this.amount;
    for (const sail of this.sails) sail.scale.set(k * this.side, k, k);
  }
}
