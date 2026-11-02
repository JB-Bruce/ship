import * as THREE from 'three';
import { std } from '../ship/parts/common';
import { cylinderBetween } from '../ship/parts/sails';
import { GeometryBatch } from '../utils/geometryBatch';

/** Bois noyé (mâts, vergues, bordé), cordages, lambeaux de toile verdis, hune. */
const M = {
  spar: std(0x5a4a3a),
  dark: std(0x3a2e24),
  rope: std(0x4a4034),
  canvas: std(0xa59c7e, { side: THREE.DoubleSide }),
  reef: std(0x5e5a50, { roughness: 1 }),
};
/** Têtes de roche du récif qui affleurent autour de l'épave : (x, z, taille, hauteur au-dessus de l'eau), repère de l'épave. */
const REEF: readonly (readonly [number, number, number, number])[] = [
  [5, 4, 2.2, 0.5],
  [-6, 11, 1.6, 0.3],
  [7, -6, 2.8, 0.7],
  [-4, -13, 1.8, 0.2],
  [10, 14, 1.4, 0.4],
  [-9, -3, 2.4, 0.1],
];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Épave d'un trois-mâts couché sur un récif, dans son repère (proue vers +z, couchée sur bâbord) : les mâts qui sortent
 * de l'eau en penchant, une vergue tombée en travers, un lambeau de voile, la hune, des haubans, la pointe du beaupré et
 * un bout de plat-bord au ras de l'eau. Tout le reste est sous la surface.
 */
function wreckParts(batch: GeometryBatch) {
  const id = new THREE.Matrix4();
  const spar = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, m = M.spar) => batch.add(m, cylinderBetween(a, b, r0, r1, 7), id);
  // Grand mât : penché vers bâbord, brisé au-dessus de la hune.
  const mainFoot = v(-1.5, -7, 0);
  const mainTop = v(4.2, 13, 0.6);
  spar(mainFoot, mainTop, 0.42, 0.26);
  const top = mainFoot.clone().lerp(mainTop, 0.78);
  batch.add(M.dark, new THREE.CylinderGeometry(1.5, 1.3, 0.35, 8).applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.28)).translate(top.x, top.y, top.z), id);
  // Grande vergue tombée en travers du mât, un bout dans l'eau.
  const yardMid = mainFoot.clone().lerp(mainTop, 0.55);
  spar(yardMid.clone().add(v(-1.5, 3.2, -6.5)), yardMid.clone().add(v(1.2, -4.5, 6)), 0.18, 0.14);
  // Lambeau de voile pendu à la vergue : un quadrilatère déchiré.
  const sail = new THREE.BufferGeometry().setFromPoints([
    yardMid.clone().add(v(-1.2, 2.6, -5.2)),
    yardMid.clone().add(v(0, -0.2, -1)),
    yardMid.clone().add(v(-0.6, -2.8, -3.6)),
    yardMid.clone().add(v(-1.2, 2.6, -5.2)),
    yardMid.clone().add(v(-0.6, -2.8, -3.6)),
    yardMid.clone().add(v(-1.6, -1, -6.4)),
  ]);
  sail.computeVertexNormals();
  batch.add(M.canvas, sail, id);
  // Misaine : plus courte, cassée net, penchée vers l'avant.
  spar(v(-1, -7, 9), v(2.6, 7.5, 12), 0.36, 0.3);
  spar(v(2.2, 6.4, 11.6), v(3.4, 6.9, 13.2), 0.3, 0.12, M.dark);
  // Artimon : un chicot à peine sorti de l'eau.
  spar(v(-1.2, -7, -8), v(0.8, 2.4, -8.6), 0.3, 0.24);
  // Beaupré : sa pointe sort de l'eau, levée vers le ciel.
  spar(v(-0.5, -2, 15), v(0.2, 2.2, 21), 0.3, 0.16);
  // Haubans encore tendus du grand mât vers l'eau, et cordages qui pendent.
  for (const [x, z] of [[-3, -2], [-3.4, 1.6], [6.5, -1.2]] as const) spar(v(x, -0.4, z), top.clone().add(v(0, -0.3, 0)), 0.05, 0.05, M.rope);
  for (const dz of [-3, 3]) spar(yardMid.clone().add(v(0.4, -1, dz * 0.6)), yardMid.clone().add(v(0.9, -5.5, dz * 0.7)), 0.04, 0.04, M.rope);
  // Plat-bord tribord au ras de l'eau, et deux allonges de membrures cassées.
  spar(v(-3.6, 0.3, -9), v(-3.2, 0.5, 9), 0.22, 0.22, M.dark);
  spar(v(-3.4, -1, 2), v(-3.9, 1.4, 2.4), 0.16, 0.12, M.dark);
  spar(v(-3.3, -1, -4), v(-3.7, 1.1, -4.5), 0.16, 0.12, M.dark);
  // Le récif qui l'a ouverte.
  REEF.forEach(([x, z, size, above], i) => {
    const rock = new THREE.DodecahedronGeometry(size, 0);
    rock.scale(1.3, 1, 1);
    rock.rotateY(i * 1.7);
    batch.add(M.reef, rock.translate(x, above - size * 0.4, z), id);
  });
}

/** L'épave posée en (x, z), sa proue vers le cap `heading`. */
export function buildSunkenWreck(x: number, z: number, heading: number): THREE.Group {
  const batch = new GeometryBatch();
  wreckParts(batch);
  const group = new THREE.Group();
  for (const { geometry, material } of batch.build()) group.add(new THREE.Mesh(geometry, material));
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return group;
}
