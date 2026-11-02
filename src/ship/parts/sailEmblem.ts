import * as THREE from 'three';
import { EMBLEMS, type EmblemId } from '../../config';
import { drawEmblem } from './emblemDesigns';

/** Taille de l'emblème, en fraction du plus petit côté de la voile. */
const EMBLEM_SIZE = 0.55;
/** Couronne de la Marine (livrée d'élite) : dorure et contour. */
const CROWN = { main: new THREE.Color(0xe0b13a), second: new THREE.Color(0x4a3410) };

const masks = new Map<string, THREE.CanvasTexture>();

/**
 * Masque d'un emblème (128 × 128) : rouge = couleur principale, vert = seconde couleur (contour, détails). Les
 * couleurs viennent des uniforms, la texture ne sert que de masque.
 */
function mask(id: EmblemId | 'crown'): THREE.CanvasTexture {
  let texture = masks.get(id);
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  drawEmblem(canvas.getContext('2d')!, id);
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  masks.set(id, texture);
  return texture;
}

/** Ce que peint l'emblème d'un navire (partagé par sa voile à emblème) : masque, couleurs, affiché ou non. */
export interface EmblemState {
  uEmblem: { value: THREE.Texture };
  uEmblemGold: { value: THREE.Color };
  uEmblemDark: { value: THREE.Color };
  uEmblemShow: { value: number };
}

/** État d'emblème d'un navire : la couronne si sa livrée en porte une (`crown`), sinon rien tant qu'on n'en choisit pas. */
export function emblemState(crown: boolean): EmblemState {
  return {
    uEmblem: { value: mask('crown') },
    uEmblemGold: { value: CROWN.main.clone() },
    uEmblemDark: { value: CROWN.second.clone() },
    uEmblemShow: { value: crown ? 1 : 0 },
  };
}

/** Peint l'emblème choisi par le joueur (null : aucun) ; la couronne d'une livrée d'élite reste si `crown`. */
export function setEmblem(state: EmblemState, id: EmblemId | null, crown: boolean) {
  if (id) {
    const def = EMBLEMS.designs[id];
    state.uEmblem.value = mask(id);
    state.uEmblemGold.value.set(def.main);
    state.uEmblemDark.value.set(def.second);
    state.uEmblemShow.value = 1;
    return;
  }
  state.uEmblem.value = mask('crown');
  state.uEmblemGold.value.copy(CROWN.main);
  state.uEmblemDark.value.copy(CROWN.second);
  state.uEmblemShow.value = crown ? 1 : 0;
}

/** Cadre de l'emblème au centre d'une voile, d'après sa géométrie (repère de la voile). */
export function emblemBox(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Voile carrée ou foc : toile dans le plan XY ; voile aurique : dans le plan ZY.
  const alongZ = size.z > size.x ? 1 : 0;
  const width = alongZ ? size.z : size.x;
  return { uEmblemBox: { value: new THREE.Vector4(alongZ ? center.z : center.x, center.y, Math.min(width, size.y) * EMBLEM_SIZE, alongZ) } };
}

/** Déclarations GLSL de l'emblème (à placer après `vSailPos` et `uWear`). */
export const EMBLEM_DECLARATIONS = /* glsl */ `
uniform sampler2D uEmblem;
uniform vec4 uEmblemBox;
uniform vec3 uEmblemGold;
uniform vec3 uEmblemDark;
uniform float uEmblemShow;`;

/**
 * Peint l'emblème sur `diffuseColor`, dans le repère de la voile (il suit la toile quand elle se cargue). Avec
 * l'ancienneté (`uWear`), la peinture passe et s'écaille.
 */
export const EMBLEM_FRAGMENT = /* glsl */ `
  vec2 emblemUv = vec2(mix(vSailPos.x, vSailPos.z, uEmblemBox.w) - uEmblemBox.x, vSailPos.y - uEmblemBox.y) / uEmblemBox.z + 0.5;
  if (uEmblemShow > 0.5 && emblemUv.x > 0.0 && emblemUv.x < 1.0 && emblemUv.y > 0.0 && emblemUv.y < 1.0) {
    vec4 emblem = texture2D(uEmblem, emblemUv);
    float flake = step(1.0 - 0.45 * uWear, tearValue(emblemUv * 9.0 + 3.0));
    float paint = (1.0 - 0.35 * uWear) * (1.0 - flake);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEmblemDark, emblem.g * paint);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEmblemGold, emblem.r * paint);
  }`;
