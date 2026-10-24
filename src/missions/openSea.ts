import { LAND } from '../config';
import { ISLAND_LIST, land } from '../world/island';
import { worldEdge } from '../world/worldEdge';

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
/** Tirages pour trouver un point en pleine mer. */
const TRIES = 30;

/**
 * Un point en pleine mer à `distance` m de (cx, cz), dans une direction tirée à `spread` rad au plus de `bearing`
 * (tout autour par défaut), avec `radius` m de mer libre autour de lui : loin des côtes, des ports et du bord du monde.
 */
export function findOpenSea(cx: number, cz: number, distance: readonly [number, number], radius: number, bearing = 0, spread = Math.PI): { x: number; z: number } {
  for (let i = 0; i < TRIES; i++) {
    const angle = bearing + (Math.random() * 2 - 1) * spread;
    const d = rand(distance);
    const x = cx + Math.sin(angle) * d;
    const z = cz + Math.cos(angle) * d;
    const nearPort = ISLAND_LIST.some((island) => Math.hypot(x - island.port.x, z - island.port.z) < LAND.portClearance);
    if (!nearPort && land.sdf(x, z) > radius + LAND.spawnClearance && worldEdge.room(x, z) > radius) return { x, z };
  }
  return land.keepOffshore(cx + Math.sin(bearing) * distance[1], cz + Math.cos(bearing) * distance[1], radius + LAND.spawnClearance);
}
