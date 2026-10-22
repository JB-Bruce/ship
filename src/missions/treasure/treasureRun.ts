import { TREASURE, TREASURE_HUNTS, type TreasureHuntDef, type TreasureHuntId, type TreasureStep } from '../../config';
import type { HuntState } from '../../progression/treasures';
import type { Enemy } from '../../world/enemySpawner';
import type { MapZone, MissionWorld } from '../mission';
import { findOpenSea } from '../openSea';

/** Ce qu'une chasse fait savoir : petit message, alerte au centre, ligne du fil, morceau de carte, trésor trouvé. */
export interface TreasureEvents {
  toast(text: string): void;
  alert(text: string, danger: boolean): void;
  piece(id: TreasureHuntId): void;
  found(id: TreasureHuntId): void;
}

/** Fouille en cours, pour la jauge à l'écran. */
export interface SearchGauge {
  label: string;
  /** 0 à 1. */
  progress: number;
  /** Le navire est à l'arrêt sur place : la jauge avance. */
  active: boolean;
}

/** Rayon du poste où le gardien et le morceau qui rôde tournent autour de leur lieu (m). */
const GUARD_HOME = 220;
/** Mer libre autour du point où apparaît un gardien ou une embuscade (m). */
const SPAWN_ROOM = 40;

/** Angle d'or : décale les zones approximatives d'une étape à l'autre sans hasard (elles ne bougent pas au chargement). */
const GOLDEN = 2.39996;

/**
 * Une chasse au trésor en cours, étape par étape : fouille sur place (`search`, `dig` : navire presque arrêté dans le
 * rayon, la jauge se met en pause dès qu'il s'éloigne ; `dig` lâche des embuscades en cours de route), énigme
 * (`reach` : atteindre le lieu), gardien (`guardian` : il surgit quand on approche et porte un morceau) et morceau qui
 * rôde (`roamer` : un navire nommé dans une zone marquée). Une chasse n'échoue jamais : elle attend.
 */
export class TreasureRun {
  readonly def: TreasureHuntDef;
  /** Le navire qui porte le morceau de l'étape (gardien, morceau qui rôde). */
  private carrier: Enemy | null = null;
  /** Les navires surgis pendant cette étape (escorte, embuscades). */
  private spawned: Enemy[] = [];
  /** Embuscades déjà lâchées pendant la fouille du trésor. */
  private waves = 0;
  private searching = false;

  constructor(
    readonly id: TreasureHuntId,
    readonly state: HuntState,
    private readonly world: MissionWorld,
    private readonly events: TreasureEvents,
  ) {
    this.def = TREASURE_HUNTS[id];
  }

  get step(): TreasureStep {
    return this.def.steps[this.state.step];
  }

  /** Avance la chasse ; renvoie vrai quand le trésor est trouvé. */
  update(dt: number): boolean {
    const step = this.step;
    const leader = this.world.leader();
    const distance = Math.hypot(leader.position.x - step.at[0], leader.position.z - step.at[1]);
    this.searching = false;
    switch (step.kind) {
      case 'reach':
        if (leader.alive && distance < step.radius) return this.next(true);
        return false;
      case 'search':
      case 'dig':
        this.searching = leader.alive && distance < step.radius && Math.abs(leader.speed) < TREASURE.searchSpeed;
        if (this.searching) this.state.progress += dt;
        if (step.kind === 'dig') this.ambush(step);
        if (this.state.progress >= step.time) return this.next(step.kind === 'dig' || step.piece);
        return false;
      case 'guardian':
        if (!this.carrier && leader.alive && distance < TREASURE.wakeDistance) this.spawnGuardian(step);
        if (this.carrier && !this.carrier.ship.alive) return this.next(true);
        return false;
      case 'roamer':
        if (!this.carrier) this.spawnRoamer(step);
        if (this.carrier && !this.carrier.ship.alive) return this.next(true);
        return false;
    }
  }

  /** Étape franchie : son message, son morceau, puis la suivante (ou le trésor). */
  private next(piece: boolean): boolean {
    const step = this.step;
    this.release();
    const last = this.state.step >= this.def.steps.length - 1;
    if (last) {
      this.events.found(this.id);
      return true;
    }
    if (piece && step.kind !== 'reach') {
      this.state.pieces = Math.min(this.def.pieces, this.state.pieces + 1);
      this.events.piece(this.id);
    }
    // L'énigme résolue fait surgir le gardien : c'est une alerte ; un morceau trouvé, un moment fort.
    this.events.alert(step.found, step.kind === 'reach');
    this.state.step++;
    this.state.progress = 0;
    this.waves = 0;
    return false;
  }

  /** Embuscades de la fouille du trésor, réparties sur la durée de la fouille. */
  private ambush(step: Extract<TreasureStep, { kind: 'dig' }>) {
    const { waves, time } = step;
    const due = Math.floor((this.state.progress / time) * (waves.length + 1));
    if (this.waves >= Math.min(due, waves.length)) return;
    const leader = this.world.leader();
    const p = findOpenSea(leader.position.x, leader.position.z, [TREASURE.spawnDistance, TREASURE.spawnDistance * 1.2], SPAWN_ROOM);
    const heading = Math.atan2(leader.position.x - p.x, leader.position.z - p.z);
    this.spawned.push(...this.world.spawner.spawnSquadron(waves[this.waves], p.x, p.z, heading, null, {}, false));
    this.waves++;
    this.events.alert('⚔ Embuscade ! On veut te prendre le trésor.', true);
  }

  private spawnGuardian(step: Extract<TreasureStep, { kind: 'guardian' }>) {
    const leader = this.world.leader();
    const away = Math.atan2(step.at[0] - leader.position.x, step.at[1] - leader.position.z);
    const p = findOpenSea(step.at[0], step.at[1], [TREASURE.spawnDistance * 0.5, TREASURE.spawnDistance], SPAWN_ROOM, away, 0.8);
    const heading = Math.atan2(leader.position.x - p.x, leader.position.z - p.z);
    this.spawned = this.world.spawner.spawnSquadron(step.squadron, p.x, p.z, heading, step.captain, { home: { x: step.at[0], z: step.at[1], radius: GUARD_HOME } });
    this.carrier = this.spawned[0];
  }

  private spawnRoamer(step: Extract<TreasureStep, { kind: 'roamer' }>) {
    const p = findOpenSea(step.at[0], step.at[1], [0, step.radius * 0.6], SPAWN_ROOM);
    this.spawned = this.world.spawner.spawnSquadron([step.type], p.x, p.z, Math.random() * Math.PI * 2, step.captain, { home: { x: step.at[0], z: step.at[1], radius: step.radius } });
    this.carrier = this.spawned[0];
  }

  /** Les navires de l'étape redeviennent des ennemis ordinaires (ils disparaîtront si le joueur s'éloigne). */
  release() {
    for (const enemy of this.spawned) enemy.persistent = false;
    if (this.carrier?.ship.alive) this.world.spawner.discard(this.carrier);
    this.spawned = [];
    this.carrier = null;
  }

  /** Jauge de fouille, tant qu'on est à une étape de fouille et qu'elle a commencé ou que le navire est sur place. */
  gauge(): SearchGauge | null {
    const step = this.step;
    if (step.kind !== 'search' && step.kind !== 'dig') return null;
    if (!this.searching && this.state.progress <= 0) return null;
    return { label: step.title, progress: Math.min(1, this.state.progress / step.time), active: this.searching };
  }

  /** Zone à marquer sur la carte : approximative autour du lieu (pas pour l'énigme, qu'il faut résoudre). */
  zones(): MapZone[] {
    const step = this.step;
    const label = `🗝 ${step.title}`;
    if (step.kind === 'reach') return [];
    if (step.kind === 'roamer') return this.carrier?.ship.alive === false ? [] : [{ x: step.at[0], z: step.at[1], radius: step.radius, label }];
    const angle = (this.state.step + 1) * GOLDEN + this.id.length;
    const shift = TREASURE.zoneJitter * (0.5 + 0.5 * Math.sin(angle * 3.1));
    return [{ x: step.at[0] + Math.sin(angle) * shift, z: step.at[1] + Math.cos(angle) * shift, radius: TREASURE.zoneRadius, label }];
  }
}
