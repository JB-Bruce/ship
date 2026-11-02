import * as THREE from 'three';
import { SAIL_BILLOW } from '../../config';

/** Nombre de facettes le long d'un côté de voile de `length` mètres : les grandes voiles restent souples une fois gonflées. */
export function sailSegments(length: number, facet: number = SAIL_BILLOW.facet): number {
  return THREE.MathUtils.clamp(Math.ceil(length / facet), SAIL_BILLOW.minSegments, SAIL_BILLOW.maxSegments);
}

/**
 * Voile carrée gonflée vers l'avant (+Z), ancrée en haut (y = 0) pour se carguer vers sa vergue :
 * on l'écrase en Y depuis le haut.
 */
export function buildSquareSail(width: number, height: number, bulge: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, sailSegments(width), sailSegments(height));
  geometry.translate(0, -height / 2, 0);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (2 * pos.getX(i)) / width;
    pos.setZ(i, bulge * (1 - u * u));
  }
  return geometry;
}

/**
 * Voile triangulaire (foc), origine au point d'amure. `head` et `clew` sont relatifs à l'amure ;
 * la toile se creuse sur +X (on la retourne en X pour l'autre bord).
 */
export function buildTriangleSail(head: THREE.Vector3, clew: THREE.Vector3, bulge: number, n = sailSegments(Math.max(head.length(), clew.length()), SAIL_BILLOW.triangleFacet)): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const ids: number[][] = [];
  for (let i = 0; i <= n; i++) {
    ids.push([]);
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const p = head.clone().multiplyScalar(u).add(clew.clone().multiplyScalar(v));
      p.x = bulge * 27 * u * v * (1 - u - v);
      ids[i].push(positions.length / 3);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      index.push(ids[i][j], ids[i + 1][j], ids[i][j + 1]);
      if (j < n - i - 1) index.push(ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Cylindre tendu entre deux points (espars, beaupré…). */
export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segments = 6): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(r1, r0, dir.length(), segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

/** Voile aurique (trapèze) : amure et point d'écoute sur la bôme, gorge et pic sur la corne ; creux sur +X. */
export interface GaffSailShape {
  tack: THREE.Vector3;
  clew: THREE.Vector3;
  peak: THREE.Vector3;
  throat: THREE.Vector3;
  bulge: number;
}

/** Voile aurique dans le repère de son gréement (plan x = 0, vers l'arrière), creusée par `bulge`. */
export function buildGaffSail({ tack, clew, peak, throat, bulge }: GaffSailShape, n = sailSegments(Math.max(tack.distanceTo(clew), tack.distanceTo(throat)))): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const t = j / n;
      bottom.lerpVectors(tack, clew, s);
      top.lerpVectors(throat, peak, s);
      const p = bottom.lerp(top, t);
      p.x = bulge * 16 * s * (1 - s) * t * (1 - t);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      index.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Voile latine : un triangle envergué sur une longue vergue inclinée qui croise le mât. Points dans le repère de son
 * gréement (plan x = 0, origine sur le mât, là où la vergue le croise) : `tack` = bout bas de la vergue, vers l'avant ;
 * `peak` = bout haut, vers l'arrière ; `clew` = point d'écoute, en bas à l'arrière.
 */
export interface LateenSailShape {
  tack: THREE.Vector3;
  peak: THREE.Vector3;
  clew: THREE.Vector3;
  bulge: number;
}

/**
 * Voile latine dans le repère de sa vergue : origine au bout bas (`tack`), vergue le long de +Z, toile d'un côté de
 * la vergue dans le plan YZ, creux sur +X. Pour la carguer contre sa vergue, on l'écrase en Y. `pitch` : rotation
 * autour de X qui couche ce repère sur la vergue, dans le repère du gréement (à poser au point `tack`).
 */
export function buildLateenSail({ tack, peak, clew, bulge }: LateenSailShape): { sail: THREE.BufferGeometry; pitch: number; yardLength: number } {
  const along = peak.clone().sub(tack);
  const pitch = Math.atan2(-along.y, along.z);
  const toYard = (v: THREE.Vector3) => v.clone().sub(tack).applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
  const yardLength = along.length();
  return { sail: buildTriangleSail(toYard(peak), toYard(clew), bulge), pitch, yardLength };
}
