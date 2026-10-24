const DEG = Math.PI / 180;

/** Tracé d'une enceinte en étoile. Angles par rapport à l'axe de chaque bastion, rayons depuis le centre (m). */
export interface StarShape {
  bastions: number;
  /** Pointe d'un bastion, ses épaules et le départ des courtines. */
  tip: number;
  shoulder: { angle: number; radius: number };
  curtain: { angle: number; radius: number };
}

/** Plan d'un fort bastionné. Le bastion n° 0 pointe vers le large. */
export interface FortLayout extends StarShape {
  /** Bastions qui portent une guérite à leur pointe (ceux côté terre, ou tous pour une grande place forte). */
  sentries: readonly number[];
  /** Hauteur du terre-plein au-dessus du point le plus haut du terrain sous le fort (m). */
  wallHeight: number;
  /** Cordon : bandeau de pierre sombre en saillie au sommet de l'escarpe. */
  cordon?: boolean;
  /** Cavalier : enceinte intérieure en étoile, plus haute de `height` m que le terre-plein, sa pointe n° 0 vers le large. */
  inner?: StarShape & { height: number };
  /** Emplacements des canons, dans l'ordre de mise en service : [angle depuis l'axe côté mer, rayon, sur le cavalier]. */
  gunSlots: readonly (readonly [number, number, boolean?])[];
  /** Tour de guet au centre (côté, hauteur, m) ; avec `turrets` (rayon, m), un donjon flanqué de tourelles coiffées d'ardoise. */
  tower: { size: number; height: number; turrets?: number };
  /** Casernes côté terre : distance au centre (m), écarts d'angle depuis l'axe côté terre (rad). */
  barracks: { radius: number; angles: readonly number[] };
  /** Taille du pavillon (1 = celui du fort de la Tortue). */
  flag?: number;
}

export const FORT_LAYOUTS = {
  /** Fort de la Tortue : 5 bastions, jusqu'à 5 canons (bastions des flancs, de pointe, puis courtines côté mer). */
  fort: {
    bastions: 5,
    tip: 12.5,
    shoulder: { angle: 11 * DEG, radius: 9.6 },
    curtain: { angle: 21 * DEG, radius: 8 },
    sentries: [2, 3],
    wallHeight: 3.8,
    gunSlots: [[72 * DEG, 8.8], [-72 * DEG, 8.8], [0, 8.8], [36 * DEG, 6.7], [-36 * DEG, 6.7]],
    tower: { size: 4, height: 5 },
    barracks: { radius: 5.4, angles: [0] },
  },
  /** Citadelle de Port-Sabre : 6 bastions, plus haute et plus large, jusqu'à 8 canons. */
  citadel: {
    bastions: 6,
    tip: 16,
    shoulder: { angle: 9 * DEG, radius: 12.4 },
    curtain: { angle: 18 * DEG, radius: 10.4 },
    sentries: [3],
    wallHeight: 5.5,
    gunSlots: [
      [60 * DEG, 11.6], [-60 * DEG, 11.6], [0, 11.6], [30 * DEG, 8.9],
      [-30 * DEG, 8.9], [120 * DEG, 11.6], [-120 * DEG, 11.6], [90 * DEG, 8.9],
    ],
    tower: { size: 5.5, height: 7 },
    barracks: { radius: 7, angles: [0] },
  },
  /**
   * Fort-Royal (Marine) : la plus grande place forte de l'archipel. Enceinte à 8 bastions, tous gardés par une
   * guérite, cordonnée ; au centre, un cavalier à 4 bastions, plus haut, qui porte un donjon flanqué de tourelles et le
   * grand pavillon. Jusqu'à 11 canons, par paires autour de l'axe (deux sur le cavalier, qui tirent par-dessus tout).
   */
  royal: {
    bastions: 8,
    tip: 30,
    shoulder: { angle: 7 * DEG, radius: 23.5 },
    curtain: { angle: 14 * DEG, radius: 20 },
    sentries: [0, 1, 2, 3, 4, 5, 6, 7],
    wallHeight: 6,
    cordon: true,
    inner: { bastions: 4, tip: 14, shoulder: { angle: 12 * DEG, radius: 10.5 }, curtain: { angle: 25 * DEG, radius: 8.5 }, height: 5 },
    gunSlots: [
      [0, 23], [45 * DEG, 23], [-45 * DEG, 23], [90 * DEG, 9.6, true], [-90 * DEG, 9.6, true], [22.5 * DEG, 17],
      [-22.5 * DEG, 17], [90 * DEG, 23], [-90 * DEG, 23], [135 * DEG, 23], [-135 * DEG, 23],
    ],
    tower: { size: 7, height: 8, turrets: 1.3 },
    barracks: { radius: 17, angles: [-0.42, 0] },
    flag: 1.6,
  },
} satisfies Record<string, FortLayout>;
