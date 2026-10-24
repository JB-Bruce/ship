import type { WaveParams } from '../config';
import { land } from '../world/island';

const GRAVITY = 9.8;
const TWO_PI = Math.PI * 2;

/**
 * Vagues de Gerstner côté CPU, pour la flottaison et tout ce qui doit connaître la hauteur de l'eau.
 * DOIT rester identique au shader de `oceanMesh.ts` (atténuation près de l'île comprise) :
 * toute modification de formule se fait aux deux endroits.
 */
export class Waves {
  /** Temps de simulation (s), partagé avec le shader. */
  time = 0;
  readonly list: WaveParams[];
  /** Déplacement d'un point (`long` = part verticale de la houle de fond), réutilisé. */
  private readonly offset = { x: 0, y: 0, z: 0, long: 0 };
  /** Résultat de `heightSplit` (réutilisé). */
  private readonly split = { total: 0, long: 0 };

  constructor(params: WaveParams[]) {
    this.list = params.map((w) => {
      const len = Math.hypot(w.dirX, w.dirZ);
      return { ...w, dirX: w.dirX / len, dirZ: w.dirZ / len };
    });
  }

  /** Hauteur de l'eau à la position monde (x, z). */
  heightAt(x: number, z: number): number {
    return this.heightSplit(x, z).total;
  }

  /**
   * Hauteur de l'eau en (x, z), et la part de la houle de fond (vagues `long`, OCEAN.groundSwell) : la coque des gros
   * navires suit entièrement celle-ci, et seulement en partie le reste (Buoyancy). Renvoie un objet réutilisé.
   */
  heightSplit(x: number, z: number): { total: number; long: number } {
    // Gerstner déplace aussi la surface horizontalement : on retrouve par itérations
    // le point au repos qui aboutit en (x, z), puis on lit sa hauteur.
    let px = x;
    let pz = z;
    for (let i = 0; i < 3; i++) {
      const d = this.displace(px, pz);
      px = x - d.x;
      pz = z - d.z;
    }
    const d = this.displace(px, pz);
    this.split.total = d.y;
    this.split.long = d.long;
    return this.split;
  }

  /** Somme des amplitudes : hauteur maximale théorique d'une crête. */
  get maxHeight(): number {
    return this.list.reduce((sum, w) => sum + (w.steepness * w.wavelength) / TWO_PI, 0);
  }

  /** Déplacement du point de surface au repos (x, z), avec la part de la houle de fond. Renvoie un objet réutilisé. */
  private displace(x: number, z: number) {
    const d = this.offset;
    d.x = d.y = d.z = d.long = 0;
    for (const w of this.list) {
      // Une vague sans raideur (clapot par temps normal) ne déplace rien : on s'épargne le calcul.
      if (w.steepness === 0) continue;
      const k = TWO_PI / w.wavelength;
      const c = Math.sqrt(GRAVITY / k);
      const f = k * (w.dirX * x + w.dirZ * z - c * this.time);
      const a = w.steepness / k;
      const cos = Math.cos(f);
      d.x += w.dirX * a * cos;
      d.z += w.dirZ * a * cos;
      const y = a * Math.sin(f);
      d.y += y;
      if (w.long) d.long += y;
    }
    // Près de l'île, les vagues s'apaisent (même atténuation que le shader).
    const calm = land.calmAt(x, z);
    d.x *= calm;
    d.y *= calm;
    d.z *= calm;
    d.long *= calm;
    return d;
  }
}
