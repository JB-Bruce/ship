import { doorSconces, lampsFor, mastTopLamp, sconceHeight, type LampSpec } from '../parts/shipLamps';
import { CARAVEL_HULL, DECK_Y, MAIN_MAST, QUARTERDECK } from './caravelLayout';

/** Face avant de la cloison du château (12 cm d'épaisseur, centrée sur sa station). */
const CASTLE_FACE = 0.06;
/** Hune du grand mât (caravelTemplate : cylindre de 0,5 m centré sur `topPlatform`, 0,62 m de rayon au-dessous). */
const TOP = { half: 0.25, rim: 0.62 };

/**
 * Lampes de la caravelle en plus de son fanal de poupe (parts/shipLamps.ts) : la lanterne de hune du grand mât, puis
 * deux appliques de part et d'autre de la porte du château arrière (entre la porte et les fenêtres).
 */
export const CARAVEL_LAMPS: readonly LampSpec[] = lampsFor('caravel', 0, [
  mastTopLamp(MAIN_MAST.z, MAIN_MAST.topPlatform - TOP.half, TOP.rim),
  ...doorSconces(CARAVEL_HULL.stationAt(QUARTERDECK.to).z + CASTLE_FACE, sconceHeight(DECK_Y, QUARTERDECK.y), 0.55),
]);
