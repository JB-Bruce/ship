import { GRAPHICS, type GraphicsSettings } from '../config';
import type { LampLights } from '../fx/lampLights';
import { particleBudget } from '../fx/particles';
import type { Ocean } from '../ocean/oceanMesh';
import type { WakeMap } from '../ocean/wakeMap';
import type { Weather } from '../world/weather';
import type { Display } from './display';

/** Ce que les réglages graphiques modifient. */
export interface QualityTargets {
  readonly display: Display;
  readonly ocean: Ocean;
  readonly wakes: WakeMap;
  readonly weather: Weather;
  readonly lamps: LampLights;
}

/** Applique les réglages graphiques (au lancement et à chaque changement dans les paramètres). */
export function applyQuality(g: GraphicsSettings, t: QualityTargets) {
  t.display.apply(g);
  t.ocean.setGrid(g.oceanGrid);
  t.ocean.setDetailDistance(GRAPHICS.detailDistance[g.farWater]);
  t.wakes.setResolution(g.wakeResolution);
  t.wakes.setHullFoamRange(GRAPHICS.hullFoamRange[g.farWater]);
  t.weather.setEffectDensity(g.weatherDensity);
  particleBudget.density = g.particleDensity;
  t.lamps.setCount(g.lampLights);
}
