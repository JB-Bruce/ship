import type { IslandUpgradeId } from '../../progression/islandState';

/** Pictogrammes des bâtiments d'une île, au trait (couleur du texte), repère 48 × 48. */
export const BUILDING_ICONS: Record<IslandUpgradeId, string> = {
  fort: `<svg viewBox="0 0 48 48"><path d="M8 44V16h6v-6h6v6h8v-6h6v6h6v28z"/><path d="M20 44v-9a4 4 0 0 1 8 0v9M14 24h4M30 24h4"/></svg>`,
  dock: `<svg viewBox="0 0 48 48"><path d="M3 30h42M8 30v12M20 30v12M32 30v12M44 30v12"/><path d="M12 30l4-12h18l4 12M25 18V5M25 7l10 5-10 4"/></svg>`,
  workshop: `<svg viewBox="0 0 48 48"><circle cx="16" cy="30" r="10"/><path d="M16 20v20M6 30h20M9 23l14 14M23 23L9 37"/><path d="M30 14c6-4 12 0 14 4-2 4-8 8-14 4l-4 3v-14z"/></svg>`,
  shipyard: `<svg viewBox="0 0 48 48"><path d="M4 32h40l-6 8H10z"/><path d="M10 32V14l14-8 14 8v18M10 14h28M17 32V20M24 32V20M31 32V20"/></svg>`,
  lighthouse: `<svg viewBox="0 0 48 48"><path d="M18 44l3-28h6l3 28zM17 16h14M20 16l1-6h6l1 6M24 10V6"/><path d="M8 10l8 3M40 10l-8 3M6 18h8M42 18h-8"/></svg>`,
  citadel: `<svg viewBox="0 0 48 48"><path d="M4 44V22l6-4 6 4V14h6V8h4v6h6v8l6-4 6 4v22z"/><path d="M20 44v-8a4 4 0 0 1 8 0v8M9 30h4M35 30h4M22 22h4"/></svg>`,
  counter: `<svg viewBox="0 0 48 48"><path d="M24 6v32M12 42h24M6 12h36"/><path d="M6 12L2 24h8zM42 12l-4 12h8z"/><path d="M2 24a4 3 0 0 0 8 0M38 24a4 3 0 0 0 8 0"/><circle cx="24" cy="6" r="2"/></svg>`,
  royalFort: `<svg viewBox="0 0 48 48"><path d="M24 4l6 10h12l-6 10 6 10H30l-6 10-6-10H6l6-10-6-10h12z"/><path d="M18 26l2-6 4 3 4-3 2 6zM18 29h12"/></svg>`,
  smuggling: `<svg viewBox="0 0 48 48"><path d="M8 20h32v22H8z"/><path d="M8 28h32M24 20v22M14 20l4-10h12l4 10"/><circle class="solid" cx="36" cy="10" r="3"/></svg>`,
  moorings: `<svg viewBox="0 0 48 48"><circle cx="24" cy="9" r="4"/><path d="M24 13v29M15 20h18M8 30c2 8 9 12 16 12s14-4 16-12M8 30l-3 4M8 30l4 3M40 30l3 4M40 30l-4 3"/></svg>`,
};
