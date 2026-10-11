import * as THREE from 'three';

/** État de la mer réglé par la météo et lu par le shader de l'océan. */
export const seaStateUniforms = {
  /** Écume de tempête (0 = mer normale, 1 = grosse tempête) : crêtes blanches et traînées étirées par le vent. */
  uSeaFoam: { value: 0 },
  /** Direction vers laquelle souffle le vent (x, z), pour orienter les traînées d'écume. */
  uWindDir: { value: new THREE.Vector2(0, 1) },
};
