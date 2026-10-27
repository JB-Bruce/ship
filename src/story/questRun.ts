import { CURSED, STORY_QUEST } from '../config';
import type { Crew } from '../fleet/crew';
import type { Fleet } from '../fleet/fleet';
import { fleetStock } from '../fleet/holds';
import type { MissionWorld } from '../missions/mission';
import { findOpenSea } from '../missions/openSea';
import type { Waves } from '../ocean/waves';
import type { PlayerState } from '../progression/playerState';
import type { Ship } from '../ship/ship';
import { sizeRank } from '../shipTypes';
import type { CursedTide } from '../world/cursedTide';
import type { Enemy } from '../world/enemySpawner';
import { FloatingRelic } from './floatingRelic';
import type { MainQuest, QuestStep } from './mainQuest';

/** Ce que les étapes en mer font savoir au joueur. */
export interface QuestHud {
  toast(text: string, tone?: 'info' | 'good' | 'danger'): void;
  alert(text: string, danger: boolean): void;
  log(text: string): void;
  /** Étape franchie : bandeau du chapitre. */
  chapter(title: string, note: string): void;
}

export interface QuestWorld {
  readonly world: MissionWorld;
  readonly waves: Waves;
  readonly fleet: Fleet;
  readonly crew: Crew;
  readonly state: PlayerState;
  readonly cursed: CursedTide;
  readonly hud: QuestHud;
}

const D = STORY_QUEST.duroc;
const G = STORY_QUEST.greenLights;
/** Mer libre autour du point où sort Le Faucon (m). */
const SPAWN_ROOM = 40;
const DUROC_NAME = 'Le Faucon (lieutenant Duroc)';

/**
 * Les étapes de la quête principale qui se jouent en mer : avoir un vrai navire et un officier (`aRealShip`), couler Le
 * Faucon du lieutenant Duroc (`hangman` : il sort de la brume quand on approche de sa zone, crie à ses hommes à mi-vie),
 * couler des navires maudits (`greenLights` : ils surgissent chaque nuit tant que l'étape dure, et à coup sûr au Banc du
 * Naufragé), puis repêcher le médaillon laissé par le dernier (`medallion`). Les étapes à terre (taverne) sont jouées
 * par `StoryDirector`. Rien n'échoue : l'étape attend.
 */
export class QuestRun {
  private duroc: Enemy | null = null;
  private escort: Enemy[] = [];
  private shouted = false;
  private relic: FloatingRelic | null = null;
  /** Temps avant que les maudits puissent à nouveau surgir au Banc (s). */
  private bancCooldown = 0;

  constructor(
    private readonly quest: MainQuest,
    private readonly w: QuestWorld,
  ) {
    // Tant que l'étape des fanaux verts dure, les maudits viennent toutes les nuits.
    w.cursed.forceNights = () => quest.step === 'greenLights';
  }

  update(dt: number) {
    const leader = this.w.world.leader();
    switch (this.quest.step) {
      case 'aRealShip':
        return this.checkShip();
      case 'hangman':
        return this.hangman(leader);
      case 'greenLights':
        this.quest.detail = `${this.quest.count} / ${G.target}`;
        return this.banc(dt, leader);
      case 'medallion':
        return this.medallion(dt, leader);
      case 'silence':
        this.quest.detail = `rhum ${Math.min(STORY_QUEST.rum, fleetStock(this.w.fleet.hand, 'rum'))} / ${STORY_QUEST.rum}`;
    }
  }

  /** Un navire ennemi a sombré, coulé par ta flotte (`byFleet`). */
  enemySunk(enemy: Enemy, byFleet: boolean) {
    if (this.quest.step !== 'greenLights' || !enemy.cursed || !byFleet) return;
    this.quest.count++;
    this.w.hud.toast(`☠ Navire maudit renvoyé aux abysses : ${this.quest.count} / ${G.target}`, 'good');
    if (this.quest.count < G.target) return;
    this.quest.relic = [enemy.ship.position.x, enemy.ship.position.z];
    this.complete('greenLights', 'medallion');
    this.w.hud.alert('Quelque chose flotte dans l’épave du navire maudit…', false);
  }

  /** Le navire de l'histoire à montrer dans la barre du haut (Le Faucon), s'il est à flot et proche. */
  target(): Enemy | null {
    const d = this.duroc;
    if (!d?.ship.alive) return null;
    return d.ship.distanceTo(this.w.world.leader()) < D.wake * 1.5 ? d : null;
  }

  /** Au chargement : on oublie les navires et objets de l'étape d'avant (ils reviendront d'eux-mêmes). */
  reset() {
    this.releaseDuroc();
    this.relic?.remove();
    this.relic = null;
  }

  private checkShip() {
    const ship = this.w.fleet.members.some((m) => sizeRank(m.type) >= STORY_QUEST.ship);
    const officer = this.w.crew.officers.length > 0;
    this.quest.detail = `navire ${ship ? '✔' : '✘'} · officier ${officer ? '✔' : '✘'}`;
    if (!ship || !officer) return;
    this.complete('aRealShip', 'hangman');
    this.w.hud.log('⚓ À la taverne, on parle d’un lieutenant de la Marine qui pend les pirates au sud de l’Île du Dauphin : Duroc, dit le Pendeur.');
  }

  private hangman(leader: Ship) {
    const [x, z] = D.at;
    if (!this.duroc && leader.alive && Math.hypot(leader.position.x - x, leader.position.z - z) < D.wake) this.spawnDuroc(leader);
    const d = this.duroc;
    if (!d) return;
    if (d.ship.alive) {
      if (!this.shouted && d.ship.health < d.ship.stats.maxHealth * D.shout) {
        this.shouted = true;
        this.w.hud.toast('Duroc : « Tenez vos pièces ! Je veux ce pavillon au bout de ma vergue ! »', 'danger');
      }
      return;
    }
    this.releaseDuroc();
    this.complete('hangman', 'greenLights');
    this.w.hud.alert('Le Pendeur sombre avec Le Faucon. Ton nom court déjà les tavernes.', false);
    this.w.hud.log('✉ Un pêcheur t’apporte un mot de Kerdal : « Des fanaux verts au Banc du Naufragé. Va voir, de nuit. »');
  }

  private spawnDuroc(leader: Ship) {
    const [x, z] = D.at;
    const away = Math.atan2(x - leader.position.x, z - leader.position.z);
    const p = findOpenSea(x, z, [D.wake * 0.3, D.wake * 0.7], SPAWN_ROOM, away, 0.8);
    const heading = Math.atan2(leader.position.x - p.x, leader.position.z - p.z);
    const squadron = this.w.world.spawner.spawnSquadron(D.squadron, p.x, p.z, heading, DUROC_NAME, { home: { x, z, radius: D.radius } });
    this.duroc = squadron[0];
    this.escort = squadron.slice(1);
    this.shouted = false;
    this.w.hud.alert('⚔ Le Faucon sort de la brume : le lieutenant Duroc, dit le Pendeur !', true);
    this.w.hud.toast('Duroc : « Encore un rat de la Tortue. J’ai gardé une corde pour toi. »', 'danger');
  }

  private releaseDuroc() {
    for (const e of this.escort) e.persistent = false;
    if (this.duroc?.ship.alive) this.w.world.spawner.discard(this.duroc);
    this.duroc = null;
    this.escort = [];
  }

  /** De nuit, au Banc du Naufragé, des navires maudits surgissent tant qu'il n'y en a plus à flot. */
  private banc(dt: number, leader: Ship) {
    this.bancCooldown = Math.max(0, this.bancCooldown - dt);
    const [x, z] = G.at;
    const there = leader.alive && Math.hypot(leader.position.x - x, leader.position.z - z) < G.radius;
    if (!there || !this.w.cursed.night || this.bancCooldown > 0) return;
    if (this.w.world.spawner.enemies.some((e) => e.cursed && e.ship.alive)) return;
    this.bancCooldown = G.cooldown;
    this.w.cursed.summon(this.w.world.leader(), G.count, CURSED.rankBonus);
    this.w.hud.alert('☠ Des fanaux verts montent des profondeurs du Banc !', true);
  }

  private medallion(dt: number, leader: Ship) {
    if (!this.relic) {
      const [x, z] = this.quest.relic ?? G.at;
      this.relic = new FloatingRelic(this.w.world.scene, this.w.waves, x, z);
    }
    if (!this.relic.update(dt, leader)) return;
    this.relic = null;
    this.quest.relic = null;
    this.complete('medallion', 'returnIsaure');
    this.w.hud.alert('Un médaillon d’or, gravé d’une sirène : la marque de Lagrange.', false);
  }

  /** Étape franchie : sa récompense, puis la suivante et son bandeau. */
  complete(done: QuestStep, next: QuestStep) {
    const reward = (STORY_QUEST.reward as Partial<Record<QuestStep, number>>)[done] ?? 0;
    if (reward > 0) {
      this.w.state.earn({ gold: reward, wood: 0 });
      this.w.hud.log(`⚓ Histoire : +${reward} or`);
    }
    this.quest.advance(next);
    const s = this.quest.current;
    if (s) this.w.hud.chapter(s.title, s.note);
  }
}
