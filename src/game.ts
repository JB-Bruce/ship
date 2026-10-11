import * as THREE from 'three';
import { BOSSES, CAMERA, COMBAT, ISLAND_INFO, OCEAN, SKY, WORLD, type IslandId } from './config';
import { Campaign } from './campaign';
import { ChaseCamera } from './camera/chaseCamera';
import { cannonStatsOf, findTarget, updateCannons } from './combat/cannons';
import { Projectiles, type Ball } from './combat/projectiles';
import { setupDebug } from './debug';
import { DeckCrew } from './deckCrew/deckCrew';
import { Fishing } from './fleet/fishing';
import { Fleet, type FleetMember } from './fleet/fleet';
import { BossSinking } from './fx/bossSinking';
import { Effects } from './fx/effects';
import { FishSchoolFx } from './fx/fishSchoolFx';
import { KeyboardController } from './input/keyboardController';
import { Ocean } from './ocean/oceanMesh';
import { WakeMap } from './ocean/wakeMap';
import { Waves } from './ocean/waves';
import { PlayerState } from './progression/playerState';
import { Display } from './render/display';
import { SaveManager } from './save/saveManager';
import { applyQuality } from './render/quality';
import { Settings } from './settings/settings';
import type { Combatant, Ship } from './ship/ship';
import { SHIP_TYPES } from './shipTypes';
import { ActionPrompts } from './ui/actionPrompts';
import { ObjectiveBar } from './ui/bossBar';
import { FpsCounter } from './ui/fpsCounter';
import { HealthBars } from './ui/healthBars';
import { Hud } from './ui/hud';
import { createMenus } from './ui/menus';
import { ParchmentMenu } from './ui/parchmentMenu';
import type { PortMenu } from './ui/port/portMenu';
import { Radar } from './ui/radar';
import { WeatherButtons } from './ui/weatherButtons';
import { Bosses } from './world/bossEncounter';
import { resolveCollisions } from './world/collisions';
import { EnemySpawner } from './world/enemySpawner';
import { FishSchools } from './world/fishSchools';
import { FogCulling } from './world/fogCulling';
import type { Fort } from './world/fort';
import { tortuga } from './world/island';
import type { Lighthouse } from './world/lighthouse';
import { resolveLandCollisions } from './world/landCollision';
import { Loot } from './world/loot';
import { PirateTraffic } from './world/pirateTraffic';
import { Sky, sunDirection } from './world/sky';
import { Weather } from './world/weather';
import { weatherHazards } from './world/weatherHazards';
import { Wind } from './world/wind';
import { buildIslands } from './world/worldBuilder';

/** Assemble la scène et fait tourner la boucle de jeu. */
export class Game {
  /** Réglages du joueur (graphismes…), et l'affichage qui en dépend. */
  private readonly settings = new Settings();
  private readonly display: Display;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.5, 1000);
  /** Houle, puis clapot de grosse tempête (nul par temps normal : la météo règle sa raideur). */
  private readonly waves = new Waves([...OCEAN.waves, ...OCEAN.chopWaves.map((w) => ({ ...w, steepness: 0 }))]);
  private readonly wind = new Wind();
  private readonly ocean = new Ocean(this.waves);
  private readonly sky = new Sky();
  private readonly ambient = new THREE.HemisphereLight(SKY.ambientSky, SKY.ambientGround, SKY.ambientIntensity);
  private readonly sun = new THREE.DirectionalLight(SKY.sunColor, SKY.sunIntensity);
  private readonly weather: Weather;
  private readonly weatherButtons: WeatherButtons;
  private readonly state = new PlayerState();
  private readonly saves = new SaveManager();
  /** Tous les bateaux dans le monde : ceux de la flotte du joueur et les ennemis. */
  private readonly ships: Ship[] = [];
  private readonly fleet = new Fleet(this.scene, this.ships);
  /** Traces dans l'eau (sillages, anneaux d'écume, remous des bancs), lues par le shader de l'océan. */
  private readonly wakes = new WakeMap();
  private readonly effects = new Effects(this.scene, this.wakes);
  private readonly projectiles = new Projectiles();
  /** Équipages animés sur les ponts des navires proches. */
  private readonly deckCrew = new DeckCrew(this.scene, (x, y, z) => this.effects.splash(x, y, z));
  private readonly forts: Record<IslandId, Fort>;
  private readonly lighthouse: Lighthouse;
  // Butin : ta flotte le range ; un pirate allié le garde pour lui.
  private readonly loot = new Loot(this.scene, this.effects, (ship, kind, value) => (this.pirates.has(ship) ? value : this.campaign.collectLoot(ship, kind, value)));
  private readonly spawner = new EnemySpawner(this.scene, this.ships, (enemy) => {
    const { x, z } = enemy.ship.position;
    this.loot.spawnWreckLoot(x, z, enemy.lootFactor);
    if (enemy.boss) for (const kind of ['rum', 'spices'] as const) this.loot.spawnGoods(x, z, kind, 2);
  }, () => this.fleetPower());
  private readonly pirates = new PirateTraffic(this.scene, this.ships, () => this.fleetPower(), (ship) => this.wreckLoot(ship));
  private readonly schools = new FishSchools();
  private readonly schoolFx = new FishSchoolFx();
  private readonly fishing: Fishing;
  private readonly bosses: Bosses;
  private readonly campaign: Campaign;
  private readonly controller: KeyboardController;
  private readonly chaseCamera: ChaseCamera;
  private readonly bossSinking: BossSinking;
  private readonly hud: Hud;
  private readonly radar: Radar;
  private readonly healthBars: HealthBars;
  private readonly bossBar: ObjectiveBar;
  private readonly siegeBar: ObjectiveBar;
  private readonly prompts: ActionPrompts;
  private readonly portMenu: PortMenu;
  private readonly fpsCounter: FpsCounter;
  /** Décor et navires noyés dans la brume : pas dessinés. */
  private readonly fogCulling = new FogCulling();
  private readonly debugUpdate?: (dt: number) => void;
  private lastTime = 0;
  /** État de la réparation au quai, affiché sous les commandes (null = rien à signaler). */
  private repairStatus: string | null = null;

  constructor(container: HTMLElement) {
    this.display = new Display(container, this.settings.graphics);

    this.scene.background = new THREE.Color(SKY.horizonColor);
    this.scene.fog = new THREE.Fog(SKY.horizonColor, WORLD.fogNear, WORLD.fogFar);
    this.sun.position.copy(sunDirection).multiplyScalar(100);
    this.scene.add(this.ambient, this.sun, this.sky.mesh, this.ocean.mesh, this.projectiles.mesh, this.schoolFx.group);
    const islands = buildIslands(this.scene);
    ({ forts: this.forts, lighthouse: this.lighthouse } = islands);
    for (const decor of islands.decor) this.fogCulling.add(decor);

    // La flotte de la sauvegarde à charger, ou la chaloupe de départ.
    this.saves.start(this.fleet);
    this.controller = new KeyboardController(this.fleet.leader.controls);
    this.chaseCamera = new ChaseCamera(this.camera, this.display.viewport);
    this.bossSinking = new BossSinking(this.effects, this.chaseCamera);
    this.hud = new Hud(container);
    const hazards = weatherHazards(this.chaseCamera, this.effects, this.fleet, this.hud, (ship, damage) => this.applyDamage(ship, damage));
    this.weather = new Weather(this.scene, this.waves, this.ambient, this.sun, hazards);
    const applyGraphics = () => applyQuality(this.settings.graphics, { display: this.display, ocean: this.ocean, wakes: this.wakes, weather: this.weather });
    applyGraphics();
    this.settings.onChange(applyGraphics);
    this.radar = new Radar(container);
    this.healthBars = new HealthBars(container);
    this.bossBar = new ObjectiveBar(container, 'boss');
    this.siegeBar = new ObjectiveBar(container, 'siege');
    const world = { scene: this.scene, ships: this.ships, spawner: this.spawner, forts: this.forts, wreckLoot: (ship: Ship) => this.wreckLoot(ship) };
    this.campaign = new Campaign(this.state, this.fleet, this.hud, world, this.lighthouse, this.spawner);
    this.fishing = new Fishing(this.fleet, { caught: () => this.campaign.fishCaught(), say: (text) => this.hud.message(text, 2.5) });
    this.bosses = new Bosses(this.spawner, {
      appear: (id) => this.hud.message(`☠ ${BOSSES[id].name} approche !`, 5, true),
      leave: (id) => this.hud.message(`${BOSSES[id].calm} : ${BOSSES[id].name} s'éloigne…`, 4),
      vanish: (id) => this.hud.notifications.kill(`${BOSSES[id].name} a disparu dans la brume`),
    });

    const loaded = this.saves.finish({ state: this.state, fleet: this.fleet, campaign: this.campaign, spawner: this.spawner, weather: this.weather, ships: this.ships });
    if (loaded) this.hud.message(`Partie chargée : « ${loaded} »`, 3);

    const { state, fleet, campaign, hud, wind, spawner, loot, schools, radar, pirates, settings, display, saves } = this;
    this.portMenu = createMenus({ container, state, fleet, campaign, hud, wind, spawner, loot, schools, radar, pirates, settings, display, saves, takeHelm: (m) => this.takeHelm(m) });
    this.weatherButtons = new WeatherButtons(container, this.weather);
    this.fpsCounter = new FpsCounter(container, this.settings, this.display);
    this.prompts = new ActionPrompts(container, () => this.portMenu.openOn(), () => this.toggleFishing());
    if (new URLSearchParams(location.search).has('debug')) {
      this.debugUpdate = setupDebug(this.waves, this.fleet.leader);
      // Accès console pour inspecter / faire avancer la simulation pendant les tests.
      Object.assign(window, { game: this });
    }

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      // Triche de test : B donne 1000 or et 1000 bois.
      if (e.code === 'KeyB') {
        this.state.earn({ gold: 1000, wood: 1000 });
        this.hud.message('+1000 or et +1000 bois', 1.5);
      } else if (e.code === 'KeyF') {
        this.toggleFishing();
      }
    });
    addEventListener('resize', () => this.resize());
    this.display.start(this.scene, this.camera, (time) => this.frame(time));
  }

  /** Le moteur de rendu (accès console en ?debug pour les tests). */
  get renderer(): THREE.WebGLRenderer {
    return this.display.renderer;
  }

  private frame(timeMs: number) {
    // dt borné : jamais négatif (horloge qui recule), et pas de saut géant après un onglet en pause.
    // Menu ouvert = jeu en pause : la simulation est figée, l'affichage continue.
    const paused = ParchmentMenu.anyOpen();
    const elapsed = this.lastTime ? THREE.MathUtils.clamp((timeMs - this.lastTime) / 1000, 0, 0.05) : 0;
    const dt = paused ? 0 : elapsed;
    this.lastTime = timeMs;

    this.waves.time += dt;
    this.wind.update(dt);
    this.controller.enabled = !paused;
    this.controller.update(dt);
    this.spawner.update(dt, this.fleet.leader);
    this.bosses.update(dt, this.weather, this.fleet.leader, this.fleet.anyAlive());
    this.pirates.update(dt, this.loot.crates, this.schools.list, this.fleet.leader);
    this.schools.update(dt);
    this.fishing.update(dt, this.ships);
    // Pendant une escorte, les suiveurs entourent le navire à protéger au lieu de te suivre.
    this.fleet.guarded = this.campaign.escorts().find((s) => s.alive) ?? null;
    this.fleet.update(dt, this.loot.crates);
    for (const ship of this.ships) ship.update(dt, this.waves, this.wind);
    resolveCollisions(this.ships, this.effects, (ship, damage, other) => this.applyDamage(ship, damage, other));
    resolveLandCollisions(this.ships);
    this.repairStatus = this.campaign.repairAtPort(dt, this.ships, this.fleet.leader);
    this.campaign.update(dt, this.fleet.leader);
    for (const fort of Object.values(this.forts)) fort.update(dt, this.ships, this.projectiles, this.effects, this.wind);
    updateCannons(dt, this.ships, this.projectiles, this.effects);
    const besieged = this.campaign.missions.besieged();
    this.projectiles.update(dt, this.ships, this.waves, this.effects, (ship, ball) => this.onBallHit(ship, ball), besieged, (fort, ball) => fort.takeDamage(ball.damage));
    for (const ship of this.ships) this.effects.shipAmbient(dt, ship, this.waves);
    this.effects.update(dt, this.waves, this.ships);
    this.bossSinking.update(dt);
    this.schoolFx.update(dt, this.schools.list, this.waves);
    this.loot.update(dt, this.ships, this.waves);
    this.handleLeaderLoss();

    const leader = this.fleet.leader;
    this.ocean.update(leader.position);
    this.wakes.update(this.display.renderer, this.camera, dt, leader.position, this.ships, this.loot.crates, this.schools.list);
    this.chaseCamera.update(elapsed, leader, this.waves);
    this.weather.update(dt, this.camera, this.wind, this.ships, leader);
    this.fogCulling.update(this.camera, (this.scene.fog as THREE.Fog).far, this.ships);
    this.deckCrew.update(dt, this.camera, this.ships);
    this.weatherButtons.update();
    this.sky.update(this.camera.position);
    this.lighthouse.update(dt, this.camera);
    this.hud.update(dt, leader, this.state, this.inCombat(), this.fleet);
    this.hud.quests.update(dt, this.campaign.contracts, this.fleet, (c) => this.campaign.missions.status(c));
    this.radar.range = this.campaign.islands.tortuga.radarRange(tortuga.sdf(leader.position.x, leader.position.z)) * this.fleet.radarFactor();
    this.radar.update(dt, leader, this.spawner.enemies, this.wind, this.ships, this.schools.list, this.campaign.escorts());
    this.healthBars.update(this.camera, this.ships, leader, (this.scene.fog as THREE.Fog).far, this.spawner.enemies);
    const boss = this.bosses.inSight(leader);
    this.bossBar.update(boss?.boss ? `☠ ${BOSSES[boss.boss].name}` : null, boss ? boss.ship.health / boss.ship.stats.maxHealth : 0);
    const fort = besieged[0];
    this.siegeBar.update(fort ? ISLAND_INFO[fort.island].fort.name : null, fort ? fort.health / fort.maxHealth : 0);
    this.updatePrompts();
    this.fpsCounter.update();
    this.debugUpdate?.(elapsed);
    this.display.render(this.scene, this.camera);
  }

  /** Ta flotte, à laquelle s'adaptent les ennemis ordinaires et les pirates alliés. */
  private fleetPower() {
    return { ships: this.fleet.hand.length, best: this.fleet.strongest };
  }

  /** Commandes proposées à l'écran : escale près du quai, pêche près d'un banc. */
  private updatePrompts() {
    const fishing = this.fishing.school !== null;
    const school = fishing ? null : this.fishing.schoolInRange(this.schools);
    const fish = fishing ? 'Arrêter la pêche' : school ? 'Pêcher' : null;
    const port = this.campaign.portInRange(this.fleet.leader);
    this.prompts.update(port ? this.campaign.islands[port.id].info.portName : null, fish, this.fishing.status() ?? this.repairStatus);
  }

  private toggleFishing() {
    if (!ParchmentMenu.anyOpen()) this.fishing.toggle(this.schools, this.ships);
  }

  /** Le bateau piloté coule : on passe la barre à un autre, ou toute la flotte réapparaît au dernier port visité. */
  private handleLeaderLoss() {
    const switched = this.fleet.autoSwitch();
    if (switched) {
      this.controller.controls = switched.ship.controls;
      this.hud.message(`Tu prends la barre de ${switched.name}`, 3);
      return;
    }
    if (!this.fleet.leader.sunk || this.fleet.anyAlive()) return;
    const lost = this.state.loseGoldOnDeath();
    const start = this.campaign.respawnPort.portSpawn;
    this.fleet.respawnAll(start.x, start.z, start.heading);
    this.hud.message(lost > 0 ? `Toute ta flotte a sombré : −${lost} pièces d'or.` : 'Toute ta flotte a sombré…', 4);
  }

  private takeHelm(member: FleetMember) {
    if (!this.fleet.takeControl(member)) return;
    member.station = null;
    this.controller.controls = member.ship.controls;
    this.hud.message(`Tu prends la barre de ${member.name}`, 2.5);
  }

  private onBallHit(ship: Ship, ball: Ball) {
    this.effects.impact(ball.position);
    this.applyDamage(ship, ball.damage, ball.owner);
  }

  /** `attacker` : qui a porté le coup (bateau, fort), pour savoir qui a coulé un ennemi ; null pour la foudre et la mer. */
  private applyDamage(ship: Ship, damage: number, attacker: Combatant | null = null) {
    const sank = ship.damage(damage);
    const leader = this.fleet.leader;
    if (ship === leader) this.chaseCamera.shake(COMBAT.hitShake);
    if (!sank) return;
    this.effects.wreck(ship.position);
    if (ship.faction === 'enemy') {
      if (this.spawner.enemies.some((e) => e.ship === ship && e.boss)) this.bossSinking.start(ship, leader);
      this.campaign.enemySunk(ship, attacker);
      return;
    }
    // Un navire allié hors de ta flotte (marchand escorté ou des îles) : sa mission ou le trafic s'en charge.
    const member = this.fleet.members.find((m) => m.ship === ship);
    if (!member) return;
    this.campaign.memberSunk(member);
    if (ship === leader) this.hud.message(`${this.fleet.controlled.name} sombre…`, 3);
    else this.hud.message(`${member.name} a coulé. De retour dans ${Math.round(SHIP_TYPES[member.type].respawnTime * this.fleet.respawnFactor)} s.`, 3);
  }

  /** Épave d'un allié hors de ta flotte (pirate, marchand des îles) : le butin d'un navire de son type, comme un ennemi. */
  private wreckLoot(ship: Ship) {
    this.loot.spawnWreckLoot(ship.position.x, ship.position.z, SHIP_TYPES[ship.type].lootFactor);
  }

  /** Un ennemi est-il dans la zone de tir d'un canon du bateau piloté ? */
  private inCombat(): boolean {
    const leader = this.fleet.leader;
    return leader.alive && leader.model.cannons.some((m) => findTarget(leader, m.angle, this.ships, cannonStatsOf(leader, m)) !== null);
  }

  private resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.display.resize();
  }
}
