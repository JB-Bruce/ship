import type * as THREE from 'three';
import type { Livery, ShipStats } from '../config';
import type { ShipType } from '../shipTypes';
import { BrigModel } from './brig/brigModel';
import { CarrackModel } from './carrack/carrackModel';
import { FluytModel } from './fluyt/fluytModel';
import { BrigantineModel } from './brigantine/brigantineModel';
import { CaravelModel } from './caravel/caravelModel';
import { SchoonerModel } from './schooner/schoonerModel';
import { CorvetteModel } from './corvette/corvetteModel';
import type { DeckPlan } from './deckPlan';
import type { LanternSpot } from './parts/nightGlow';
import { FrigateModel } from './frigate/frigateModel';
import { LongboatModel } from './longboat/longboatModel';
import { RowboatModel } from './rowboat/rowboatModel';
import { SloopModel } from './sloop/sloopModel';
import { XebecModel } from './xebec/xebecModel';

export interface CannonMount {
  object: THREE.Object3D;
  /**
   * Direction de tir au neutre, dans le repère du bateau et comme un cap :
   * 0 = vers la proue, +π/2 = bâbord, -π/2 = tribord.
   */
  angle: number;
  /** Rotation de base du canon autour de Y (le fût pointe vers +X local) : `angle - π/2`. */
  baseYaw: number;
  /** Décalage actuel par rapport au neutre (rad), limité à l'arc de tir. */
  yaw: number;
  /** Position de la bouche du fût dans le repère du canon. */
  muzzle: THREE.Vector3;
  /** Petit délai aléatoire avant le prochain tir, écoulé seulement une fois chargé et pointé (bordée en cascade). */
  fireDelay: number;
  /** Calibre : 'main' = ShipStats.cannon, 'deck' = ShipStats.deckCannon (pont supérieur d'un navire à deux calibres). */
  calibre: 'main' | 'deck';
  /** Mortier (brick) : il garde toujours son allure, quel que soit le type de canons du calibre. */
  mortar?: boolean;
}

/** Ce que tout modèle de bateau sait faire, quel que soit son type. */
/** Pavillon du grand mât (repère du modèle) : position de sa drisse, et sa taille. */
export interface FlagMount {
  readonly position: THREE.Vector3;
  readonly length: number;
  readonly height: number;
}

/** Hampe du drapeau de rang (repère du modèle) : pied et tête. */
export interface EnsignStaff {
  readonly base: THREE.Vector3;
  readonly top: THREE.Vector3;
}

export interface ShipModel {
  readonly root: THREE.Group;
  /** Pavillon du grand mât : les pavillons des boss coulés se hissent dessous. */
  readonly flagMount: FlagMount;
  /** Hampe du drapeau de rang : à la poupe, ou en tête du mât arrière quand une bôme passe au-dessus de la poupe. */
  readonly ensignStaff: EnsignStaff;
  readonly cannons: CannonMount[];
  /** Hauteur au-dessus de la flottaison où afficher la barre de vie (m). */
  readonly barHeight: number;
  /** Demi-largeur à la flottaison (m), en WATERLINE_SAMPLES points (parts/hullShape.ts) de la poupe à la proue. */
  readonly waterline: readonly number[];
  /** Endroits où fumée et feu peuvent naître quand le bateau est abîmé (repère du bateau : ponts, bordé). */
  readonly fireSpots: readonly THREE.Vector3[];
  /** Lanternes (repère du bateau), dont les halos brillent la nuit (fx/lanternHalos.ts). */
  readonly lanterns: readonly LanternSpot[];
  /** Pont où vit l'équipage animé (deckCrew/), pour les navires pontés ; les barques gardent leurs rameurs fixes. */
  readonly deckPlan?: DeckPlan;
  /** 0 = voiles carguées, 1 = pleine voile. */
  setSailAmount(amount: number): void;
  /** Niveau d'amélioration de la voilure : les voiles s'élargissent. */
  setSailLevel(level: number): void;
  /** Barre ∈ [-1, 1] (+1 = vers bâbord). */
  setRudder(rudder: number): void;
  /** Vent relatif au bateau (rad, 0 = vers la proue) et sa force 0..1. */
  setWind(relativeDirection: number, strength: number): void;
  /** (Re)crée `perSide` canons sur chaque flanc, et `chase` canons de chasse à la proue (caravelle, chébec). */
  setCannons(perSide: number, chase?: number): void;
  /** Avirons (chébec) : 0 = rentrés, 1 = sortis ; sortis, ils nagent en cadence. */
  setOars?(out: number): void;
  /** Niveau de renfort de coque (bandes de fer). */
  setArmorLevel(level: number): void;
  /** Allongement (0 ou 1), pour les types qui en ont un : le modèle se reconstruit. Renvoie true s'il a changé. */
  setExtension?(level: number): boolean;
  /** Vie perdue (0 = intact, 1 = coulé) : les voiles se trouent. */
  setDamage(damage: number): void;
  /** Hisse le pavillon du grand mât plus haut (m) : les pavillons des boss coulés prennent place dessous, au-dessus des voiles. */
  setFlagLift(lift: number): void;
  animate(dt: number): void;
  dispose(): void;
}

export function createShipModel(type: ShipType, stats: ShipStats, livery: Livery): ShipModel {
  if (type === 'sloop') return new SloopModel(stats, livery);
  if (type === 'rowboat') return new RowboatModel(stats, livery);
  if (type === 'caravel') return new CaravelModel(stats, livery);
  if (type === 'schooner') return new SchoonerModel(stats, livery);
  if (type === 'brigantine') return new BrigantineModel(stats, livery);
  if (type === 'xebec') return new XebecModel(stats, livery);
  if (type === 'fluyt') return new FluytModel(stats, livery);
  if (type === 'brig') return new BrigModel(stats, livery);
  if (type === 'corvette') return new CorvetteModel(stats, livery);
  if (type === 'carrack') return new CarrackModel(stats, livery);
  if (type === 'frigate') return new FrigateModel(stats, livery);
  return new LongboatModel(stats, livery);
}
