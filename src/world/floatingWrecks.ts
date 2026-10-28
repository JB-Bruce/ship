import * as THREE from 'three';
import { WORLD_EDGE, WRECKS } from '../config';
import { sound } from '../audio/sound';
import type { Fleet } from '../fleet/fleet';
import { load } from '../fleet/holds';
import type { SearchGauge } from '../missions/treasure/treasureRun';
import type { Waves } from '../ocean/waves';
import { blueprints, type BlueprintProgress } from '../progression/blueprints';
import { GOODS, goodText } from '../progression/goods';
import type { PlayerState } from '../progression/playerState';
import type { Ship } from '../ship/ship';
import { SHIP_SIZE_ORDER, type ShipType } from '../shipTypes';
import type { EnemySpawner } from './enemySpawner';
import { ISLAND_LIST, land } from './island';
import { buildWreck } from './wreckModel';

/** Ce qu'une fouille fait savoir au joueur. */
export interface WreckEvents {
  toast(text: string, tone?: 'info' | 'good' | 'danger'): void;
  alert(text: string): void;
  log(text: string): void;
  fragment(progress: BlueprintProgress): void;
  unlocked(type: ShipType): void;
}

interface Wreck {
  group: THREE.Group;
  x: number;
  z: number;
  heading: number;
  phase: number;
  /** Fouille en cours (s), et si la fouille a déjà commencé (embuscade tirée au sort une seule fois). */
  progress: number;
  started: boolean;
  noticed: boolean;
  /** Fouillée : temps avant qu'une autre épave la remplace ailleurs (s), sinon 0. */
  respawn: number;
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const randInt = (r: readonly [number, number]) => Math.floor(rand([r[0], r[1] + 1]));

/**
 * Épaves qui flottent çà et là en mer, à fouiller : on met en panne au-dessus (navire presque arrêté dans le rayon),
 * une jauge se remplit, et l'on repêche de l'or, du bois, parfois des marchandises, rarement un bout de plan ; une
 * fouille sur quatre environ attire un ennemi. Une épave fouillée disparaît et une autre apparaîtra ailleurs. Rien
 * n'est sauvegardé : elles sont retirées au hasard à chaque partie. Réglages : WRECKS.
 */
export class FloatingWrecks {
  private readonly wrecks: Wreck[] = [];
  private searching: Wreck | null = null;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    private readonly events: WreckEvents,
  ) {
    const count = randInt(WRECKS.count);
    for (let i = 0; i < count; i++) {
      const group = buildWreck();
      scene.add(group);
      const wreck: Wreck = { group, x: 0, z: 0, heading: 0, phase: Math.random() * 6, progress: 0, started: false, noticed: false, respawn: 0 };
      this.wrecks.push(wreck);
      this.place(wreck, null);
    }
  }

  /** Positions des épaves à flot (radar, carte). */
  positions(out: { x: number; z: number }[]): { x: number; z: number }[] {
    out.length = 0;
    for (const w of this.wrecks) if (!w.respawn) out.push(w);
    return out;
  }

  update(dt: number, waves: Waves, leader: Ship, fleet: Fleet, state: PlayerState, spawner: EnemySpawner) {
    this.time += dt;
    this.searching = null;
    for (const w of this.wrecks) {
      if (w.respawn > 0) {
        w.respawn -= dt;
        if (w.respawn <= 0) this.place(w, leader);
        continue;
      }
      // Elle danse sur la houle.
      const g = w.group;
      g.position.set(w.x, waves.heightAt(w.x, w.z), w.z);
      g.rotation.set(Math.sin(this.time * 0.7 + w.phase) * 0.06, w.heading, Math.cos(this.time * 0.5 + w.phase) * 0.08);
      if (!leader.alive) continue;
      const d = Math.hypot(leader.position.x - w.x, leader.position.z - w.z);
      if (d < WRECKS.noticeRange && !w.noticed) {
        w.noticed = true;
        this.events.toast('Une épave ! Mets en panne au-dessus pour la fouiller.');
      }
      if (d > WRECKS.search.radius || Math.abs(leader.speed) > WRECKS.search.maxSpeed) continue;
      this.searching = w;
      if (!w.started) {
        w.started = true;
        if (Math.random() < WRECKS.ambushChance && spawner.spawnChaser(leader)) this.events.alert('⚔ Des pillards rôdaient autour de l’épave !');
      }
      w.progress += dt;
      if (w.progress >= WRECKS.search.time) this.loot(w, fleet, state);
    }
  }

  /** Jauge de la fouille en cours, ou null. */
  gauge(): SearchGauge | null {
    const w = this.searching;
    return w ? { label: 'Fouiller l’épave', progress: Math.min(1, w.progress / WRECKS.search.time), active: true } : null;
  }

  private loot(w: Wreck, fleet: Fleet, state: PlayerState) {
    const L = WRECKS.loot;
    const gold = randInt(L.gold);
    const wood = randInt(L.wood);
    state.earn({ gold, wood });
    const found = [`${gold} or`, `${wood} bois`];
    if (Math.random() < L.goodsChance) {
      const good = GOODS[Math.floor(Math.random() * GOODS.length)];
      const taken = load(fleet.hand, good, randInt(L.goods));
      if (taken > 0) found.push(goodText(good, taken));
    }
    sound.play('ui/chest_open');
    sound.play('ui/coins');
    this.events.toast(`Épave fouillée : ${found.join(', ')}`, 'good');
    const type = SHIP_SIZE_ORDER.find((t) => !blueprints.isUnlocked(t));
    if (type && Math.random() < L.planChance) {
      const progress = blueprints.addFragment(type);
      if (progress.completed) this.events.unlocked(type);
      else this.events.fragment(progress);
    }
    w.group.visible = false;
    w.respawn = rand(WRECKS.respawn);
  }

  /** Une nouvelle place en mer : à bonne distance de la terre, des ports, des autres épaves et du navire piloté. */
  private place(w: Wreck, leader: Ship | null) {
    const [cx, cz] = WORLD_EDGE.center;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (WORLD_EDGE.radius - WORLD_EDGE.approach);
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      const sdf = land.sdf(x, z);
      if (sdf < WRECKS.landDistance[0] || sdf > WRECKS.landDistance[1]) continue;
      if (ISLAND_LIST.some((island) => Math.hypot(island.portSpawn.x - x, island.portSpawn.z - z) < WRECKS.portClearance)) continue;
      if (this.wrecks.some((o) => o !== w && !o.respawn && Math.hypot(o.x - x, o.z - z) < WRECKS.spacing)) continue;
      if (leader && Math.hypot(leader.position.x - x, leader.position.z - z) < WRECKS.spawnAway) continue;
      Object.assign(w, { x, z, heading: Math.random() * Math.PI * 2, progress: 0, started: false, noticed: false, respawn: 0 });
      w.group.visible = true;
      return;
    }
    // Pas de place cette fois : on réessaiera plus tard.
    w.respawn = WRECKS.respawn[0];
  }
}
