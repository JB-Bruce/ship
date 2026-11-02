import * as THREE from 'three';
import { GeometryBatch } from '../../utils/geometryBatch';
import { sideTf, std } from '../parts/common';
import { addCastleStairs, bulkhead } from '../parts/deckFittings';
import type { Station } from '../parts/hullShape';
import type { Palette } from '../parts/props';
import { DARK_WOOD, GILT, HULL_WOOD } from '../galleon/galleonDecor';
import { DECK_Y, HIGH_Y, LOW_Y, PORT, type ShipOfLineLayout } from './shipOfLineLayout';

/** Bandes ocre le long des deux batteries (le « damier » des sabords noirs), les mêmes pour tous les camps. */
export const OCHRE = std(0xcf9f45);
/** Demi-hauteur des bandes ocre autour des sabords (m). */
const BAND_HALF = 0.4;
/** Préceintes en bois sombre (hauteur au milieu, part de la tonture suivie, épaisseur) : sous la batterie basse, entre les batteries, sous les hauts peints. */
const WALES = [
  { y: 1.8, sheer: 1, height: 0.22 },
  { y: (LOW_Y + HIGH_Y) / 2, sheer: 1, height: 0.2 },
  { y: HIGH_Y + 0.65, sheer: 1.2, height: 0.22 },
] as const;
/** Le haut du bordé peint s'arrête à cette distance sous le plat-bord (m). */
const PAINT_BELOW_RAIL = 0.08;
/** Sous la poupe, la quille remonte en voûte : bandes et préceintes s'arrêtent à cette hauteur au-dessus d'elle (m). */
const COUNTER_CLEAR = 1;
/** Bas d'une bande, relevé là où la voûte de la poupe remonte (la bande s'efface au lieu de passer dessous). */
const aboveCounter = (y: number, s: Station) => Math.max(y, s.keel + COUNTER_CLEAR);

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/**
 * Bordé : coque en bois, bandes ocre des deux batteries, préceintes sombres qui suivent la tonture, hauts peints aux
 * couleurs du camp jusque sous la lisse dorée ; sabords des batteries (noirs, dans les bandes) et des pièces (dans le
 * pavois) ; fenêtres de la chambre sous la dunette.
 */
export function addPlanking(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout) {
  const { hull } = L;
  const identity = new THREE.Matrix4();
  const shell = hull.buildHull();
  batch.add(HULL_WOOD, shell, identity);
  batch.add(p.hullInside, shell.clone(), identity);
  for (const y of [LOW_Y, HIGH_Y]) {
    const low = (_s: Station, u: number) => y + L.sheer(u) - BAND_HALF;
    batch.add(OCHRE, hull.buildBand((s, u) => aboveCounter(low(s, u), s), (s, u) => low(s, u) + 2 * BAND_HALF, 0.015), identity);
  }
  for (const w of WALES) {
    const low = (_s: Station, u: number) => w.y + w.sheer * L.sheer(u) - w.height / 2;
    batch.add(DARK_WOOD, hull.buildBand((s, u) => aboveCounter(low(s, u), s), (s, u) => low(s, u) + w.height, 0.03), identity);
  }
  const top = WALES[2];
  batch.add(p.hull, hull.buildBand((s, u) => aboveCounter(top.y + top.sheer * L.sheer(u) + top.height / 2, s), (s) => s.gunwale - PAINT_BELOW_RAIL, 0.012), identity);
  for (const side of [1, -1] as const) batch.add(GILT, hull.buildRail(side, 1, 0, 0.1), identity);

  for (const side of [1, -1] as const) {
    for (const u of L.lowPorts) batch.add(p.dark, box(0.07, PORT.low[0], PORT.low[1]), sideTf(hull, L.station(u), LOW_Y + L.sheer(u), side, 0.035));
    for (const u of L.highPorts) batch.add(p.dark, box(0.07, PORT.high[0], PORT.high[1]), sideTf(hull, L.station(u), HIGH_Y + L.sheer(u), side, 0.035));
    for (const { u, y } of L.pieceSlots) batch.add(p.dark, box(0.05, 0.42, 0.48), sideTf(hull, L.station(u), y + 0.4, side, 0.03));
    for (const { u, y } of L.windows) {
      batch.add(GILT, box(0.04, 0.56, 0.5), sideTf(hull, L.station(u), y, side, 0.015));
      batch.add(p.window, box(0.05, 0.44, 0.38), sideTf(hull, L.station(u), y, side, 0.03));
    }
  }
}

/**
 * Châteaux bas : cloisons (portes, fenêtres) et escaliers du gaillard d'arrière et de la dunette (vers l'avant), du
 * gaillard d'avant (vers l'arrière).
 */
export function addCastles(batch: GeometryBatch, p: Palette, L: ShipOfLineLayout) {
  const { hull, quarterdeck, poop, forecastle } = L;

  const qd = bulkhead(batch, p, hull, L.station(quarterdeck.to), DECK_Y, quarterdeck.y, 1);
  qd(0, DECK_Y + 0.65, 0.85, 1.25, p.dark);
  for (const x of [-1.7, 1.7]) qd(x, DECK_Y + 0.85, 0.44, 0.36, p.window);
  for (const side of [1, -1]) addCastleStairs(batch, p, side * 2.5, L.station(quarterdeck.to).z, DECK_Y, quarterdeck.y, 1, 0.7);

  const pp = bulkhead(batch, p, hull, L.station(poop.to), quarterdeck.y, poop.y, 1);
  pp(-0.4, quarterdeck.y + 0.7, 0.8, 1.35, p.dark);
  for (const x of [-1.8, 1.2, 2.2]) pp(x, quarterdeck.y + 1, 0.4, 0.36, p.window);
  addCastleStairs(batch, p, 0.9, L.station(poop.to).z, quarterdeck.y, poop.y, 1, 0.55);

  const fcBack = L.station(forecastle.from);
  const fb = bulkhead(batch, p, hull, fcBack, DECK_Y, forecastle.y, -1);
  fb(0, DECK_Y + 0.62, 0.85, 1.2, p.dark);
  for (const x of [-1.6, 1.6]) fb(x, DECK_Y + 0.85, 0.4, 0.34, p.window);
  for (const side of [1, -1]) addCastleStairs(batch, p, side * 2.3, fcBack.z, DECK_Y, forecastle.y, -1, 0.65);
}
