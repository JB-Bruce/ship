import { BOSSES } from '../../config';
import type { SettingsContext } from './settingsMenu';

/** Un réglage de l'onglet : son nom, ce qu'il fait, et ses boutons. */
const row = (title: string, about: string, buttons: string) => `
  <div class="setting">
    <div class="setting-label"><b>${title}</b><p>${about}</p></div>
    <div class="choices">${buttons}</div>
  </div>`;

const button = (label: string, action: string, arg = '', on = false) => `<button class="choice${on ? ' on' : ''}" data-action="cheat" data-arg="${action}${arg ? `:${arg}` : ''}">${label}</button>`;

/** Onglet Triche : de quoi tester le jeu sans attendre (ressources, plans, carte, combats, voyages, améliorations). */
export function cheatTab(ctx: SettingsContext): string {
  const c = ctx.cheats;
  const places = c.places.map((p) => button(p.name, 'teleport', p.id)).join('');
  const bosses = c.bosses.map((id) => button(BOSSES[id].name, 'boss', id)).join('');
  return `
    <p class="subtitle">Pour tester le jeu : chaque bouton agit tout de suite.</p>
    <h3 class="section">Ressources et savoir</h3>
    <div class="settings-list">
      ${row('Ressources', '+100 000 or et +100 000 bois.', button('Ressources max', 'resources'))}
      ${row('Plans de navires', 'Tous les types de navires sont connus et peuvent être achetés.', button('Débloquer tous les plans', 'plans'))}
      ${row('Carte', 'Toute la carte sort de la brume.', button('Révéler toute la carte', 'map'))}
    </div>
    <h3 class="section">Flotte</h3>
    <div class="settings-list">
      ${row('Invincibilité', 'Ta flotte ne prend plus aucun dégât.', button('Oui', 'invincible', 'on', c.invincible) + button('Non', 'invincible', 'off', !c.invincible))}
      ${row('Réparer', 'Tous les navires de ta flotte retrouvent toute leur vie, avaries réparées.', button('Réparer la flotte', 'repair'))}
      ${row('Brûlot', 'Un brûlot rejoint ta flotte et tu en prends la barre : il saute au premier contact avec une coque adverse, puis revient comme un navire coulé.', button('Prendre un brûlot', 'takeFireship'))}
      ${row('Améliorations', 'Navire piloté amélioré au maximum (allongements compris) ; bâtiments de tes îles au maximum ; rang suivant pour le navire piloté.', button('Navire au maximum', 'upgrades') + button('Îles au maximum', 'islands') + button('Rang suivant', 'rank'))}
    </div>
    <h3 class="section">Faire surgir</h3>
    <div class="settings-list">
      ${row('Ennemis', 'Un ennemi déjà lancé à ta poursuite ; un navire maudit ou un brûlot maudit (de nuit seulement).', button('Ennemi en chasse', 'chaser') + button('Navire maudit', 'cursed') + button('Brûlot maudit', 'fireship'))}
      ${row('Boss', 'Le boss surgit tout de suite, même hors de son temps, et reste jusqu’à ce qu’il coule.', bosses)}
      ${row('Kraken', 'Le Kraken nage vers le bateau piloté et surgit sous lui, de jour comme de nuit.', button('Kraken', 'kraken'))}
    </div>
    <h3 class="section">Se téléporter</h3>
    <div class="settings-list">
      ${row('Destination', 'Ta flotte (hors commerce) y est posée aussitôt, intacte.', places)}
    </div>`;
}
