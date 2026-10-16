import type { UpgradeLevels } from '../progression/upgrades';
import type { ShipType } from '../shipTypes';

/** Frégate allongée : coque sur toute la largeur, une rangée de sabords de plus, mâts plus espacés. */
export const LONG_FRIGATE_ICON = `<svg viewBox="0 0 48 48"><path d="M0 31h48l-4 9H4z"/><path d="M3 35h42M6 35v3M10 35v3M14 35v3M18 35v3M22 35v3M26 35v3M30 35v3M34 35v3M38 35v3M42 35v3M1 31v-5h8v5"/><path d="M11 31V9M25 31V3M38 31V8M6 12h10M5 19h12M19 7h12M18 15h14M18 22h14M33 11h10M32 18h12M48 31L38 10M38 23l-6 7"/></svg>`;

/** Grande frégate : coque encore plus longue et plus basse, deux châteaux, douze sabords. */
export const GRAND_FRIGATE_ICON = `<svg viewBox="0 0 48 48"><path d="M0 32h48l-3 7H3z"/><path d="M2 35.5h44M4 35.5v2.5M7.5 35.5v2.5M11 35.5v2.5M14.5 35.5v2.5M18 35.5v2.5M21.5 35.5v2.5M25 35.5v2.5M28.5 35.5v2.5M32 35.5v2.5M35.5 35.5v2.5M39 35.5v2.5M42.5 35.5v2.5M0 32v-6h10v6M38 32v-3h7v3"/><path d="M11 32V11M24 32V5M37 32V10M6 14h10M5 21h12M18 9h12M17 17h14M17 24h14M32 13h10M31 20h12M48 32L40 13"/></svg>`;

/** Corvette allongée : coque sur toute la largeur, six sabords. */
export const LONG_CORVETTE_ICON = `<svg viewBox="0 0 48 48"><path d="M0 30h48l-4 9H5z"/><path d="M4 34.5h40M8 34.5v2M14 34.5v2M20 34.5v2M26 34.5v2M32 34.5v2M38 34.5v2"/><path d="M12 30V10M25 30V3M37 30V6M20 8h10M19 16h12M32 11h10M31 19h12M12 12l-8 16h8M48 30l-11-22"/></svg>`;

/** Brigantin allongé : coque sur toute la largeur, mâts plus espacés, sabords du pont. */
export const LONG_BRIGANTINE_ICON = `<svg viewBox="0 0 48 48"><path d="M0 30h48l-4 9H5z"/><path d="M1 30v-6h8v6M40 30v-4h6M6 34h36M11 34v2M17 34v2M23 34v2M29 34v2M35 34v2"/><path d="M15 30V4M33 30V5M9 9h12M9 19h12M27 10h12M27 20h12M47 26l-14-20"/></svg>`;

/** Goélette à hunier : une voile carrée en tête du mât de misaine. */
export const TOPSAIL_SCHOONER_ICON = `<svg viewBox="0 0 48 48"><path d="M1 32h40l-5 7H7z"/><path d="M40 31l7-6M16 32L14 4M28 32L26.5 9M3 29h13M5 11l9-5M18 29h10M19 13l7-3"/><path d="M15 29H3l2-18 9-5zM27 29H18l1-16 7-3zM28 9l15 18H30z"/><path d="M21 2h10v5H21z"/></svg>`;

/** Grand chébec : coque plus longue, quatre sabords, mâts plus espacés. */
export const GRAND_XEBEC_ICON = `<svg viewBox="0 0 48 48"><path d="M1 30h40l7-2-6 4-4 7H9l-6-4z"/><path d="M0 30v-3h9v3M12 33.5h24M15 33.5v2M21 33.5v2M27 33.5v2M33 33.5v2"/><path d="M38 30l3-22M24 30l2-27M11 27l2-17M46 24L33 4M46 24L33 5l3 22zM18 8h13M17 16h16M18 17h15l-1 10H19zM19 8h11v7H19zM21 22L5 6M21 22L6 7l2 18z"/></svg>`;

/** Brick allongé : coque plus longue, onze sabords dans la bande. */
export const LONG_BRIG_ICON = `<svg viewBox="0 0 48 48"><path d="M1 30h45l-4 9H6z"/><path d="M2 33.5h42M5 33.5v2.5M9 33.5v2.5M13 33.5v2.5M17 33.5v2.5M21 33.5v2.5M25 33.5v2.5M29 33.5v2.5M33 33.5v2.5M37 33.5v2.5M41 33.5v2.5M3 29h40"/><path d="M33 30l-1-27M15 30l-1-28M27 6h11M26 12h13M25 19h15M24 26h17M9 5h11M8 11h13M7 18h15M6 25h17M15 15L1 12l1 15h13M46 29L33 6M33 17l12 11"/></svg>`;

/** Flûte allongée : coque plus longue en banane, sept sabords en batterie, mâts plus espacés. */
export const LONG_FLUYT_ICON = `<svg viewBox="0 0 48 48"><path d="M1 20l9 1 2 2v4q13 3 27 0v-2l6-1-4 14H9q-7-2-8-9z"/><path d="M2 29q19 5 37 0M11 32.5v2M15.5 33v2M20 33.3v2M24.5 33.4v2M29 33.3v2M33.5 33v2M38 32.4v2"/><path d="M35 26V6M23 29V3M9 21V9M30 9h10M29 15h12M28 21h14M17 6h12M16 12h14M15 19h16M15 18L2 5M15 18L3 6l1 12M45 24l3-8M45 20h3"/></svg>`;

/** Grande caraque : milieu plus long, cinq sabords de batterie. */
export const GRAND_CARRACK_ICON = `<svg viewBox="0 0 48 48"><path d="M1 16h6v3h4v3h4v5h18v-5h12l-3 6-1 3-3 9H10q-8-2-9-9z"/><path d="M16 32.5v2M21 32.5v2M26 32.5v2M31 32.5v2M36 32.5v2M9 24v1.5M13 26v1.5M39 25v1.5"/><path d="M38 22V7M25 27V3M12 19V8M4 16V9M33 10h10M32 15h12M19 7h12M18 13h14M17 20h16M17 17L7 6M7 13L0 7M44 23l4-7"/></svg>`;

/** Caraque royale : coque encore plus longue, six sabords de batterie, mâts plus espacés. */
export const ROYAL_CARRACK_ICON = `<svg viewBox="0 0 48 48"><path d="M0 16h6v3h4v3h3v5h22v-5h11l-2 6-1 3-3 9H8q-8-2-8-9z"/><path d="M14 32.5v2M18.5 32.5v2M23 32.5v2M27.5 32.5v2M32 32.5v2M36.5 32.5v2M8 24v1.5M11 26v1.5M40 25v1.5"/><path d="M40 22V7M25 27V3M11 19V8M3 16V9M35 10h10M34 15h12M19 7h12M18 13h14M17 20h16M16 17L6 6M6 13L0 7M46 23l2-5"/></svg>`;

/** Grande galéasse : coque plus longue, cinq sabords de batterie, sept avirons. */
export const GRAND_GALLEASS_ICON = `<svg viewBox="0 0 48 48"><path d="M1 25h6v3h29v-3h7l1 6-2 5H7l-6-5z"/><path d="M44 31.5l4-1-4 2.5M1 25q3-5 6 0M12 31v1.5M17.5 31v1.5M23 31v1.5M28.5 31v1.5M34 31v1.5M9 36l-2 5M13 36l-2 5M17 36l-2 5M21 36l-2 5M25 36l-2 5M29 36l-2 5M33 36l-2 5"/><path d="M34 28V10M22 28V4M11 28V12M42 21L29 6l2 18zM31 21L11 2l2 22zM16 22L4 10l1 11z"/></svg>`;

/** Galéasse capitane : coque encore plus longue, six sabords, huit avirons, fanal de poupe. */
export const CAPTAIN_GALLEASS_ICON = `<svg viewBox="0 0 48 48"><path d="M0 25h6v3h31v-3h7l1 6-2 5H6l-6-5z"/><path d="M45 31.5l3-1-3 2.5M0 25q3-5 6 0M10 31v1.5M15 31v1.5M20 31v1.5M25 31v1.5M30 31v1.5M35 31v1.5M8 36l-2 5M12 36l-2 5M16 36l-2 5M20 36l-2 5M24 36l-2 5M28 36l-2 5M32 36l-2 5M36 36l-2 5"/><path d="M35 28V10M22 28V4M10 28V12M43 21L30 6l2 18zM31 21L11 2l2 22zM15 22L3 10l1 11zM1 19h2v3H1z"/></svg>`;

/** Grand galion : milieu plus long, six sabords en batterie basse, cinq en batterie haute. */
export const GRAND_GALLEON_ICON = `<svg viewBox="0 0 48 48"><path d="M2 13h6v3h4v3h4v6h16v-3h8v3h3l4-1-4 3-2 4-3 7H11q-8-2-9-12z"/><path d="M14.5 33v1.5M19 33v1.5M23.5 33v1.5M28 33v1.5M32.5 33v1.5M37 33v1.5M16.5 29.5v1.5M21 29.5v1.5M25.5 29.5v1.5M30 29.5v1.5M34.5 29.5v1.5M13 21v1.5M10 18v1.5"/><path d="M36 22V6M24.5 25V2M13 19V7M5 13V6M31 9h10M30 15h12M18.5 5h12M17.5 11h14M16.5 18h16M18 16L8 4M8 11L1 5M39 22l5-7"/></svg>`;

/** Galion amiral : coque encore plus longue, sept et six sabords. */
export const ADMIRAL_GALLEON_ICON = `<svg viewBox="0 0 48 48"><path d="M2 13h6v3h4v3h4v6h17v-3h8v3h3l4-1-4 3-2 4-3 7H11q-8-2-9-12z"/><path d="M14 33v1.5M18.2 33v1.5M22.4 33v1.5M26.6 33v1.5M30.8 33v1.5M35 33v1.5M39.2 33v1.5M16 29.5v1.5M20.2 29.5v1.5M24.4 29.5v1.5M28.6 29.5v1.5M32.8 29.5v1.5M37 29.5v1.5M13 21v1.5M10 18v1.5"/><path d="M37 22V6M25 25V2M13 19V7M5 13V6M32 9h10M31 15h12M19 5h12M18 11h14M17 18h16M18 16L8 4M8 11L1 5M40 22l5-7"/></svg>`;

/** Silhouettes après chaque allongement, par type. */
const EXTENDED_ICONS: Partial<Record<ShipType, readonly string[]>> = {
  frigate: [LONG_FRIGATE_ICON, GRAND_FRIGATE_ICON],
  corvette: [LONG_CORVETTE_ICON],
  brigantine: [LONG_BRIGANTINE_ICON],
  schooner: [TOPSAIL_SCHOONER_ICON],
  xebec: [GRAND_XEBEC_ICON],
  fluyt: [LONG_FLUYT_ICON],
  carrack: [GRAND_CARRACK_ICON, ROYAL_CARRACK_ICON],
  galleass: [GRAND_GALLEASS_ICON, CAPTAIN_GALLEASS_ICON],
  galleon: [GRAND_GALLEON_ICON, ADMIRAL_GALLEON_ICON],
  brig: [LONG_BRIG_ICON],
};

/** Silhouette d'un type après son `index`-ième allongement (0 = le premier). */
export function extensionIcon(type: ShipType, index: number): string {
  return EXTENDED_ICONS[type]?.[index] ?? SHIP_ICONS[type];
}

/** Icône d'un navire de la flotte (allongé ou non). */
export function shipIcon(type: ShipType, levels: UpgradeLevels): string {
  return levels.extension > 0 ? extensionIcon(type, levels.extension - 1) : SHIP_ICONS[type];
}

/** Silhouettes des navires, dessinées au trait façon gravure (menus de flotte et du port). */
export const SHIP_ICONS: Record<ShipType, string> = {
  rowboat: `<svg viewBox="0 0 48 48"><path d="M6 30h36l-5 7H11z"/><path d="M12 30l-6 8M36 30l6 8"/></svg>`,
  longboat: `<svg viewBox="0 0 48 48"><path d="M5 34h38l-5 7H10z"/><path d="M24 34V6M14 10h20M15 12c-2 7-2 14 0 20h18c2-6 2-13 0-20"/></svg>`,
  brigantine: `<svg viewBox="0 0 48 48"><path d="M2 30h44l-5 9H8z"/><path d="M4 30v-6h8v6M38 30v-4h6"/><path d="M16 30V4M30 30V5M10 9h12M10 19h12M24 10h12M24 20h12M44 26l-14-20"/></svg>`,
  caravel: `<svg viewBox="0 0 48 48"><path d="M3 30h40l-5 9H9z"/><path d="M3 30v-8h10v8M35 30v-4h8v4M42 26l6-6M43 21h3v4h-3"/><path d="M27 30V4M19 8h16M20 8c-1 6-1 12 0 16h14c1-4 1-10 0-16M10 22V9M19 19L5 4M19 19l-10 2"/></svg>`,
  schooner: `<svg viewBox="0 0 48 48"><path d="M1 32h40l-5 7H7z"/><path d="M40 31l7-6M16 32L14 4M28 32L26.5 9M3 29h13M5 11l9-5M18 29h10M19 13l7-3"/><path d="M15 29H3l2-18 9-5zM27 29H18l1-16 7-3zM28 9l15 18H30z"/></svg>`,
  xebec: `<svg viewBox="0 0 48 48"><path d="M3 30h37l7-2-6 4-4 6H11l-6-4z"/><path d="M2 30v-3h9v3M14 33.5h20M17 33.5v2M25 33.5v2M33 33.5v2"/><path d="M36 30l3-22M24 30l2-27M12 27l2-17M45 24L32 4M45 24L33 5l2 22zM18 8h13M17 16h16M18 17h15l-1 10H19zM19 8h11v7H19zM21 22L6 6M21 22L7 7l2 18z"/></svg>`,
  fluyt: `<svg viewBox="0 0 48 48"><path d="M3 20l8 1 2 2v4q11 3 23 0v-2l6-1-4 14H11q-7-2-8-9z"/><path d="M4 29q16 5 33 0M13 32.5v2M17.5 33v2M22 33.3v2M26.5 33.2v2M31 32.8v2M35.5 32.2v2"/><path d="M33 26V6M23 29V3M11 21V9M28 9h10M27 15h12M26 21h14M17 6h12M16 12h14M15 19h16M17 18L4 5M17 18L5 6l1 12M42 24l4-8M42 20h4"/></svg>`,
  brig: `<svg viewBox="0 0 48 48"><path d="M3 30h42l-5 9H8z"/><path d="M4 33.5h38M8 33.5v2.5M13 33.5v2.5M18 33.5v2.5M23 33.5v2.5M28 33.5v2.5M33 33.5v2.5M38 33.5v2.5M4 29h38"/><path d="M33 30l-1-27M17 30l-1-28M28 6h10M27 12h12M26 19h14M25 26h16M12 5h10M11 11h12M10 18h14M9 25h16M17 15L3 12l1 15h13M47 29L33 6M33 17l12 11"/></svg>`,
  sloop: `<svg viewBox="0 0 48 48"><path d="M3 33h40l-6 8H9z"/><path d="M20 33V4M20 7l16 4-1 19H20M20 7L6 31h14M43 33l-6-4"/></svg>`,
  carrack: `<svg viewBox="0 0 48 48"><path d="M2 16h6v3h4v3h4v5h15v-5h12l-3 6-1 3-3 9H11q-8-2-9-9z"/><path d="M18 32.5v2M23 32.5v2M28 32.5v2M33 32.5v2M10 24v1.5M14 26v1.5M37 25v1.5"/><path d="M36 22V7M24 27V3M13 19V8M5 16V9M31 10h10M30 15h12M18 7h12M17 13h14M16 20h16M18 17L8 6M8 13L1 7M42 23l5-7"/></svg>`,
  galleass: `<svg viewBox="0 0 48 48"><path d="M2 25h6v3h27v-3h7l1 6-2 5H8l-6-5z"/><path d="M43 31.5l5-1-5 2.5M2 25q3-5 6 0M14 31v1.5M20 31v1.5M26 31v1.5M32 31v1.5M11 36l-2 5M15 36l-2 5M19 36l-2 5M23 36l-2 5M27 36l-2 5M31 36l-2 5"/><path d="M33 28V10M22 28V4M12 28V12M41 21L28 6l2 18zM31 21L11 2l2 22zM17 22L5 10l1 11z"/></svg>`,
  galleon: `<svg viewBox="0 0 48 48"><path d="M2 13h6v3h4v3h4v6h15v-3h8v3h3l4-1-4 3-2 4-3 7H11q-8-2-9-12z"/><path d="M15 33v1.5M20 33v1.5M25 33v1.5M30 33v1.5M35 33v1.5M17.5 29.5v1.5M22.5 29.5v1.5M27.5 29.5v1.5M32.5 29.5v1.5M13 21v1.5M10 18v1.5"/><path d="M35 22V6M24 25V2M13 19V7M5 13V6M30 9h10M29 15h12M18 5h12M17 11h14M16 18h16M18 16L8 4M8 11L1 5M38 22l5-7"/></svg>`,
  frigate: `<svg viewBox="0 0 48 48"><path d="M1 30h46l-5 11H5z"/><path d="M4 34h40M7 38h35M2 30v-5h8v5"/><path d="M13 30V8M25 30V2M36 30V7M8 11h10M7 18h12M19 6h12M18 14h14M18 21h14M31 10h10M30 17h12M47 30L36 9M36 22l-6 7"/></svg>`,
  corvette: `<svg viewBox="0 0 48 48"><path d="M1 30h46l-5 10H7z"/><path d="M6 35h36M10 35v2M18 35v2M26 35v2M34 35v2"/><path d="M12 30V10M24 30V3M35 30V6M19 8h10M18 16h12M30 11h10M29 19h12M12 12l-8 16h8M47 30l-12-22"/></svg>`,
};
