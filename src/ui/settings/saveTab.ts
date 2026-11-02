import type { SaveEntry } from '../../save/saveStore';
import type { SettingsContext } from './settingsMenu';

/** Ce que l'onglet affiche en plus des sauvegardes : le dernier message, et l'action qui attend confirmation. */
export interface SaveView {
  notice: string;
  /** « load:id », « replace:id », « delete:id » ou « reset », ou null. */
  confirm: string | null;
}

/** Texte saisi ou venu d'un fichier importé : jamais interprété comme du HTML. */
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const dateText = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Onglet Partie : sauvegarder, charger, exporter et importer des parties, recommencer. */
export function saveTab(ctx: SettingsContext, view: SaveView): string {
  const saves = ctx.saves;
  const blocker = saves.blocker();
  const entries = saves.entries();
  const list = entries.length
    ? entries.map((e) => entryCard(e, view.confirm, blocker !== null)).join('')
    : '<p class="effect">Aucune partie sauvegardée pour l’instant.</p>';
  const reset =
    view.confirm === 'reset'
      ? confirmRow('Recommencer de zéro ? La partie en cours, si elle n’est pas sauvegardée, sera perdue.', 'reset', 'Oui, nouvelle partie')
      : '<div class="choices"><button data-action="ask" data-arg="reset">Nouvelle partie</button></div>';
  return `
    <p class="subtitle">Sauvegarde ta partie pour la reprendre plus tard, là où tu en étais. Les ennemis en mer et le butin qui flotte ne sont pas gardés.</p>
    ${view.notice ? `<p class="save-notice">${escapeHtml(view.notice)}</p>` : ''}
    <h3 class="section">Sauvegarder</h3>
    <div class="save-new">
      <input class="save-name" type="text" maxlength="40" placeholder="Nom de la partie (facultatif)" autocomplete="off" />
      <div class="buy"><button data-action="save"${blocker ? ' disabled' : ''}>Sauvegarder</button></div>
    </div>
    ${blocker ? `<p class="effect save-blocked">${blocker}</p>` : ''}
    <h3 class="section">Parties sauvegardées <span class="count">${entries.length}</span></h3>
    <div class="list">${list}</div>
    <div class="choices save-import"><button data-action="import">Importer un fichier de sauvegarde…</button></div>
    <p class="effect">Un fichier exporté peut être donné à quelqu’un : il l’importe ici, puis le charge.</p>
    <h3 class="section">Nouvelle partie</h3>
    <p class="effect">Recommence avec une chaloupe au port de la Tortue. Les sauvegardes restent dans la liste.</p>
    ${reset}`;
}

function entryCard(e: SaveEntry, confirm: string | null, blocked: boolean): string {
  const asked = confirm?.endsWith(`:${e.id}`) ? confirm.slice(0, confirm.indexOf(':')) : null;
  const question =
    asked === 'load'
      ? confirmRow('Charger cette partie ? La partie en cours, si elle n’est pas sauvegardée, sera perdue.', `load:${e.id}`, 'Oui, charger')
      : asked === 'replace'
        ? confirmRow('Remplacer cette sauvegarde par la partie en cours ?', `replace:${e.id}`, 'Oui, remplacer')
        : asked === 'delete'
          ? confirmRow('Supprimer définitivement cette sauvegarde ?', `delete:${e.id}`, 'Oui, supprimer')
          : '';
  return `
    <div class="upgrade-card compact save-card">
      <div class="body">
        <h2>${escapeHtml(e.name)}</h2>
        <p>${dateText(e.savedAt)}</p>
        <p class="effect">${escapeHtml(e.summary)}</p>
        ${question}
      </div>
      <div class="buy save-actions">
        <button data-action="ask" data-arg="load:${e.id}">Charger</button>
        <button class="secondary" data-action="ask" data-arg="replace:${e.id}"${blocked ? ' disabled' : ''}>Écraser</button>
        <button class="secondary" data-action="export" data-arg="${e.id}">Exporter</button>
        <button class="secondary" data-action="ask" data-arg="delete:${e.id}">Supprimer</button>
      </div>
    </div>`;
}

function confirmRow(text: string, action: string, yes: string): string {
  return `
    <div class="save-confirm">
      <p>${text}</p>
      <div class="choices">
        <button class="on" data-action="confirm" data-arg="${action}">${yes}</button>
        <button data-action="cancel">Annuler</button>
      </div>
    </div>`;
}
