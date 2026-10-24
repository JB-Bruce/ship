import { isSaveData, saveSummary, type SaveData } from './saveData';

/** Une sauvegarde de la liste (sans son contenu). */
export interface SaveEntry {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly summary: string;
}

const INDEX_KEY = 'bateau.saves';
const DATA_PREFIX = 'bateau.save.';
/** Sauvegarde à charger au prochain démarrage (le chargement recharge la page). */
const PENDING_KEY = 'bateau.pendingLoad';

/**
 * Sauvegardes gardées dans le navigateur (localStorage), en nombre illimité : la liste, et chaque partie à part.
 * Export et import en fichier .json, pour les garder ailleurs ou les donner à quelqu'un.
 */
export class SaveStore {
  list(): SaveEntry[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const list = raw ? (JSON.parse(raw) as SaveEntry[]) : [];
      return list.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  }

  read(id: string): SaveData | null {
    try {
      const raw = localStorage.getItem(DATA_PREFIX + id);
      const data: unknown = raw ? JSON.parse(raw) : null;
      return isSaveData(data) ? data : null;
    } catch {
      return null;
    }
  }

  /** Écrit une partie (nouvelle entrée, ou à la place de `id`). Lève une erreur si le navigateur refuse (plus de place). */
  write(data: SaveData, id: string = newId()): SaveEntry {
    const entry: SaveEntry = { id, name: data.name, savedAt: data.savedAt, summary: saveSummary(data) };
    localStorage.setItem(DATA_PREFIX + id, JSON.stringify(data));
    this.writeIndex([entry, ...this.list().filter((e) => e.id !== id)]);
    return entry;
  }

  remove(id: string) {
    localStorage.removeItem(DATA_PREFIX + id);
    this.writeIndex(this.list().filter((e) => e.id !== id));
  }

  /** Télécharge une sauvegarde en fichier .json. */
  exportFile(id: string) {
    const data = this.read(id);
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName(data.name)}.bateau.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Ajoute à la liste une sauvegarde lue dans un fichier. Lève une erreur (message affichable) si elle n'est pas lisible. */
  async importFile(file: File): Promise<SaveEntry> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('Ce fichier n’est pas une sauvegarde.');
    }
    if (!isSaveData(data)) throw new Error('Ce fichier n’est pas une sauvegarde de ce jeu (ou elle vient d’une version plus récente).');
    return this.write(data);
  }

  /** Charge une sauvegarde : la page est rechargée et la partie reprend telle qu'elle était. */
  load(id: string) {
    sessionStorage.setItem(PENDING_KEY, id);
    location.reload();
  }

  /** Nouvelle partie : la page est rechargée sans sauvegarde. */
  newGame() {
    sessionStorage.removeItem(PENDING_KEY);
    location.reload();
  }

  /** Au démarrage : la sauvegarde à charger, s'il y en a une (une seule fois). */
  takePending(): SaveData | null {
    const id = sessionStorage.getItem(PENDING_KEY);
    if (!id) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return this.read(id);
  }

  private writeIndex(list: SaveEntry[]) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  }
}

/** Identifiant unique (sans crypto.randomUUID, absent hors https). */
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Nom de fichier sans caractères gênants. */
function fileName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'partie';
}
