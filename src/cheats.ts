import { BOSSES, CHEATS, CURSED, ISLAND_INFO, ISLETS, RANKS, WORLD_EDGE, type BossId } from './config';
import type { Campaign } from './campaign';
import type { Fleet } from './fleet/fleet';
import { rankOf } from './fleet/officers';
import { refit } from './fleet/refit';
import { blueprints } from './progression/blueprints';
import type { PlayerState } from './progression/playerState';
import { maxLevel, UPGRADE_IDS } from './progression/upgrades';
import { SHIP_SIZE_ORDER, SHIP_TYPES } from './shipTypes';
import type { Hud } from './ui/hud';
import type { Bosses } from './world/bossEncounter';
import type { CursedTide } from './world/cursedTide';
import type { Krakens } from './world/monsters/krakens';
import type { EnemySpawner } from './world/enemySpawner';
import { ISLAND_LIST, ISLET_LIST, land } from './world/island';

/** Un lieu où se téléporter : un port, ou le large d'un îlot. */
export interface CheatPlace {
  id: string;
  name: string;
}

/** Ce que l'onglet Triche du menu Échap peut faire (`ui/settings/cheatTab.ts`). */
export interface CheatActions {
  /** Ta flotte ne prend plus aucun dégât. */
  readonly invincible: boolean;
  readonly places: readonly CheatPlace[];
  readonly bosses: readonly BossId[];
  resources(): void;
  unlockPlans(): void;
  revealMap(): void;
  setInvincible(on: boolean): void;
  repairFleet(): void;
  spawnChaser(): void;
  spawnCursed(): void;
  /** Un brûlot maudit (de nuit) ; un brûlot dans ta flotte, à la barre. */
  spawnFireship(): void;
  takeFireship(): void;
  /** Le Kraken surgit sous le bateau piloté. */
  spawnKraken(): void;
  spawnBoss(id: BossId): void;
  teleport(id: string): void;
  maxUpgrades(): void;
  maxIslands(): void;
  nextRank(): void;
}

/** Ce dont les triches ont besoin. */
export interface CheatWorld {
  state: PlayerState;
  fleet: Fleet;
  campaign: Campaign;
  spawner: EnemySpawner;
  cursed: CursedTide;
  krakens: Krakens;
  bosses: Bosses;
  hud: Hud;
}

/**
 * Triches de test, de l'onglet Triche du menu Échap : ressources, plans, carte, invincibilité et réparation, ennemis,
 * navires maudits et boss à la demande, téléportation, améliorations, bâtiments des îles et rang au maximum.
 * Chaque action dit ce qu'elle a fait par un petit message.
 */
export class Cheats implements CheatActions {
  invincible = false;
  readonly places: CheatPlace[] = [
    ...ISLAND_LIST.map((i) => ({ id: i.id, name: ISLAND_INFO[i.id].portName })),
    ...ISLET_LIST.map((i) => ({ id: i.id, name: ISLETS[i.id].name })),
  ];
  readonly bosses = Object.keys(BOSSES) as BossId[];

  constructor(private readonly w: CheatWorld) {}

  private say(text: string) {
    this.w.hud.toast(text, 2.5, 'good');
  }

  resources() {
    this.w.state.earn({ gold: CHEATS.resources, wood: CHEATS.resources });
    this.say(`+${CHEATS.resources.toLocaleString('fr-FR')} or et bois`);
  }

  unlockPlans() {
    for (const type of SHIP_SIZE_ORDER) blueprints.unlock(type);
    this.say('Tous les plans de navires sont débloqués');
  }

  revealMap() {
    const [x, z] = WORLD_EDGE.center;
    this.w.campaign.discovery.reveal(x, z, WORLD_EDGE.radius * 2);
    this.say('Toute la carte est révélée');
  }

  setInvincible(on: boolean) {
    if (on === this.invincible) return;
    this.invincible = on;
    this.say(this.invincible ? 'Ta flotte est invincible' : 'Ta flotte n’est plus invincible');
  }

  repairFleet() {
    for (const m of this.w.fleet.members) {
      if (!m.ship.alive) continue;
      m.ship.health = m.ship.stats.maxHealth;
      m.ship.crits.reset();
    }
    this.say('Toute la flotte est réparée');
  }

  spawnChaser() {
    if (this.w.spawner.spawnChaser(this.w.fleet.leader)) this.say('Un ennemi te prend en chasse');
    else this.w.hud.toast('Pas de place pour un ennemi ici', 2.5);
  }

  spawnCursed() {
    if (!this.w.cursed.night) {
      this.w.hud.toast('Les navires maudits ne surgissent que de nuit', 2.5);
      return;
    }
    this.w.cursed.summon(this.w.fleet.leader, 1, CURSED.rankBonus);
  }

  /** Un brûlot maudit surgit (de nuit seulement). */
  spawnFireship() {
    if (!this.w.cursed.night) {
      this.w.hud.toast('Les navires maudits ne surgissent que de nuit', 2.5);
      return;
    }
    this.w.cursed.summon(this.w.fleet.leader, 1, CURSED.rankBonus, 'fireship');
  }

  /** Un brûlot rejoint ta flotte, et tu en prends la barre (il saute au premier contact avec une coque adverse). */
  takeFireship() {
    const member = this.w.fleet.add('fireship', { gold: 0, wood: 0 });
    refit(member, this.w.campaign.crew);
    this.w.fleet.takeControl(member);
    this.say(`${member.name}, un brûlot, rejoint ta flotte`);
  }

  spawnKraken() {
    if (!this.w.krakens.summon(this.w.fleet.leader)) this.w.hud.toast('Le Kraken est déjà là', 2.5);
  }

  spawnBoss(id: BossId) {
    if (!this.w.bosses.summon(id, this.w.fleet.leader)) this.w.hud.toast(`${BOSSES[id].name} est déjà en mer, ou pas de place ici`, 2.5);
  }

  /** Toute la flotte (hors commerce) est posée au port, ou au large de l'îlot, intacte. */
  teleport(id: string) {
    const island = ISLAND_LIST.find((i) => i.id === id);
    const fleet = this.w.fleet;
    if (island) {
      const s = island.portSpawn;
      fleet.respawnAll(s.x, s.z, s.heading);
    } else {
      const islet = ISLET_LIST.find((i) => i.id === id);
      if (!islet) return;
      const angle = Math.atan2(fleet.leader.position.x - islet.cx, fleet.leader.position.z - islet.cz);
      const p = islet.pointAt(angle, -CHEATS.isletOffshore);
      const safe = land.keepOffshore(p.x, p.z, CHEATS.isletOffshore);
      fleet.respawnAll(safe.x, safe.z, angle + Math.PI);
    }
    this.say(`Cap sur ${this.places.find((p) => p.id === id)?.name ?? id}`);
  }

  /** Navire piloté au maximum : allongements, puis toutes ses améliorations (cale et filets compris). */
  maxUpgrades() {
    const m = this.w.fleet.controlled;
    const levels = m.levels;
    levels.extension = SHIP_TYPES[m.type].extensions?.length ?? 0;
    for (const id of UPGRADE_IDS) levels[id] = maxLevel(m.type, id, levels);
    refit(m, this.w.campaign.crew);
    this.say(`${m.name} est amélioré au maximum`);
  }

  /** Tous les bâtiments de tes îles au maximum. */
  maxIslands() {
    let count = 0;
    for (const island of Object.values(this.w.campaign.islands)) {
      if (!island.owned) continue;
      for (const id of island.info.upgrades) island.levels[id] = island.maxLevel(id);
      this.w.campaign.applyIsland(island);
      count++;
    }
    this.say(count ? 'Les bâtiments de tes îles sont au maximum' : 'Tu n’as aucune île');
  }

  /** Le navire piloté passe au rang suivant (victoires ajoutées). */
  nextRank() {
    const m = this.w.fleet.controlled;
    const next = RANKS.levels[rankOf(m.kills) + 1];
    if (!next) {
      this.w.hud.toast(`${m.name} est déjà au plus haut rang`, 2.5);
      return;
    }
    m.kills = next.kills;
    refit(m, this.w.campaign.crew);
    this.say(`${m.name} devient ${next.name}`);
  }
}
