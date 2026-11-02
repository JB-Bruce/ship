import type { UpgradeId } from '../progression/upgrades';

/** Icônes des améliorations, dessinées au trait façon gravure (Cabine, Chantier). */
export const UPGRADE_ICONS: Record<UpgradeId, string> = {
  accuracy: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><circle class="solid" cx="24" cy="24" r="2.5"/><path d="M24 2v10M24 36v10M2 24h10M36 24h10"/></svg>`,
  range: `<svg viewBox="0 0 48 48"><path d="M4 40c10-22 26-32 40-32"/><path d="M36 6l8 2-3 8"/><circle class="solid" cx="8" cy="38" r="3"/><path d="M18 44h4M28 44h4M38 44h4"/></svg>`,
  cannons: `<svg viewBox="0 0 48 48"><path d="M5 22l29-7 4 10-29 7z"/><path d="M38 17l5-1 2 8-5 1"/><circle cx="15" cy="35" r="6"/><circle class="solid" cx="15" cy="35" r="1.5"/></svg>`,
  hull: `<svg viewBox="0 0 48 48"><path d="M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z"/><path d="M8.5 18h31M10 29h28M24 4v40"/></svg>`,
  sails: `<svg viewBox="0 0 48 48"><path d="M24 3v41M10 9h28M12 37h24M7 44h34"/><path d="M12 9c-3 9-3 19 0 28h24c3-9 3-19 0-28"/></svg>`,
  hold: `<svg viewBox="0 0 48 48"><path d="M14 5h20c5 7 5 31 0 38H14c-5-7-5-31 0-38z"/><path d="M10 15h28M10 33h28M19 5c-2 9-2 29 0 38M29 5c2 9 2 29 0 38"/></svg>`,
  nets: `<svg viewBox="0 0 48 48"><path d="M6 8h36L34 42H14z"/><path d="M10 16h28M12 25h24M13 34h22M16 8l6 34M24 8v34M32 8l-6 34"/><circle class="solid" cx="6" cy="8" r="2"/><circle class="solid" cx="42" cy="8" r="2"/></svg>`,
};
