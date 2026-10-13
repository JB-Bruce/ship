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

/** Silhouettes après chaque allongement, par type. */
const EXTENDED_ICONS: Partial<Record<ShipType, readonly string[]>> = {
  frigate: [LONG_FRIGATE_ICON, GRAND_FRIGATE_ICON],
  corvette: [LONG_CORVETTE_ICON],
  brigantine: [LONG_BRIGANTINE_ICON],
  schooner: [TOPSAIL_SCHOONER_ICON],
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
  sloop: `<svg viewBox="0 0 48 48"><path d="M3 33h40l-6 8H9z"/><path d="M20 33V4M20 7l16 4-1 19H20M20 7L6 31h14M43 33l-6-4"/></svg>`,
  frigate: `<svg viewBox="0 0 48 48"><path d="M1 30h46l-5 11H5z"/><path d="M4 34h40M7 38h35M2 30v-5h8v5"/><path d="M13 30V8M25 30V2M36 30V7M8 11h10M7 18h12M19 6h12M18 14h14M18 21h14M31 10h10M30 17h12M47 30L36 9M36 22l-6 7"/></svg>`,
  corvette: `<svg viewBox="0 0 48 48"><path d="M1 30h46l-5 10H7z"/><path d="M6 35h36M10 35v2M18 35v2M26 35v2M34 35v2"/><path d="M12 30V10M24 30V3M35 30V6M19 8h10M18 16h12M30 11h10M29 19h12M12 12l-8 16h8M47 30l-12-22"/></svg>`,
};
