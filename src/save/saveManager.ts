import { SHIP_TYPES } from '../shipTypes';
import { tortuga } from '../world/island';
import { captureGame, restoreFleet, restoreGame, saveBlocker, type SaveTargets } from './gameSave';
import type { SaveData } from './saveData';
import { SaveStore, type SaveEntry } from './saveStore';

/**
 * Sauvegardes de la partie (onglet Partie du menu Échap) : sauvegarder, charger, exporter, importer, supprimer,
 * nouvelle partie. Charger ou recommencer recharge la page ; au démarrage, `start` puis `finish` rétablissent la partie.
 */
export class SaveManager {
  private readonly store = new SaveStore();
  /** Sauvegarde à reprendre à ce démarrage, ou null (nouvelle partie). */
  private pending: SaveData | null = this.store.takePending();
  private targets: SaveTargets | null = null;

  /** Au démarrage, avant la campagne : la flotte de la sauvegarde, ou la chaloupe de départ au port de la Tortue. */
  start(fleet: SaveTargets['fleet']) {
    if (this.pending) {
      try {
        restoreFleet(fleet, this.pending);
        return;
      } catch (error) {
        this.fail(error);
      }
    }
    // On commence avec une chaloupe (comptée comme achetée, pour sa valeur de revente).
    fleet.add('longboat', SHIP_TYPES.longboat.price);
    const start = tortuga.portSpawn;
    fleet.leader.respawn(start.x, start.z);
    fleet.leader.heading = start.heading;
  }

  /** Une fois tout le jeu créé : le reste de la sauvegarde. Renvoie son nom, ou null pour une nouvelle partie. */
  finish(targets: SaveTargets): string | null {
    this.targets = targets;
    const data = this.pending;
    this.pending = null;
    if (!data) return null;
    try {
      restoreGame(targets, data);
      return data.name;
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  entries(): SaveEntry[] {
    return this.store.list();
  }

  /** Pourquoi on ne peut pas sauvegarder maintenant, ou null. */
  blocker(): string | null {
    return this.targets ? saveBlocker(this.targets) : 'Le jeu démarre…';
  }

  /** Sauvegarde la partie (nouvelle entrée, ou à la place de `replace`). Renvoie le message à afficher. */
  save(name: string, replace?: string): string {
    const reason = this.blocker();
    if (reason || !this.targets) return reason ?? '';
    const title = name.trim() || `Partie du ${new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
    try {
      this.store.write(captureGame(this.targets, title), replace);
      return `Partie sauvegardée : « ${title} ».`;
    } catch {
      return 'Le navigateur refuse la sauvegarde (plus de place ?) : exporte ou supprime d’anciennes parties.';
    }
  }

  load(id: string) {
    this.store.load(id);
  }

  remove(id: string) {
    this.store.remove(id);
  }

  exportFile(id: string) {
    this.store.exportFile(id);
  }

  /** Ajoute une sauvegarde lue dans un fichier. Renvoie le message à afficher. */
  async importFile(file: File): Promise<string> {
    try {
      const entry = await this.store.importFile(file);
      return `Sauvegarde ajoutée : « ${entry.name} ».`;
    } catch (error) {
      return error instanceof Error ? error.message : 'Fichier illisible.';
    }
  }

  newGame() {
    this.store.newGame();
  }

  /** Une sauvegarde qui ne se recharge pas : on repart d'une partie neuve plutôt que d'un état à moitié rétabli. */
  private fail(error: unknown): never {
    console.error('Sauvegarde illisible', error);
    alert('Cette sauvegarde n’a pas pu être chargée : une nouvelle partie commence.');
    this.store.newGame();
    throw error;
  }
}
