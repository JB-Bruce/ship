import * as THREE from 'three';
import { DAMAGE, MORTAR_FX, SURF } from '../config';
import type { WakeMap } from '../ocean/wakeMap';
import type { Waves } from '../ocean/waves';
import type { Ship } from '../ship/ship';
import { HullFootprints } from './hullFootprints';
import { COLORS, rand, reset } from './particleKit';
import { ParticleSystem } from './particles';
import { SeaSpray } from './seaSpray';
import { ShellFx } from './shellFx';

/** Réglages des embruns d'étrave (le sillage, lui, est dessiné par le shader de l'eau : voir ocean/wakeMap.ts). */
const SPRAY = {
  /**
   * Point d'où partent les embruns : tout à l'avant, contre l'étrave (fraction de la demi-longueur),
   * juste hors du bordé (fraction de la demi-largeur, plus un petit jeu en mètres).
   */
  bowAhead: 0.96,
  bowOut: 0.35,
  bowGap: 0.15,
  /** Vitesse des gouttes vers l'avant, en fraction de celle du bateau : presque autant, sinon la coque les rattrape. */
  sprayForward: [0.85, 1] as const,
  /** Vitesse au-dessus de laquelle les embruns jaillissent (m/s), et gouttes par mètre parcouru au-delà. */
  sprayMinSpeed: 3,
  sprayRate: 2.2,
};

/** Accumulateurs d'un bateau. `order` : ordre (propre au bateau) dans lequel ses foyers s'allument. */
interface ShipTimers {
  bow: number;
  sink: number;
  order: number[];
  smoke: number[];
  flame: number[];
}

function createTimers(spots: number): ShipTimers {
  const order = Array.from({ length: spots }, (_, i) => i);
  for (let i = spots - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { bow: 0, sink: 0, order, smoke: new Array(spots).fill(0), flame: new Array(spots).fill(0) };
}

const spot = new THREE.Vector3();
/** Tous les effets visuels du jeu : tirs, impacts, gerbes d'eau, fumée, sillage, naufrage, butin. */
export class Effects {
  /** Particules éclairées (fumée, bois, eau). */
  private readonly lit = new ParticleSystem(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), 2500);
  /** Particules lumineuses, non éclairées (flammes, flash, étincelles). */
  private readonly glow = new ParticleSystem(new THREE.MeshBasicMaterial(), 500);
  /** Accumulateurs d'émission continue (embruns, foyers, naufrage) par bateau. */
  private readonly timers = new WeakMap<Ship, ShipTimers>();
  private readonly hulls = new HullFootprints();
  private readonly sea = new SeaSpray(this.lit);
  private readonly shells: ShellFx;

  constructor(
    scene: THREE.Scene,
    private readonly wakes: WakeMap,
  ) {
    scene.add(this.lit.mesh, this.glow.mesh);
    this.shells = new ShellFx(this.lit, this.glow, wakes);
  }

  /**
   * Fait vivre les particules, et retire celles qui entrent dans un bateau : l'écume posée sur l'eau dès qu'elle
   * est sous la coque, les gouttes et éclats dès qu'ils traversent le bordé. Plus rien ne « passe à travers ».
   */
  update(dt: number, waves: Waves, ships: readonly Ship[]) {
    this.hulls.update(ships);
    this.lit.update(dt, waves, this.hulls.test);
    this.glow.update(dt, waves);
  }

  /** Départ du coup : flash orangé et bouffée de fumée projetée dans l'axe du canon. */
  muzzleFlash(p: THREE.Vector3, dirX: number, dirZ: number) {
    for (let i = 0; i < 7; i++) {
      const s = reset(p.x, p.y, p.z, i < 3 ? COLORS.flash : COLORS.fire);
      const v = rand(6, 14);
      Object.assign(s, { vx: dirX * v + rand(-2, 2), vy: rand(-1, 2), vz: dirZ * v + rand(-2, 2), life: rand(0.12, 0.22), size: rand(0.25, 0.4), sizeEnd: 0.1, drag: 4 });
      this.glow.spawn(s);
    }
    for (let i = 0; i < 12; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.smoke);
      const v = rand(2, 9);
      Object.assign(s, { vx: dirX * v + rand(-1, 1), vy: rand(0.3, 1.5), vz: dirZ * v + rand(-1, 1), life: rand(1.4, 2.4), size: rand(0.25, 0.45), sizeEnd: rand(0.9, 1.5), drag: 2.2, spin: rand(-1, 1) });
      this.lit.spawn(s);
    }
  }

  /** Mortier : départ du coup, traînée de l'obus, explosion où il tombe, colonne d'eau s'il tombe à la mer. */
  mortarLaunch(p: THREE.Vector3) {
    this.shells.launch(p);
  }

  shellTrail(p: THREE.Vector3) {
    this.shells.trail(p);
  }

  shellBlast(p: THREE.Vector3) {
    this.explosion(p, MORTAR_FX.blastScale);
  }

  waterColumn(x: number, y: number, z: number) {
    this.shells.waterColumn(x, y, z);
  }

  /** Fine fumée laissée par un boulet en vol. */
  trail(p: THREE.Vector3) {
    const s = reset(p.x, p.y, p.z, COLORS.smoke);
    Object.assign(s, { vy: 0.3, life: rand(0.5, 0.8), size: 0.12, sizeEnd: 0.3, drag: 1 });
    this.lit.spawn(s);
  }

  /** Boulet qui touche une coque : éclats de bois, étincelles et fumée sombre. */
  impact(p: THREE.Vector3) {
    for (let i = 0; i < 14; i++) {
      const s = reset(p.x, p.y, p.z, i % 2 ? COLORS.wood : COLORS.woodLight);
      Object.assign(s, {
        vx: rand(-5, 5), vy: rand(3, 8), vz: rand(-5, 5), life: rand(1, 1.6), size: rand(0.08, 0.14), sizeEnd: 0.08,
        gravity: 12, drag: 0.4, spin: rand(-12, 12), shapeX: 0.6, shapeY: 0.6, shapeZ: rand(2.5, 4),
      });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 6; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.fire);
      Object.assign(s, { vx: rand(-4, 4), vy: rand(1, 5), vz: rand(-4, 4), life: rand(0.2, 0.4), size: 0.12, sizeEnd: 0.05, gravity: 6 });
      this.glow.spawn(s);
    }
    for (let i = 0; i < 6; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.darkSmoke);
      Object.assign(s, { vx: rand(-1, 1), vy: rand(0.8, 2), vz: rand(-1, 1), life: rand(1.2, 2), size: 0.3, sizeEnd: rand(0.9, 1.3), drag: 1.5 });
      this.lit.spawn(s);
    }
  }

  /**
   * Boulet dans le gréement : des lambeaux de toile qui voltigent et retombent en tournoyant, et quelques petits
   * éclats de bois (vergue, cordage) ; ni flash ni fumée, ce n'est pas la coque qui éclate.
   */
  riggingHit(p: THREE.Vector3) {
    for (let i = 0; i < 9; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.canvas);
      Object.assign(s, {
        vx: rand(-3, 3), vy: rand(0.5, 3), vz: rand(-3, 3), life: rand(1.6, 2.6), size: rand(0.18, 0.32), sizeEnd: 0.12,
        gravity: 3, drag: 1.6, spin: rand(-6, 6), shapeX: 1.4, shapeY: 0.15, shapeZ: 1,
      });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 4; i++) {
      const s = reset(p.x, p.y, p.z, i % 2 ? COLORS.wood : COLORS.woodLight);
      Object.assign(s, {
        vx: rand(-3, 3), vy: rand(1, 4), vz: rand(-3, 3), life: rand(0.8, 1.2), size: rand(0.05, 0.09), sizeEnd: 0.05,
        gravity: 12, drag: 0.4, spin: rand(-12, 12), shapeX: 0.6, shapeY: 0.6, shapeZ: rand(2, 3),
      });
      this.lit.spawn(s);
    }
  }

  /** Boulet qui tombe à l'eau : colonne d'eau, gouttes retombantes, anneau d'écume, et sa trace sur l'eau. */
  splash(x: number, y: number, z: number) {
    this.wakes.splash(x, z);
    for (let i = 0; i < 16; i++) {
      const s = reset(x, y, z, COLORS.water);
      Object.assign(s, { vx: rand(-1.5, 1.5), vy: rand(5, 11), vz: rand(-1.5, 1.5), life: rand(0.9, 1.4), size: rand(0.15, 0.3), sizeEnd: 0.12, gravity: 14, drag: 0.3, water: true });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = reset(x, y, z, COLORS.foam);
      Object.assign(s, { vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, life: rand(1.5, 2.2), size: 0.35, sizeEnd: 0.8, drag: 1.5, shapeY: 0.15, onWater: true, water: true });
      this.lit.spawn(s);
    }
  }

  /** Boulet qui s'écrase sur l'île : mottes de terre et nuage de poussière. */
  groundHit(p: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      const s = reset(p.x, p.y, p.z, COLORS.earth);
      Object.assign(s, { vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3), life: rand(0.8, 1.2), size: rand(0.12, 0.2), sizeEnd: 0.08, gravity: 12, spin: rand(-8, 8) });
      this.lit.spawn(s);
    }
    for (let i = 0; i < 8; i++) {
      const s = reset(p.x, p.y + 0.3, p.z, COLORS.dust);
      Object.assign(s, { vx: rand(-1.2, 1.2), vy: rand(0.5, 1.5), vz: rand(-1.2, 1.2), life: rand(1.2, 2), size: 0.4, sizeEnd: rand(1.2, 1.8), drag: 1.5 });
      this.lit.spawn(s);
    }
  }

  /** Explosion (réserve de poudre, naufrage d'un boss) : éclair, boule de feu, éclats projetés et colonne de fumée noire. */
  explosion(p: THREE.Vector3, scale = 1) {
    for (let i = 0; i < 4; i++) {
      const s = reset(p.x, p.y + 1, p.z, COLORS.gold);
      Object.assign(s, { vx: rand(-1, 1), vy: rand(0, 2), vz: rand(-1, 1), life: rand(0.3, 0.45), size: 2.6 * scale, sizeEnd: 0.6 * scale });
      this.glow.spawn(s);
    }
    for (let i = 0; i < 40; i++) {
      const s = reset(p.x, p.y + 0.8, p.z, i % 3 ? COLORS.fire : COLORS.gold);
      Object.assign(s, {
        vx: rand(-7, 7) * scale, vy: rand(2, 10) * scale, vz: rand(-7, 7) * scale, life: rand(0.6, 1.2),
        size: rand(0.7, 1.2) * scale, sizeEnd: 0.15, gravity: 4, drag: 1.4,
      });
      this.glow.spawn(s);
    }
    this.impact(p);
    this.impact(p);
    for (let i = 0; i < 16; i++) {
      const s = reset(p.x + rand(-1, 1) * scale, p.y + 1.5, p.z + rand(-1, 1) * scale, COLORS.darkSmoke);
      Object.assign(s, { vx: rand(-1.2, 1.2), vy: rand(2.5, 5.5), vz: rand(-1.2, 1.2), life: rand(3, 5), size: rand(1, 1.6) * scale, sizeEnd: rand(3.5, 5) * scale, drag: 0.9 });
      this.lit.spawn(s);
    }
  }

  /** Flammes d'un incendie à bord en `p` : flammèches qui montent, parfois une bouffée de fumée noire. */
  flame(p: THREE.Vector3) {
    const f = reset(p.x + rand(-0.3, 0.3), p.y + 0.1, p.z + rand(-0.3, 0.3), Math.random() < 0.3 ? COLORS.gold : COLORS.fire);
    Object.assign(f, { vx: rand(-0.4, 0.4), vy: rand(1.5, 3), vz: rand(-0.4, 0.4), life: rand(0.4, 0.7), size: rand(0.3, 0.5), sizeEnd: 0.05 });
    this.glow.spawn(f);
  }

  /** Braise d'un incendie : une étincelle qui monte haut en tourbillonnant. */
  ember(p: THREE.Vector3) {
    const s = reset(p.x + rand(-0.4, 0.4), p.y + 0.3, p.z + rand(-0.4, 0.4), COLORS.gold);
    Object.assign(s, { vx: rand(-1, 1), vy: rand(3, 6), vz: rand(-1, 1), life: rand(1, 1.8), size: 0.09, sizeEnd: 0.02, drag: 0.6 });
    this.glow.spawn(s);
  }

  /** Grosse bouffée de fumée noire qui monte haut (panache d'un incendie, colonne d'une explosion) ; `scale` = taille. */
  plume(p: THREE.Vector3, scale = 1) {
    const s = reset(p.x + rand(-0.4, 0.4) * scale, p.y + 0.5, p.z + rand(-0.4, 0.4) * scale, COLORS.darkSmoke);
    Object.assign(s, { vx: rand(-0.5, 0.5), vy: rand(2.2, 3.4) * scale, vz: rand(-0.5, 0.5), life: rand(2.5, 3.5), size: rand(0.35, 0.6) * scale, sizeEnd: rand(1.4, 2) * scale, drag: 0.4, spin: rand(-0.4, 0.4) });
    this.lit.spawn(s);
  }

  /** Bouffée de fumée (incendie, gouvernail brisé) en `p`. */
  puff(p: THREE.Vector3, dark: boolean) {
    const s = reset(p.x + rand(-0.2, 0.2), p.y + 0.2, p.z + rand(-0.2, 0.2), dark ? COLORS.darkSmoke : COLORS.smoke);
    Object.assign(s, { vx: rand(-0.3, 0.3), vy: rand(1.5, 2.6), vz: rand(-0.3, 0.3), life: rand(1.6, 2.4), size: rand(0.5, 0.8), sizeEnd: 0.1, drag: 0.3, spin: rand(-0.5, 0.5) });
    this.lit.spawn(s);
  }

  /** Coup fatal : grosse gerbe d'éclats et de fumée. */
  wreck(p: THREE.Vector3) {
    for (let i = 0; i < 3; i++) this.impact(p);
    this.splash(p.x, p.y, p.z);
  }

  /** Ramassage de butin : pluie d'étincelles (dorées pour l'or, claires pour le bois). */
  sparkle(p: THREE.Vector3, kind: 'gold' | 'wood' = 'gold') {
    for (let i = 0; i < 14; i++) {
      const s = reset(p.x, p.y + 0.5, p.z, kind === 'gold' ? COLORS.gold : COLORS.sawdust);
      Object.assign(s, { vx: rand(-2, 2), vy: rand(2, 5), vz: rand(-2, 2), life: rand(0.5, 0.9), size: 0.12, sizeEnd: 0.05, gravity: 5 });
      this.glow.spawn(s);
    }
  }

  /** Grosse tempête : paquet de mer sur l'étrave (`fx, fz` : direction de la proue). */
  seaWash(p: THREE.Vector3, fx: number, fz: number, width: number) {
    this.sea.wash(p, fx, fz, width);
  }

  /** Effets continus d'un bateau : embruns, fumée et flammes s'il est abîmé, bulles s'il coule. */
  shipAmbient(dt: number, ship: Ship, waves: Waves) {
    let t = this.timers.get(ship);
    if (!t) this.timers.set(ship, (t = createTimers(ship.model.fireSpots.length)));
    const p = ship.position;
    const fx = Math.sin(ship.heading);
    const fz = Math.cos(ship.heading);
    const half = ship.stats.length / 2;

    // Embruns d'étrave : l'étrave fend l'eau, des gouttes jaillissent de part et d'autre de sa pointe,
    // projetées vers l'extérieur et vers l'avant (pour ne pas retomber dans la coque qui avance).
    const bowAhead = half * SPRAY.bowAhead;
    const bowOut = (ship.stats.width / 2) * SPRAY.bowOut + SPRAY.bowGap;
    // En glisse sur la pente d'une vague, l'étrave en jette bien plus, et plus haut.
    const surf = ship.surfAmount;
    t.bow += dt * Math.max(0, ship.speed - SPRAY.sprayMinSpeed) * SPRAY.sprayRate * (1 + SURF.spray * surf);
    while (t.bow >= 1) {
      t.bow -= 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      // Vers l'extérieur : bâbord = (fz, -fx), tribord = l'opposé.
      const ox = fz * side;
      const oz = -fx * side;
      const ahead = bowAhead - rand(0, 0.25);
      const x = p.x + fx * ahead + ox * bowOut;
      const z = p.z + fz * ahead + oz * bowOut;
      const out = rand(2.2, 3.5) + ship.speed * 0.15;
      const forward = ship.speed * rand(SPRAY.sprayForward[0], SPRAY.sprayForward[1]);
      const d = reset(x, waves.heightAt(x, z) + 0.05, z, COLORS.water);
      Object.assign(d, {
        vx: ox * out + fx * forward, vy: rand(1.5, 3) + ship.speed * 0.08 + SURF.sprayLift * surf, vz: oz * out + fz * forward,
        life: rand(0.6, 0.9), size: rand(0.1, 0.18), sizeEnd: 0.05, gravity: 9, drag: 0.4, water: true,
      });
      this.lit.spawn(d);
    }

    this.damageFires(dt, ship, t);

    if (!ship.alive) {
      // Naufrage : bouillonnement d'écume autour de la coque.
      t.sink += dt * 25;
      while (t.sink >= 1) {
        t.sink -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = rand(1, 3.5);
        const s = reset(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r, COLORS.foam);
        Object.assign(s, { vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, life: rand(1.2, 2), size: 0.3, sizeEnd: 0.8, shapeY: 0.15, onWater: true, water: true });
        this.lit.spawn(s);
      }
    }
  }

  /**
   * Foyers d'incendie : un de plus tous les DAMAGE.fireStep de vie perdue, aux endroits prévus par le modèle
   * (ponts, brèches du bordé), dans un ordre propre à chaque bateau. Chacun fume, puis prend feu plus tard.
   */
  private damageFires(dt: number, ship: Ship, t: ShipTimers) {
    const spots = ship.model.fireSpots;
    const damage = ship.damageLevel;
    if (!ship.alive || damage < DAMAGE.firstFire) return;
    ship.model.root.updateMatrixWorld();
    for (let k = 0; k < spots.length; k++) {
      const start = DAMAGE.firstFire + k * DAMAGE.fireStep;
      if (damage < start) break;
      const i = t.order[k];
      const burning = damage >= start + DAMAGE.ignite;
      spot.copy(spots[i]).applyMatrix4(ship.model.root.matrixWorld);
      t.smoke[i] += dt * DAMAGE.smokeRate * (burning ? 1.6 : 1);
      while (t.smoke[i] >= 1) {
        t.smoke[i] -= 1;
        const s = reset(spot.x + rand(-0.2, 0.2), spot.y + 0.2, spot.z + rand(-0.2, 0.2), burning ? COLORS.darkSmoke : COLORS.smoke);
        // Bouffée qui monte vite et se dissipe (rétrécit) : pas de gros blocs qui traînent derrière le bateau.
        Object.assign(s, { vx: rand(-0.3, 0.3), vy: rand(2, 3.2), vz: rand(-0.3, 0.3), life: rand(1.4, 2.2), size: rand(0.45, 0.7), sizeEnd: 0.06, drag: 0.3, spin: rand(-0.5, 0.5) });
        this.lit.spawn(s);
      }
      if (!burning) continue;
      t.flame[i] += dt * DAMAGE.flameRate;
      while (t.flame[i] >= 1) {
        t.flame[i] -= 1;
        const f = reset(spot.x + rand(-0.25, 0.25), spot.y + 0.05, spot.z + rand(-0.25, 0.25), Math.random() < 0.3 ? COLORS.flash : COLORS.fire);
        Object.assign(f, { vx: rand(-0.2, 0.2), vy: rand(1.2, 2.6), vz: rand(-0.2, 0.2), life: rand(0.3, 0.6), size: rand(0.18, 0.35), sizeEnd: 0.04 });
        this.glow.spawn(f);
      }
    }
  }
}
