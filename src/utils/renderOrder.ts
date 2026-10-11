/**
 * Ordre de rendu des objets opaques. Tout ce qui n'est pas listé ici vaut 0.
 * Le ciel d'abord, puis les objets, puis les masques anti-eau des coques, et l'océan en dernier :
 * l'eau échoue au test de profondeur là où un masque a été dessiné.
 */
export const RENDER_ORDER = {
  sky: -1,
  waterMask: 1,
  ocean: 2,
};
