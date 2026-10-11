import { GRAPHICS, type GraphicsSettings, type QualityPreset } from '../../config';
import { maxResolution, renderSize } from '../../render/display';
import type { SettingsContext } from './settingsMenu';

const PRESETS: { id: QualityPreset; name: string; text: string }[] = [
  { id: 'low', name: 'Bas', text: 'Pour les machines modestes : résolution réduite, eau et effets allégés.' },
  { id: 'medium', name: 'Moyen', text: 'Résolution de l’écran sans mise à l’échelle, sans anticrénelage, effets un peu allégés.' },
  { id: 'high', name: 'Haut', text: 'Tout au maximum : pleine résolution, anticrénelage, tous les détails.' },
  { id: 'auto', name: 'Auto', text: 'Comme Haut, mais la résolution baisse d’elle-même quand une image traîne et remonte quand il y a de la marge.' },
];

/** Un choix d'un réglage : valeur, libellé, et s'il est sélectionné (par défaut : égal au réglage). */
type Choice = { value: GraphicsSettings[keyof GraphicsSettings]; label: string; on?: boolean };

const yesNo: Choice[] = [
  { value: true, label: 'Oui' },
  { value: false, label: 'Non' },
];
const percent = (v: number) => `${Math.round(v * 100)} %`;

/** Onglet Graphismes : préréglages, puis chaque réglage avec ce qu'il change et ce qu'il coûte. */
export function graphicsTab(ctx: SettingsContext): string {
  const { settings, display } = ctx;
  const g = settings.graphics;
  const presets = PRESETS.map((p) => `<button class="choice${settings.preset === p.id ? ' on' : ''}" data-action="preset" data-arg="${p.id}">${p.name}</button>`).join('');
  const custom = settings.preset === 'custom' ? '<span class="tag">Personnalisé</span>' : '';
  const presetText = PRESETS.find((p) => p.id === settings.preset)?.text ?? 'Réglages choisis un par un.';
  const now = display.renderer.domElement;
  const dynamicNote = g.dynamicResolution ? ` En ce moment : ${now.width}×${now.height}.` : '';
  const o = GRAPHICS.options;
  const rows = [
    row(g, 'resolution', 'Résolution', `Le réglage qui pèse le plus : le nombre de pixels dessinés.${dynamicNote}`, resolutionChoices(g.resolution)),
    row(g, 'dynamicResolution', 'Résolution dynamique', 'Baisse la résolution quand une image traîne (grosse tempête, combat), la remonte quand il y a de la marge.', yesNo),
    row(g, 'antialias', 'Anticrénelage', 'Bords lisses, environ 30 % du rendu. Le rendu redémarre une seconde quand on le change.', yesNo),
    row(g, 'fpsLimit', 'Limite d’images par seconde', 'Sur un écran à 120 Hz ou plus, 60 images stables paraissent plus fluides, et le portable chauffe moins.', o.fpsLimit.map((f) => ({ value: f, label: f ? `${f}` : 'Aucune' }))),
    row(g, 'oceanGrid', 'Grille de l’eau', 'Finesse des vagues autour de toi.', o.oceanGrid.map((n) => ({ value: n, label: n >= 256 ? 'Fine' : n >= 192 ? 'Moyenne' : 'Légère' }))),
    row(g, 'farWater', 'Eau au loin', 'Simplifiée : rides et traînées d’écume seulement près de ta flotte.', [
      { value: 'detailed', label: 'Détaillée' },
      { value: 'simple', label: 'Simplifiée' },
    ]),
    row(g, 'wakeResolution', 'Sillages', 'Netteté des traînées d’écume derrière les navires.', o.wakeResolution.map((r) => ({ value: r, label: r >= 1024 ? 'Fins' : 'Légers' }))),
    row(g, 'weatherDensity', 'Pluie et vent', 'Part des gouttes de pluie et des filets de vent dessinés.', o.density.map((d) => ({ value: d, label: percent(d) }))),
    row(g, 'particleDensity', 'Particules', 'Embruns, fumée, flammes, éclats de bois…', o.density.map((d) => ({ value: d, label: percent(d) }))),
  ].join('');
  return `
    <p class="subtitle">Les réglages s’appliquent tout de suite et sont gardés pour les prochaines parties.</p>
    <h3 class="section">Préréglage ${custom}</h3>
    <div class="choices settings-presets">${presets}</div>
    <p class="effect">${presetText}</p>
    <h3 class="section">Réglages</h3>
    <div class="settings-list">${rows}</div>`;
}

/**
 * Résolutions possibles sur cet écran (pas au-delà de sa densité de pixels), avec leur taille d'image. La sélectionnée est
 * celle réellement utilisée : un préréglage à ×1,5 sur un écran sans mise à l'échelle dessine à ×1.
 */
function resolutionChoices(chosen: number): Choice[] {
  const max = maxResolution();
  const values = GRAPHICS.options.resolution.filter((r) => r <= max + 0.01);
  const used = Math.min(chosen, max);
  const selected = values.reduce((best, r) => (Math.abs(r - used) < Math.abs(best - used) ? r : best), values[0]);
  return values.map((r) => {
    const size = renderSize(r);
    return { value: r, label: `${size.width}×${size.height}`, on: r === selected };
  });
}

function row(g: GraphicsSettings, key: keyof GraphicsSettings, label: string, help: string, choices: readonly Choice[]): string {
  const buttons = choices
    .map((c) => {
      const on = (c.on ?? g[key] === c.value) ? ' on' : '';
      return `<button class="choice${on}" data-action="set" data-arg="${key}:${c.value}">${c.label}</button>`;
    })
    .join('');
  return `
    <div class="setting">
      <div class="setting-label"><b>${label}</b><p>${help}</p></div>
      <div class="choices">${buttons}</div>
    </div>`;
}
