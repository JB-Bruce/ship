import * as THREE from 'three';
import { CONTRACTS, DAY_NIGHT } from '../config';

const smoothstep = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Heure du jour et course du soleil et de la lune. L'heure suit la journée des contrats (`dayLeft` : temps restant avant
 * la journée suivante, déjà arrêté en pause et sauvegardé) : une journée commence à l'aube (DAY_NIGHT.dawnHour).
 * Rien n'est gardé ici d'une image à l'autre : un chargement remet aussitôt la bonne heure.
 */
export class DayCycle {
  /** Directions vers le soleil et vers la lune (repère du monde, normalisées). */
  readonly sun = new THREE.Vector3(0, 1, 0);
  readonly moon = new THREE.Vector3(0, -1, 0);
  /** Heure (0..24). */
  hour = DAY_NIGHT.dawnHour;
  /** Soleil visible (0 la nuit, 1 de jour), nuit (0 de jour, 1 en pleine nuit), crépuscule ou aube (pic au lever et au coucher). */
  daylight = 1;
  night = 0;
  twilight = 0;
  /** Lune levée (0 sous l'horizon, 1 haute). */
  moonUp = 0;

  /** `dayLeft` / `setDayLeft` : temps restant avant la journée suivante des contrats (s). */
  constructor(
    private readonly dayLeft: () => number,
    private readonly setDayLeft: (seconds: number) => void,
  ) {}

  update() {
    const phase = 1 - Math.min(1, Math.max(0, this.dayLeft() / CONTRACTS.dayLength));
    this.hour = (DAY_NIGHT.dawnHour + 24 * phase) % 24;
    // Angle horaire : 0 à midi. Course inclinée vers le sud (jamais au zénith), relevée (plus de jour que de nuit).
    const a = ((this.hour - 12) / 24) * Math.PI * 2;
    const ct = Math.cos(DAY_NIGHT.tilt);
    const st = Math.sin(DAY_NIGHT.tilt);
    this.sun.set(-Math.sin(a), Math.cos(a) * ct + DAY_NIGHT.lift, Math.cos(a) * st).normalize();
    // La lune, à l'opposé, suit une course plus basse : son reflet trace un chemin sur l'eau.
    const cm = Math.cos(DAY_NIGHT.moonTilt);
    const sm = Math.sin(DAY_NIGHT.moonTilt);
    this.moon.set(Math.sin(a), -Math.cos(a) * cm + DAY_NIGHT.moonLift, -Math.cos(a) * sm).normalize();
    const y = this.sun.y;
    this.daylight = smoothstep(y, -0.04, 0.14);
    this.night = 1 - smoothstep(y, -0.22, 0.0);
    this.twilight = smoothstep(y, -0.22, -0.02) * (1 - smoothstep(y, 0.06, 0.32));
    this.moonUp = smoothstep(this.moon.y, -0.02, 0.15);
  }

  /** Heures écoulées depuis l'aube (0..24). */
  get sinceDawn(): number {
    return (((this.hour - DAY_NIGHT.dawnHour) % 24) + 24) % 24;
  }

  /**
   * Règle l'heure (curseur du menu Échap), sans changer de journée : de l'aube à l'aube suivante, les offres des
   * tavernes restent celles du jour.
   */
  setHour(hour: number) {
    this.setDayLeft(this.dayLeftFor(hour));
    this.update();
  }

  /** Temps restant avant la journée suivante qui donne l'heure `hour`. */
  dayLeftFor(hour: number): number {
    const phase = (((hour - DAY_NIGHT.dawnHour) % 24) + 24) % 24 / 24;
    // Jamais 0 : ce serait la journée suivante (nouvelles offres des tavernes).
    return Math.max(0.5, CONTRACTS.dayLength * (1 - phase));
  }
}
