import type { PortTab } from './portContext';

/** Pictogrammes des onglets du port, au trait comme les gravures des fiches (couleur du texte du bouton). */
export const TAB_ICONS: Record<PortTab, string> = {
  island: `<svg viewBox="0 0 48 48"><path d="M4 42c8-6 32-6 40 0"/><path d="M22 39c0-10 2-18 7-25"/><path d="M29 14c-6-4-14-3-17 2M29 14c6-4 13-3 15 2M29 14c-2-6-8-9-13-6M29 14c4-5 10-6 13-3"/></svg>`,
  trade: `<svg viewBox="0 0 48 48"><path d="M24 6v34M14 42h20M7 12h34"/><path d="M7 12L2 26h10zM41 12l-5 14h10z"/><path d="M2 26a5 4 0 0 0 10 0M36 26a5 4 0 0 0 10 0"/></svg>`,
  routes: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><path d="M24 7l4 17-4 17-4-17zM7 24l17-4 17 4-17 4z"/></svg>`,
  shipyard: `<svg viewBox="0 0 48 48"><path d="M4 16c4 15 12 22 20 22s16-7 20-22"/><path d="M12 30V13M24 38V10M36 30V13M3 44h42M10 44l4-6M38 44l-4-6"/></svg>`,
  ships: `<svg viewBox="0 0 48 48"><path d="M3 33h40l-6 8H9z"/><path d="M20 33V4M20 7l16 4-1 19H20M20 7L6 31h14M43 33l-6-4"/></svg>`,
  crew: `<svg viewBox="0 0 48 48"><path d="M3 30c8 0 12-14 21-14s13 14 21 14c-6 6-36 6-42 0z"/><path d="M16 21c2-6 14-6 16 0"/><path d="M14 38c2 4 18 4 20 0"/></svg>`,
  upgrades: `<svg viewBox="0 0 48 48"><path d="M12 44V20h24v24M10 20h28M12 20v-5h5v5M21 20v-5h6v5M31 20v-5h5v5"/><path d="M24 15V3l11 4-11 4M20 44v-8a4 4 0 0 1 8 0v8"/></svg>`,
  tavern: `<svg viewBox="0 0 48 48"><path d="M10 16h22v26H10z"/><path d="M32 21h5a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-5"/><path d="M8 16c0-6 6-8 10-6 3-4 11-4 13 1 4 0 4 5 1 5"/><path d="M16 22v14M26 22v14"/></svg>`,
  ledger: `<svg viewBox="0 0 48 48"><path d="M4 12c8-2 14-1 20 3 6-4 12-5 20-3v28c-8-2-14-1-20 3-6-4-12-5-20-3z"/><path d="M24 15v28M9 20h10M9 26h10M29 20h10M29 26h10"/></svg>`,
};
