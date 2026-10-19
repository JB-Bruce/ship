import { AIM } from '../config';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import type { CannonTarget } from './cannons';

/**
 * Le point visé par un canon sur sa cible, tiré à nouveau à chaque coup : `along` en part de la demi-longueur du navire
 * (vers la proue), `height` au-dessus de sa flottaison (m). `target` : la cible pour laquelle il a été tiré.
 */
export interface AimPoint {
  target: CannonTarget | null;
  along: number;
  height: number;
}

export const newAimPoint = (): AimPoint => ({ target: null, along: 0, height: AIM.structureHeight });

/** Un navire (sinon, un ouvrage assiégé) : test de forme plutôt que `instanceof`, qui échoue sur des modules rechargés. */
const isShip = (target: CannonTarget): target is Ship => 'heading' in target && 'model' in target;

const between = (a: number, b: number) => a + (b - a) * Math.random();

/**
 * Tire un nouveau point sur cette cible : un point au hasard le long de la coque, de la poupe à la proue, entre la
 * flottaison et le plat-bord ; un tir sur cinq vise plus haut, dans le gréement (il ne touche que s'il passe quand même
 * dans la coque). Ce qui n'est pas un navire (ouvrage assiégé) est visé en son centre.
 */
export function pickAimPoint(point: AimPoint, target: CannonTarget) {
  point.target = target;
  if (!isShip(target)) {
    point.along = 0;
    point.height = AIM.structureHeight;
    return;
  }
  const mast = target.model.flagMount.position.y;
  if (mast >= AIM.riggingMinHeight && Math.random() < AIM.riggingShare) {
    point.along = between(-AIM.riggingSpan, AIM.riggingSpan);
    point.height = mast * between(AIM.riggingLow, AIM.riggingHigh);
  } else {
    point.along = between(-AIM.hullSpan, AIM.hullSpan);
    point.height = between(AIM.hullLow, AIM.hullHigh);
  }
}

/** Position (x, z) dans le monde du point visé, sans anticipation : écrite dans `out`. */
export function aimSpot(point: AimPoint, target: CannonTarget, out: { x: number; z: number }) {
  out.x = target.position.x;
  out.z = target.position.z;
  if (!isShip(target)) return;
  const shift = point.along * target.stats.length * 0.5;
  out.x += Math.sin(target.heading) * shift;
  out.z += Math.cos(target.heading) * shift;
}

/**
 * Hauteur (y du monde) du point visé, arrivé en (x, z) : celle de la coque à cet endroit (son tangage compris), mais
 * jamais sous la surface de l'eau à cet endroit (on ne vise pas la partie immergée de la coque).
 */
export function aimHeight(point: AimPoint, target: CannonTarget, x: number, z: number, waves: Waves): number {
  const y = target.position.y + point.height;
  if (!isShip(target)) return y;
  const hull = y + Math.sin(target.pitch) * point.along * target.stats.length * 0.5;
  return Math.max(hull, waves.heightAt(x, z) + AIM.waterClearance);
}

/** Facteur d'imprécision selon la distance : 1 à bout portant, AIM.farSpread à la portée maximale `range`. */
export const distanceSpread = (distance: number, range: number) => 1 + (AIM.farSpread - 1) * Math.min(1, distance / range);
