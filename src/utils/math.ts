/** Avance `current` vers `target` d'au plus `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Ramène un angle dans [-π, π]. */
export function wrapAngle(angle: number): number {
  return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
}
