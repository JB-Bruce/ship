import type { CampaignSnapshot } from '../campaign';
import type { BossId, Cost, EmblemId } from '../config';
import type { Formation } from '../fleet/fleet';
import type { TradeOrder } from '../fleet/tradeRoutes';
import type { Cargo } from '../progression/goods';
import type { Guns } from '../progression/modifiers';
import type { UpgradeLevels } from '../progression/upgrades';
import type { ShipType } from '../shipTypes';
import type { WeatherKind } from '../world/weather';

/**
 * Version du format : à augmenter (avec une conversion des anciennes) si une sauvegarde change de forme.
 * v2 : Île Royale (son état, `CampaignSnapshot.navyForts`). Une v1 se charge telle quelle : l'île y manque, elle reste
 * à la Marine avec son fort intact.
 * v3 : vie de tous les navires doublée ; la vie à flot d'une sauvegarde plus ancienne est doublée au chargement.
 * v4 : découverte de la carte (`CampaignSnapshot.discovery`) et plans de navires (`CampaignSnapshot.blueprints`). Une v3
 * se charge telle quelle : la carte connaît alors les îles déjà visitées (save/visitedIslands.ts), et les types de la
 * flotte sont débloqués.
 */
export const SAVE_VERSION = 4;
/** Facteur appliqué au chargement à la vie à flot d'une sauvegarde de cette version. */
export const healthScaleOf = (version: number) => (version < 3 ? 2 : 1);
/** Marque des fichiers de sauvegarde du jeu (pour refuser un fichier qui n'en est pas une). */
export const SAVE_GAME_ID = 'bateau';

/** Un navire de ta flotte : ce qui lui appartient, et où il en est (à flot à sa place, ou en attente de réapparition). */
export interface MemberSnapshot {
  id: number;
  name: string;
  type: ShipType;
  levels: UpgradeLevels;
  spent: Cost;
  kills: number;
  cargo: Cargo;
  guns: Guns;
  ownedGuns: string[];
  trophies: BossId[];
  hiddenTrophies: BossId[];
  /** Emblème de la grande voile et emblèmes payés (absents des sauvegardes d'avant les emblèmes). */
  emblem?: EmblemId | null;
  ownedEmblems?: EmblemId[];
  trade: TradeOrder | null;
  /** À flot : position, cap, vie et voile ; sinon null, et `respawnIn` secondes avant sa réapparition. */
  afloat: { x: number; z: number; heading: number; health: number; sail: number } | null;
  respawnIn: number;
}

/** Une partie sauvegardée : tout ce qui t'appartient et ta progression. Les ennemis en mer et le butin flottant n'y sont pas. */
export interface SaveData {
  game: typeof SAVE_GAME_ID;
  version: number;
  name: string;
  /** Date de la sauvegarde (ISO). */
  savedAt: string;
  player: { gold: number; wood: number; slots: number };
  /** Victoires (règlent les rencontres et la difficulté). */
  kills: number;
  weather: WeatherKind;
  fleet: { formation: Formation; controlledId: number; members: MemberSnapshot[] };
  campaign: CampaignSnapshot;
}

/** Vérifie qu'un objet lu (fichier importé, stockage du navigateur) est bien une sauvegarde lisible de ce jeu. */
export function isSaveData(x: unknown): x is SaveData {
  const d = x as Partial<SaveData> | null;
  return (
    !!d &&
    d.game === SAVE_GAME_ID &&
    typeof d.version === 'number' &&
    d.version <= SAVE_VERSION &&
    typeof d.name === 'string' &&
    !!d.player &&
    !!d.fleet &&
    Array.isArray(d.fleet.members) &&
    d.fleet.members.length > 0 &&
    d.fleet.members.some((m) => m.id === d.fleet!.controlledId && m.afloat) &&
    !!d.campaign
  );
}

/** « 3 navires · 1 250 or · 14 victoires » */
export function saveSummary(d: SaveData): string {
  const ships = d.fleet.members.length;
  return `${ships} navire${ships > 1 ? 's' : ''} · ${d.player.gold.toLocaleString('fr-FR')} or · ${d.kills} victoire${d.kills > 1 ? 's' : ''}`;
}
