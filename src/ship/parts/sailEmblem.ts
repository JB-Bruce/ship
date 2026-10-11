import * as THREE from 'three';

/** Taille de l'emblème, en fraction du plus petit côté de la voile. */
const EMBLEM_SIZE = 0.55;
const GOLD = new THREE.Color(0xe0b13a);
const OUTLINE = new THREE.Color(0x4a3410);

let texture: THREE.CanvasTexture | null = null;

/**
 * Masque de la couronne de la Marine : rouge = dorure, vert = contour sombre et pierres.
 * Les couleurs viennent des uniforms (déjà en espace linéaire), la texture ne sert que de masque.
 */
function crownMask(): THREE.CanvasTexture {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const crown = () => {
    g.beginPath();
    g.moveTo(24, 92);
    for (const [x, y] of [[18, 40], [42, 62], [64, 30], [86, 62], [110, 40], [104, 92]]) g.lineTo(x, y);
    g.closePath();
    g.rect(24, 92, 80, 16);
  };
  const balls = (r: number) => {
    for (const [x, y] of [[18, 36], [64, 25], [110, 36]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  // Contour : le même dessin, plus épais, en vert ; puis la dorure par-dessus en rouge.
  g.fillStyle = g.strokeStyle = '#00ff00';
  g.lineWidth = 9;
  g.lineJoin = 'round';
  crown();
  g.stroke();
  balls(10);
  g.fillStyle = '#ff0000';
  crown();
  g.fill();
  balls(6);
  // Pierres serties dans le bandeau.
  g.fillStyle = '#00ff00';
  for (const x of [42, 64, 86]) {
    g.beginPath();
    g.arc(x, 100, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Uniforms d'un emblème posé au centre d'une voile, d'après sa géométrie (repère de la voile). */
export function emblemUniforms(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Voile carrée ou foc : toile dans le plan XY ; voile aurique : dans le plan ZY.
  const alongZ = size.z > size.x ? 1 : 0;
  const width = alongZ ? size.z : size.x;
  return {
    uEmblem: { value: crownMask() },
    uEmblemBox: { value: new THREE.Vector4(alongZ ? center.z : center.x, center.y, Math.min(width, size.y) * EMBLEM_SIZE, alongZ) },
    uEmblemGold: { value: GOLD },
    uEmblemDark: { value: OUTLINE },
  };
}

/** Déclarations GLSL de l'emblème (à placer après `vSailPos`). */
export const EMBLEM_DECLARATIONS = /* glsl */ `
uniform sampler2D uEmblem;
uniform vec4 uEmblemBox;
uniform vec3 uEmblemGold;
uniform vec3 uEmblemDark;`;

/** Peint l'emblème sur `diffuseColor`, dans le repère de la voile (il suit la toile quand elle se cargue). */
export const EMBLEM_FRAGMENT = /* glsl */ `
  vec2 emblemUv = vec2(mix(vSailPos.x, vSailPos.z, uEmblemBox.w) - uEmblemBox.x, vSailPos.y - uEmblemBox.y) / uEmblemBox.z + 0.5;
  if (emblemUv.x > 0.0 && emblemUv.x < 1.0 && emblemUv.y > 0.0 && emblemUv.y < 1.0) {
    vec4 emblem = texture2D(uEmblem, emblemUv);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEmblemDark, emblem.g);
    diffuseColor.rgb = mix(diffuseColor.rgb, uEmblemGold, emblem.r);
  }`;
