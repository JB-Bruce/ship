import * as THREE from 'three';
import { DECK_NAV } from '../config';
import { visibleParts } from './deckGrid';
import type { DeckNav } from './deckNav';

/** Un hauban où un matelot peut grimper : son pied et sa tête (repère du modèle), le nœud du pont d'où l'on y monte. */
export interface Shroud {
  foot: THREE.Vector3;
  head: THREE.Vector3;
  side: 1 | -1;
  node: number;
}

/**
 * Les haubans, lus dans le gréement du modèle (segments de ligne) : un segment qui part du bord, près du pont, et
 * monte en rentrant vers l'axe jusqu'à bien plus haut. Un seul par mât et par bord (celui du milieu).
 */
export function findShrouds(root: THREE.Object3D, nav: DeckNav): Shroud[] {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const local = new THREE.Matrix4();
  let widest = 0;
  for (const list of nav.nodes) for (const n of list) widest = Math.max(widest, Math.abs(nav.x(n)));
  const groups = new Map<string, Shroud[]>();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  visibleParts(root, (object) => {
    const lines = object as THREE.LineSegments;
    if (!lines.isLineSegments) return;
    const position = lines.geometry.attributes.position as THREE.BufferAttribute;
    local.multiplyMatrices(inverse, lines.matrixWorld);
    for (let i = 0; i + 1 < position.count; i += 2) {
      p.fromBufferAttribute(position, i).applyMatrix4(local);
      q.fromBufferAttribute(position, i + 1).applyMatrix4(local);
      const [foot, head] = p.y < q.y ? [p, q] : [q, p];
      const side = foot.x > 0 ? 1 : -1;
      if (head.y - foot.y < DECK_NAV.shroudRise || Math.abs(foot.x) < widest * DECK_NAV.shroudReach) continue;
      // La tête rentre vers l'axe sans passer de l'autre bord (à un arrondi près : elle est souvent pile sur l'axe).
      if (side * head.x < -DECK_NAV.shroudAxis || Math.abs(head.x) > Math.abs(foot.x) - DECK_NAV.shroudInward) continue;
      const node = nav.nearestWalkable(foot.x - side * DECK_NAV.shroudStand, foot.y - DECK_NAV.shroudFootAbove, foot.z);
      if (node < 0) continue;
      const key = `${side}:${Math.round(head.z / DECK_NAV.shroudGroup)}`;
      const list = groups.get(key) ?? [];
      list.push({ foot: foot.clone(), head: head.clone(), side, node });
      groups.set(key, list);
    }
  });
  const out: Shroud[] = [];
  for (const list of groups.values()) {
    list.sort((u, v) => u.foot.z - v.foot.z);
    out.push(list[Math.floor(list.length / 2)]);
  }
  return out;
}
