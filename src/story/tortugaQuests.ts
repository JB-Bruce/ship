import { STORY_QUEST, type IslandId } from '../config';
import { fleetStock } from '../fleet/holds';
import { findOpenSea } from '../missions/openSea';
import type { IslandState } from '../progression/islandState';
import { UPGRADE_IDS } from '../progression/upgrades';
import type { Ship } from '../ship/ship';
import type { Enemy } from '../world/enemySpawner';
import type { MainQuest } from './mainQuest';
import type { QuestWorld } from './questRun';

const T = STORY_QUEST.tortuga;
/** Mer libre autour du point où sortent les barques (m). */
const SPAWN_ROOM = 30;

/**
 * Le prologue à la Tortue : chaque petite quête se remplit en mer ou au port, puis se rapporte à Kerdal au port de la
 * Tortue (`ready`, lu par `StoryDirector` à l'ouverture du port). Lui pêcher du poisson (`kerdalFish`), améliorer un
 * navire (`firstUpgrade`), couler les barques de la Marine au large (`coveRats` : elles sortent quand on approche de
 * leur zone), construire un bâtiment de la Tortue (`portRepair` : `MainQuest.count` = bâtiments au début de l'étape).
 */
export class TortugaQuests {
  private rats: Enemy[] = [];

  constructor(
    private readonly quest: MainQuest,
    private readonly w: QuestWorld,
    private readonly islands: Record<IslandId, IslandState>,
  ) {}

  /** Bâtiments de la Tortue (somme des niveaux). */
  buildings(): number {
    return Object.values(this.islands.tortuga.levels).reduce((a, b) => a + b, 0);
  }

  /** L'objectif de l'étape est-il rempli (il ne reste qu'à voir Kerdal) ? */
  ready(): boolean {
    switch (this.quest.step) {
      case 'kerdalFish':
        return fleetStock(this.w.fleet.hand, 'fish') >= T.fish;
      case 'firstUpgrade':
        return this.w.fleet.members.some((m) => UPGRADE_IDS.some((id) => m.levels[id] > 0));
      case 'coveRats':
        return this.quest.count > 0;
      case 'portRepair':
        return this.buildings() > this.quest.count;
      default:
        return false;
    }
  }

  update(leader: Ship) {
    const step = this.quest.step;
    if (step === 'coveRats') this.cove(leader);
    const done = this.ready();
    const back = done ? 'fait ✔, va voir Kerdal' : '';
    if (step === 'kerdalFish') this.quest.detail = done ? back : `${fleetStock(this.w.fleet.hand, 'fish')} / ${T.fish}`;
    else if (step === 'firstUpgrade' || step === 'portRepair') this.quest.detail = back;
    else if (step === 'coveRats') this.quest.detail = done ? back : this.rats.length ? `${this.rats.filter((r) => !r.ship.alive).length} / ${this.rats.length}` : '';
  }

  /** Les barques sortent quand on approche ; toutes coulées, l'étape est remplie (`count` = 1). */
  private cove(leader: Ship) {
    if (this.quest.count > 0) return;
    const [x, z] = T.rats.at;
    if (!this.rats.length && leader.alive && Math.hypot(leader.position.x - x, leader.position.z - z) < T.rats.wake) {
      const p = findOpenSea(x, z, [0, T.rats.radius * 0.5], SPAWN_ROOM);
      const heading = Math.atan2(leader.position.x - p.x, leader.position.z - p.z);
      this.rats = this.w.world.spawner.spawnSquadron(T.rats.squadron, p.x, p.z, heading, 'Barque de la Marine', { home: { x, z, radius: T.rats.radius } }, false);
      this.w.hud.alert('⚔ Les barques de la Marine sortent de la crique !', true);
    }
    if (!this.rats.length || this.rats.some((r) => r.ship.alive)) return;
    this.rats = [];
    this.quest.count = 1;
    this.w.hud.toast('Les barques de la Marine sont par le fond : retourne voir Kerdal à la Tortue.', 'good');
  }

  /** Au chargement : les barques d'avant sont oubliées (elles ressortiront si l'étape n'est pas remplie). */
  reset() {
    for (const r of this.rats) if (r.ship.alive) this.w.world.spawner.discard(r);
    this.rats = [];
  }
}
