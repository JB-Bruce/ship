import * as THREE from 'three';
import { BOSSES, GUNS, type BossId } from '../config';
import type { Guns } from '../progression/modifiers';
import { cylinderBetween } from './parts/sails';
import { flagMaterialFor, std, WavingFlag } from './parts/common';
import type { ShipModel } from './shipModel';
import { applyWear } from './shipWear';

/** Écart entre deux pavillons hissés l'un sous l'autre (fraction de la hauteur d'un pavillon). */
const FLAG_GAP = 0.2;
/** Taille du drapeau de rang par rapport au pavillon du grand mât. */
const RANK_FLAG_SCALE = 0.75;
const RANK_COLOR = '#141414';
const STAR_COLOR = '#e8c34a';

const rankMaterials = new Map<number, THREE.Material>();
const staffMaterial = std(0x6b4a30);

/** Drapeau de rang : noir, à queue d'aronde, frappé de 1 à 3 étoiles dorées. */
function rankMaterial(stars: number): THREE.Material {
  let material = rankMaterials.get(stars);
  if (material) return material;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const g = canvas.getContext('2d')!;
  // Queue d'aronde : une encoche au bout flottant (la partie transparente est découpée par alphaTest).
  g.fillStyle = RANK_COLOR;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 0);
  g.lineTo(96, 40);
  g.lineTo(128, 80);
  g.lineTo(0, 80);
  g.closePath();
  g.fill();
  g.fillStyle = STAR_COLOR;
  for (let i = 0; i < stars; i++) star(g, 26 + i * 24 + (3 - stars) * 12, 40, 10);
  material = std(0xffffff, { map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.9 });
  rankMaterials.set(stars, material);
  return material;
}

function wave(flag: WavingFlag, dt: number, windDirection: number, windStrength: number) {
  flag.setWind(windDirection, windStrength);
  flag.update(dt);
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  g.closePath();
  g.fill();
}

/**
 * Ce qui distingue un navire de la flotte : le drapeau de rang (étoiles) sur sa hampe, les pavillons des boss qu'il a
 * coulés hissés sous son pavillon, et l'allure de ses canons selon leur type. Attaché au modèle (il en suit l'échelle).
 */
export class ShipDressing {
  private rank = 0;
  private rankFlag: WavingFlag | null = null;
  private staff: THREE.Mesh | null = null;
  private trophyIds = '';
  private trophies: WavingFlag[] = [];
  /** Flèche au-dessus du grand mât, quand des pavillons de boss y sont hissés. */
  private pole: THREE.Mesh | null = null;

  constructor(private readonly model: ShipModel) {}

  /** Rang en étoiles (0 = recrue : pas de drapeau). */
  setRank(stars: number) {
    if (stars === this.rank) return;
    this.rank = stars;
    this.removeRank();
    applyWear(this.model.root, stars);
    if (stars <= 0) return;
    const { base, top } = this.model.ensignStaff;
    const mount = this.model.flagMount;
    this.staff = new THREE.Mesh(cylinderBetween(base, top, 0.04, 0.03, 5), staffMaterial);
    this.rankFlag = new WavingFlag(rankMaterial(stars), mount.length * RANK_FLAG_SCALE, mount.height * RANK_FLAG_SCALE);
    this.rankFlag.mesh.position.copy(top).y -= (mount.height * RANK_FLAG_SCALE) / 2;
    this.model.root.add(this.staff, this.rankFlag.mesh);
  }

  /**
   * Pavillons des boss coulés, hissés sous le pavillon du grand mât (sous ses propres couleurs, comme les prises de
   * guerre). Pour ne pas pendre devant les voiles, ils montent sur une flèche au-dessus du mât : le pavillon pirate est
   * hissé d'autant, les trophées occupent sa place d'origine et au-dessus.
   */
  setTrophies(ids: readonly BossId[]) {
    const key = ids.join(',');
    if (key === this.trophyIds) return;
    this.trophyIds = key;
    this.removeTrophies();
    const mount = this.model.flagMount;
    const step = mount.height * (1 + FLAG_GAP);
    const lift = ids.length * step;
    this.model.setFlagLift(lift);
    if (!ids.length) return;
    const foot = mount.position.clone().setY(mount.position.y - mount.height / 2);
    const head = mount.position.clone().setY(mount.position.y + lift + mount.height * 0.6);
    this.pole = new THREE.Mesh(cylinderBetween(foot, head, 0.05, 0.035, 5), staffMaterial);
    this.model.root.add(this.pole);
    this.trophies = ids.map((id, k) => {
      const flag = new WavingFlag(flagMaterialFor(BOSSES[id].livery), mount.length, mount.height);
      flag.mesh.position.copy(mount.position).y += lift - (k + 1) * step;
      this.model.root.add(flag.mesh);
      return flag;
    });
  }

  /** Le modèle a été reconstruit (allongement) : drapeau de rang, trophées et allure des fûts sont reposés. */
  refresh(guns: Guns) {
    const rank = this.rank;
    this.rank = -1;
    this.setRank(rank);
    const ids = this.trophyIds;
    this.trophyIds = '-';
    this.setTrophies(ids ? (ids.split(',') as BossId[]) : []);
    this.applyGunLook(guns);
  }

  /** Allure des fûts selon le type de canons de chaque calibre (le fût pointe vers +X local). */
  applyGunLook(guns: Guns) {
    for (const mount of this.model.cannons) {
      if (mount.mortar) continue;
      const look = GUNS.types[mount.calibre === 'deck' ? guns.deck : guns.main].look;
      mount.object.scale.set(look.length, look.girth, look.girth);
    }
  }

  /** Vent relatif au bateau (rad) et sa force : les drapeaux flottent avec le pavillon. */
  update(dt: number, windDirection: number, windStrength: number) {
    if (this.rankFlag) wave(this.rankFlag, dt, windDirection, windStrength);
    for (const flag of this.trophies) wave(flag, dt, windDirection, windStrength);
  }

  dispose() {
    this.removeRank();
    this.removeTrophies();
  }

  private removeTrophies() {
    for (const flag of this.trophies) {
      this.model.root.remove(flag.mesh);
      flag.dispose();
    }
    this.trophies = [];
    if (this.pole) {
      this.model.root.remove(this.pole);
      this.pole.geometry.dispose();
      this.pole = null;
    }
  }

  private removeRank() {
    if (this.staff) {
      this.model.root.remove(this.staff);
      this.staff.geometry.dispose();
      this.staff = null;
    }
    if (this.rankFlag) {
      this.model.root.remove(this.rankFlag.mesh);
      this.rankFlag.dispose();
      this.rankFlag = null;
    }
  }
}
