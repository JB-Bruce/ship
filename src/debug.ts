import GUI from 'lil-gui';
import type { Waves } from './ocean/waves';
import type { Ship } from './ship/ship';

/**
 * Panneau de réglages en direct, activé en ajoutant `?debug` à l'URL.
 * Renvoie une fonction à appeler chaque image (compteur d'images par seconde).
 */
export function setupDebug(waves: Waves, ship: Ship): (dt: number) => void {
  const gui = new GUI({ title: 'Réglages (debug)' });
  const stats = { fps: 0 };
  gui.add(stats, 'fps').name('Images/s').listen().disable();

  const ocean = gui.addFolder('Vagues (somme des raideurs < 1)');
  waves.list.forEach((wave, i) => {
    const folder = ocean.addFolder(`Vague ${i + 1}`).close();
    folder.add(wave, 'steepness', 0, 0.4, 0.01).name('Raideur');
    folder.add(wave, 'wavelength', 4, 150, 1).name('Longueur (m)');
  });

  const s = gui.addFolder('Bateau');
  s.add(ship.stats, 'maxSpeed', 2, 30, 0.5).name('Vitesse max (m/s)');
  s.add(ship.stats, 'acceleration', 0.2, 10, 0.1).name('Accélération');
  s.add(ship.stats, 'deceleration', 0.2, 10, 0.1).name('Décélération');
  s.add(ship.stats, 'turnRate', 0.05, 1.5, 0.01).name('Rotation (rad/s)');
  s.add(ship.stats, 'turnHeel', 0, 0.06, 0.001).name('Gîte en virage');

  let frames = 0;
  let elapsed = 0;
  return (dt) => {
    frames++;
    elapsed += dt;
    if (elapsed >= 0.5) {
      stats.fps = Math.round(frames / elapsed);
      frames = 0;
      elapsed = 0;
    }
  };
}
