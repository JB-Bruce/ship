import type { MissionType } from '../../progression/contracts';

/** Pictogramme à l'encre de chaque genre de mission (repère 24 × 24, au trait, couleur du texte). */
const PATHS: Record<MissionType, string> = {
  combat: 'M4 4l10 10M20 4L10 14M3 17l4 4M17 21l4-4M6 18l3-3M18 18l-3-3',
  hunt: 'M12 3a9 9 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0M12 1v5M12 18v5M1 12h5M18 12h5',
  plans: 'M6 5h12a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4ZM6 9v8a2 2 0 0 0 2 2h12M18 9v8a2 2 0 0 1-2 2M9 12h6M9 15h4',
  bounty: 'M12 3c-4.4 0-7 3-7 6.6 0 2.2 1 3.7 2.4 4.6V17h9.2v-2.8C18 13.3 19 11.8 19 9.6 19 6 16.4 3 12 3ZM9 10h.01M15 10h.01M10 20h4',
  defense: 'M5 21V9h3V6h3v3h2V6h3v3h3v12ZM10 21v-4a2 2 0 0 1 4 0v4',
  escort: 'M3 16h12l-2 3H5ZM9 6v10M10 7l5 7h-5M17 9l4 1.5v3c0 2-1.8 3.5-4 4-2.2-.5-4-2-4-4',
  battle: 'M12 3a2 2 0 1 0 .01 0M12 5v15M8 9h8M4 14c1 4 4 6 8 6s7-2 8-6M4 14l-1 2M4 14l2 1M20 14l1 2M20 14l-2 1',
  convoy: 'M4 8h16v12H4ZM4 8l2-4h12l2 4M12 8v12M4 14h16',
  delivery: 'M3 12c3-5 10-6 14 0-4 6-11 5-14 0ZM17 12l4-3v6ZM8 11h.01',
};

/** L'icône d'un genre de mission, à poser à côté de son nom. */
export function missionIcon(type: MissionType): string {
  return `<svg class="tav-type-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[type]}"/></svg>`;
}
