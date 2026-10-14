import * as THREE from 'three';

/** Nombre de points du profil de flottaison d'une coque (le shader de l'eau en dépend). */
export const WATERLINE_SAMPLES = 8;
/**
 * Coque à rentrée mesurée en hauteur (flûte) dont la quille remonte au-dessus de l'eau : hauteur (m) du bas arrondi de
 * la section au-dessus de sa quille, puis du bouchain au-dessus de ce bas.
 */
const OVERHANG = { rounding: 0.5, bilge: 0.4 };

/** Une section de coque : [u (-1 poupe → 1 proue), demi-largeur (fraction), hauteur du plat-bord (m), profondeur de quille (m)]. */
export type StationRow = readonly [number, number, number, number];

export interface Station {
  z: number;
  halfWidth: number;
  gunwale: number;
  keel: number;
}

/**
 * Forme de coque définie par quelques sections transversales (gabarit), reliées en facettes.
 * Sert à toutes les coques (chaloupe, sloop…). Repère : proue +Z, bâbord +X, flottaison y = 0.
 */
export class HullShape {
  constructor(
    private readonly rows: readonly StationRow[],
    readonly halfLength: number,
    readonly halfWidth: number,
    /**
     * Hauteur fixe (m) du haut du bouchain. Par défaut, elle suit le plat-bord (35 %) ; une valeur fixe
     * permet des plats-bords en paliers (château, gaillard) sans déformer le bas de la coque.
     */
    private readonly upperBilge?: number,
    /**
     * Rentrée des flancs : le plat-bord est plus étroit que le maître-bau (atteint au haut du bouchain) de cette
     * fraction. 0 = flancs droits (par défaut).
     */
    private readonly tumblehome = 0,
    /**
     * Hauteur (m) où la rentrée atteint `tumblehome` : la largeur du bordé ne dépend alors que de la hauteur, pas du
     * plat-bord, et les flancs restent lisses le long des paliers (dunette, gaillards). Au-dessus, ils continuent de
     * rentrer, plus doucement. Sans elle, la rentrée se mesure au plat-bord de chaque section.
     */
    private readonly tumbleHeight?: number,
  ) {}

  /** Gabarit interpolé à la position u ∈ [-1, 1]. */
  stationAt(u: number): Station {
    const rows = this.rows;
    let i = 0;
    while (i < rows.length - 2 && rows[i + 1][0] < u) i++;
    const [u0, w0, g0, k0] = rows[i];
    const [u1, w1, g1, k1] = rows[i + 1];
    const t = THREE.MathUtils.clamp((u - u0) / (u1 - u0), 0, 1);
    const { lerp } = THREE.MathUtils;
    return { z: u * this.halfLength, halfWidth: lerp(w0, w1, t) * this.halfWidth, gunwale: lerp(g0, g1, t), keel: lerp(k0, k1, t) };
  }

  /** Coque ouverte : faces avant = extérieur, faces arrière = intérieur. */
  buildHull(): THREE.BufferGeometry {
    const rings = this.rows.map(([u]) => this.ring(this.stationAt(u)));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const [r, n] = [rings[i], rings[i + 1]];
      for (let j = 0; j < r.length - 1; j++) points.push(r[j], n[j + 1], r[j + 1], r[j], n[j], n[j + 1]);
    }
    const [stern, bow] = [rings[0], rings[rings.length - 1]];
    for (let j = 1; j < stern.length - 1; j++) {
      points.push(stern[0], stern[j], stern[j + 1]);
      points.push(bow[0], bow[j + 1], bow[j]);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  /** Plancher ou pont plat à la hauteur y, entre uMin et uMax, à `inset` × la demi-largeur. */
  buildFloor(y: number, uMin: number, uMax: number, inset: number): THREE.BufferGeometry {
    const us = [uMin, ...this.rows.map(([u]) => u).filter((u) => u > uMin && u < uMax), uMax];
    const shape = new THREE.Shape();
    // Forme dessinée dans le plan (x, -z), puis couchée à plat.
    us.forEach((u, i) => {
      const s = this.stationAt(u);
      const w = this.halfWidthAt(s, y) * inset;
      if (i === 0) shape.moveTo(w, -s.z);
      else shape.lineTo(w, -s.z);
    });
    for (const u of [...us].reverse()) {
      const s = this.stationAt(u);
      shape.lineTo(-this.halfWidthAt(s, y) * inset, -s.z);
    }
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y, 0);
    return geometry;
  }

  /**
   * Lisse le long d'un bord (side = +1 bâbord, -1 tribord), à `heightFactor` × hauteur du plat-bord,
   * ou à `heightFactor` mètres si `absoluteHeight`. Elle colle au bordé, même quand les flancs rentrent.
   */
  buildRail(side: 1 | -1, heightFactor: number, outset: number, radius: number, absoluteHeight = false): THREE.BufferGeometry {
    return this.buildRailAt(side, (s) => (absoluteHeight ? heightFactor : s.gunwale * heightFactor), outset, radius);
  }

  /** Lisse à une hauteur qui varie le long de la coque (`heightOf` reçoit la section et sa position u). */
  buildRailAt(side: 1 | -1, heightOf: (s: Station, u: number) => number, outset: number, radius: number): THREE.BufferGeometry {
    const points = this.rows.map(([u]) => {
      const s = this.stationAt(u);
      const y = heightOf(s, u);
      return new THREE.Vector3(side * (this.halfWidthAt(s, y) + outset), y, s.z);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, radius, 4, false);
  }

  /**
   * Bande peinte posée sur le bordé des deux bords, entre les hauteurs `from` et `to` (fonctions de la section et
   * de u ; `to` peut suivre le plat-bord et ses paliers), à `outset` du bordé.
   */
  buildBand(from: (s: Station, u: number) => number, to: (s: Station, u: number) => number, outset: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    for (const side of [1, -1]) {
      const strips = this.rows.map(([u]) => {
        const s = this.stationAt(u);
        const y0 = from(s, u);
        const y1 = Math.max(y0, to(s, u));
        return [y0, (y0 + y1) / 2, y1].map((y) => new THREE.Vector3(side * (this.halfWidthAt(s, y) + outset), y, s.z));
      });
      for (let i = 0; i < strips.length - 1; i++) {
        const [a, b] = [strips[i], strips[i + 1]];
        for (let j = 0; j < a.length - 1; j++) {
          // Faces tournées vers l'extérieur, de chaque côté.
          if (side > 0) points.push(a[j], b[j + 1], b[j], a[j], a[j + 1], b[j + 1]);
          else points.push(a[j], b[j], b[j + 1], a[j], b[j + 1], a[j + 1]);
        }
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Demi-largeur du bordé à la hauteur y dans une section (rentrée des flancs comprise). */
  halfWidthAt(s: Station, y: number): number {
    const profile = this.profile(s);
    if (y >= profile[0][1]) return profile[0][0];
    for (let i = 0; i < profile.length - 1; i++) {
      const [x0, y0] = profile[i];
      const [x1, y1] = profile[i + 1];
      if (y <= y0 && y >= y1) return THREE.MathUtils.lerp(x0, x1, (y0 - y) / (y0 - y1 || 1));
    }
    return 0;
  }

  /**
   * Couvercle invisible tendu sur l'ouverture de la coque, à hauteur du plat-bord.
   * Dessiné dans le tampon de profondeur avant l'océan, il empêche l'eau d'apparaître dans la coque.
   */
  buildWaterMask(maxHeight = Infinity): THREE.BufferGeometry {
    // Navire ponté : le masque ne monte pas au-dessus du pont principal (+ une marge). Plus haut, il cacherait l'eau
    // vue par-dessus un pavois bas (le milieu, entre un gaillard et un château) ; sous lui, le pont cache l'eau.
    const rims = this.rows.map(([u]) => {
      const s = this.stationAt(u);
      const top = Math.min(s.gunwale, maxHeight);
      const y = top - 0.02;
      const w = this.halfWidthAt(s, top);
      return [new THREE.Vector3(w, y, s.z), new THREE.Vector3(-w, y, s.z)];
    });
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < rims.length - 1; i++) {
      const [[portA, starA], [portB, starB]] = [rims[i], rims[i + 1]];
      points.push(starA, portB, portA, starA, starB, portB);
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  /**
   * Demi-largeur de la coque à la ligne de flottaison (y = 0), en `count` points régulièrement répartis
   * de la poupe (u = -1) à la proue (u = 1). Sert à faire épouser la coque au liseré d'écume du shader de l'eau.
   */
  waterlineProfile(count = WATERLINE_SAMPLES): number[] {
    // Même profil que ring() : la largeur du bordé à y = 0.
    return Array.from({ length: count }, (_, i) => this.halfWidthAt(this.stationAt(-1 + (2 * i) / (count - 1)), 0));
  }

  /** Profil d'une section (bâbord), du plat-bord vers la quille : [demi-largeur, hauteur]. */
  private profile({ halfWidth: w, gunwale: g, keel: k }: Station): [number, number][] {
    const bilge = this.upperBilge ?? g * 0.35;
    const th = this.tumblehome;
    const bottom: [number, number][] = [[w * 0.86, k * 0.45], [w * 0.5, k * 0.85]];
    if (th > 0 && this.tumbleHeight !== undefined) {
      // Rentrée selon la hauteur : de plus en plus forte jusqu'à tumbleHeight, puis trois fois moins vite.
      const span = this.tumbleHeight - bilge;
      const width = (y: number) => {
        const t = Math.max(0, (y - bilge) / span);
        return w * Math.max(0.2, 1 - th * (t <= 1 ? t ** 1.5 : 1 + 0.5 * (t - 1)));
      };
      // Une quille qui remonte au-dessus de l'eau (voûte de la poupe, avant arrondi) relève le bouchain avec elle : le
      // bas de la section reste arrondi sous lui.
      const floor = Math.max(0, k + OVERHANG.rounding);
      const low = Math.max(bilge, floor + OVERHANG.bilge);
      const side = (f: number): [number, number] => {
        const y = low + (g - low) * f;
        return [width(y), y];
      };
      const wb = width(low);
      return [side(1), side(2 / 3), side(1 / 3), [wb, low], [wb * 0.86, k + (floor - k) * 0.55], [wb * 0.5, k + (floor - k) * 0.15]];
    }
    const top: [number, number][] = th > 0 ? [[w * (1 - th), g], [w * (1 - th * 0.35), (bilge + g) / 2], [w, bilge]] : [[w, g], [w * 0.98, bilge]];
    return [...top, ...bottom];
  }

  /** Profil d'une section : du plat-bord bâbord au plat-bord tribord, en passant par la quille. */
  private ring(s: Station): THREE.Vector3[] {
    const { z, keel: k } = s;
    const half = this.profile(s);
    return [
      ...half.map(([x, y]) => new THREE.Vector3(x, y, z)),
      new THREE.Vector3(0, k, z),
      ...[...half].reverse().map(([x, y]) => new THREE.Vector3(-x, y, z)),
    ];
  }
}
