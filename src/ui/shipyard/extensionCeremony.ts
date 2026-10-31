import { EXTENSION_FX } from '../../config';
import { sound } from '../../audio/sound';
import type { FleetMember } from '../../fleet/fleet';
import { extensionUnlocks } from '../extensionInfo';
import { shipIcon } from '../shipIcons';
import type { ExtensionDef } from '../../shipTypeDef';

/**
 * Le moment où le chantier allonge le navire : coups de marteau puis la coque qui craque, copeaux de bois qui jaillissent
 * le long du bordé (là où le navire est à l'écran), et un grand parchemin « Ton navire devient… » avec la nouvelle
 * silhouette, le nouveau nom et ce que l'allongement ouvre. Tout en temps réel : le jeu est en pause au Chantier.
 */
export class ExtensionCeremony {
  private readonly panel: HTMLElement;
  private timer = 0;
  private delay = 0;

  constructor(private readonly parent: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'yard-ceremony';
    this.panel.addEventListener('click', () => this.close());
    parent.appendChild(this.panel);
  }

  /** `m` vient d'être allongé par `ext` ; `before` : son ancien nom ; `hull` : points de la coque à l'écran (px). */
  play(m: FleetMember, ext: ExtensionDef, before: string, hull: readonly { x: number; y: number }[]) {
    for (const at of EXTENSION_FX.hammers) setTimeout(() => sound.play('ui/hammer'), at);
    setTimeout(() => sound.play('ambience/hull_creak'), EXTENSION_FX.creak);
    for (const p of hull) this.chips(p.x, p.y);
    const unlocks = extensionUnlocks(ext).map((u) => `<li>${u}</li>`).join('');
    this.panel.innerHTML = `
      <div class="yard-ceremony-sheet">
        <div class="yard-ceremony-title">⟷ Ton navire devient…</div>
        <div class="yard-ceremony-icon">${shipIcon(m.type, m.levels)}</div>
        <div class="yard-ceremony-name">${ext.name}</div>
        <p class="yard-ceremony-was">${m.name}, hier encore ${before.toLowerCase()}${ext.length > 0 ? `, gagne ${ext.length} m` : ''}.</p>
        ${unlocks ? `<ul class="yard-ceremony-unlocks">${unlocks}</ul>` : ''}
        <p class="yard-ceremony-hint">clic pour fermer</p>
      </div>`;
    this.close();
    this.delay = window.setTimeout(() => {
      this.panel.classList.add('on');
      this.timer = window.setTimeout(() => this.close(), EXTENSION_FX.panel);
    }, EXTENSION_FX.panelDelay);
  }

  close() {
    clearTimeout(this.timer);
    clearTimeout(this.delay);
    this.panel.classList.remove('on');
  }

  /** Copeaux et sciure qui jaillissent de (x, y) et retombent en tournoyant. */
  private chips(x: number, y: number) {
    for (let i = 0; i < EXTENSION_FX.chips; i++) {
      const chip = document.createElement('i');
      chip.className = `yard-chip${i % 3 === 0 ? ' dust' : ''}`;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const d = EXTENSION_FX.chipSpread * (0.4 + Math.random() * 0.6);
      chip.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--spin:${(Math.random() - 0.5) * 900}deg;animation-duration:${EXTENSION_FX.chipTime * (0.7 + Math.random() * 0.5)}ms;animation-delay:${Math.random() * 500}ms`;
      chip.addEventListener('animationend', () => chip.remove());
      this.parent.appendChild(chip);
    }
  }
}
