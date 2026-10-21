import type { Campaign } from '../campaign';
import type { Fleet, FleetMember } from '../fleet/fleet';
import type { PlayerState } from '../progression/playerState';
import type { Display } from '../render/display';
import type { SaveManager } from '../save/saveManager';
import type { Settings } from '../settings/settings';
import type { EnemySpawner } from '../world/enemySpawner';
import type { FishSchools } from '../world/fishSchools';
import type { Loot } from '../world/loot';
import type { PirateTraffic } from '../world/pirateTraffic';
import type { PlanScrolls } from '../world/planScrolls';
import type { Wind } from '../world/wind';
import { CabinMenu } from './cabin/cabinMenu';
import { FleetMenu } from './fleetMenu';
import type { Hud } from './hud';
import { MapMenu } from './mapMenu';
import { PortMenu } from './port/portMenu';
import type { Radar } from './radar';
import { SettingsMenu } from './settings/settingsMenu';
import type { DayCycle } from '../world/dayCycle';

/** Ce que les menus parchemin lisent du jeu. */
export interface MenuWorld {
  readonly container: HTMLElement;
  readonly state: PlayerState;
  readonly fleet: Fleet;
  readonly campaign: Campaign;
  readonly hud: Hud;
  readonly wind: Wind;
  readonly spawner: EnemySpawner;
  readonly loot: Loot;
  readonly planScrolls: PlanScrolls;
  readonly schools: FishSchools;
  readonly radar: Radar;
  readonly pirates: PirateTraffic;
  readonly settings: Settings;
  readonly display: Display;
  readonly saves: SaveManager;
  readonly dayCycle: DayCycle;
  takeHelm(member: FleetMember): void;
}

/** Crée les menus parchemin (Cabine, port, flotte, carte, paramètres). Renvoie celui du port, qu'ouvrent les commandes à l'écran. */
export function createMenus(w: MenuWorld): PortMenu {
  const { container, campaign, fleet } = w;
  const { ledger, contracts, harbor } = campaign;
  const portContext = { state: w.state, fleet, contracts, ledger, crew: campaign.crew, routes: campaign.routes, actions: harbor, get island() { return harbor.island; } };
  const portMenu = new PortMenu(container, portContext, {
    inRange: () => campaign.portInRange(fleet.leader) !== null,
    onOpen: () => harbor.visit(campaign.islands[campaign.portInRange(fleet.leader)!.id]),
    refused: () => w.hud.toast('Approche-toi du quai pour faire escale (P).', 2.5),
  });
  new CabinMenu(container, {
    state: w.state,
    fleet,
    crew: campaign.crew,
    contracts,
    ledger,
    routes: campaign.routes,
    actions: {
      buyUpgrade: (id) => harbor.buyUpgrade(id),
      assignOfficer: (officer, member) => harbor.assignOfficer(officer, member),
      takeHelm: (member) => w.takeHelm(member),
      abandonContract: (id) => harbor.abandonContract(id),
    },
    atPort: () => campaign.portInRange(fleet.leader) !== null,
    missionStatus: (c) => campaign.missions.status(c),
  });
  new FleetMenu(container, fleet, (member) => w.takeHelm(member));
  new MapMenu(container, {
    fleet,
    wind: w.wind,
    enemies: () => w.spawner.enemies,
    crates: () => w.loot.crates,
    scrolls: () => w.planScrolls.positions,
    schools: () => w.schools.list,
    radarRange: () => w.radar.range,
    coverage: () => campaign.islands.tortuga.coverage,
    zones: () => campaign.missions.zones(),
    escorts: () => campaign.escorts(),
    pirates: () => [...w.pirates.pirates.map((p) => p.ship), ...campaign.merchants.ships, ...campaign.missions.allies()],
    discovery: campaign.discovery,
    objectivePorts: () => contracts.active.map((c) => c.claimAt),
  });
  new SettingsMenu(container, { settings: w.settings, display: w.display, saves: w.saves, clock: w.dayCycle });
  return portMenu;
}
