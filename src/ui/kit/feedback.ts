import { UI_FX } from '../../config';
import { COIN_ICON, WOOD_ICON } from './kit';

/**
 * Effets de retour des menus, joués après un `render` sur les éléments fraîchement dessinés (animations du navigateur,
 * sans boucle de jeu : ils jouent aussi pendant la pause) : pièces qui volent jusqu'au coffre, chiffre qui s'envole,
 * élément qui tremble (refusé) ou qui luit (réussi). Réglages : UI_FX.
 */

const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Quelques pièces (ou bûches) partent de `from` et filent vers `to` en arc, l'une après l'autre. */
export function flyCoins(from: Element, to: Element, kind: 'gold' | 'wood' = 'gold') {
  const a = center(from);
  const b = center(to);
  for (let i = 0; i < UI_FX.coins; i++) {
    const coin = document.createElement('div');
    coin.className = 'kit-flying';
    coin.innerHTML = kind === 'gold' ? COIN_ICON : WOOD_ICON;
    document.body.appendChild(coin);
    const lift = UI_FX.arc * (0.7 + 0.6 * Math.random());
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const anim = coin.animate(
      [
        { transform: `translate(${a.x}px, ${a.y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${a.x + dx * 0.5}px, ${a.y + dy * 0.5 - lift}px) scale(1.15)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${b.x}px, ${b.y}px) scale(0.6)`, opacity: 0.2 },
      ],
      { duration: UI_FX.fly, delay: i * UI_FX.coinGap, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'both' },
    );
    anim.onfinish = () => coin.remove();
  }
  // Le coffre « encaisse » quand la première pièce arrive.
  to.animate([{ transform: 'scale(1)' }, { transform: `scale(${UI_FX.bump})` }, { transform: 'scale(1)' }], { duration: UI_FX.bumpTime, delay: UI_FX.fly * 0.8 });
}

/** Un petit texte (« +86 or », « Niveau 4 ! ») s'élève au-dessus de `el` puis s'efface. */
export function riseText(el: Element, text: string, tone: 'good' | 'bad' | 'info' = 'good') {
  const p = center(el);
  const label = document.createElement('div');
  label.className = `kit-rise ${tone}`;
  label.textContent = text;
  document.body.appendChild(label);
  const anim = label.animate(
    [
      { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(0.8)`, opacity: 0 },
      { transform: `translate(${p.x}px, ${p.y - UI_FX.riseHeight * 0.3}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${p.x}px, ${p.y - UI_FX.riseHeight}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ],
    { duration: UI_FX.rise, easing: 'ease-out', fill: 'both' },
  );
  anim.onfinish = () => label.remove();
}

/** Refus : l'élément tremble (prix trop cher, place prise). */
export function shake(el: Element) {
  const d = UI_FX.shakeDistance;
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(-${d}px)` }, { transform: `translateX(${d}px)` }, { transform: `translateX(-${d / 2}px)` }, { transform: 'translateX(0)' }],
    { duration: UI_FX.shake, easing: 'ease-out' },
  );
}

/** Réussite : un halo doré s'élargit autour de l'élément. */
export function glow(el: Element) {
  el.animate([{ boxShadow: '0 0 0 0 rgba(201,162,74,.9)' }, { boxShadow: `0 0 0 ${UI_FX.glowSize}px rgba(201,162,74,0)` }], { duration: UI_FX.glow, easing: 'ease-out' });
}

/** Les barres dessinées à leur ancienne valeur (`data-to`) glissent jusqu'à la nouvelle. */
export function settleBars(root: Element) {
  const bars = root.querySelectorAll<HTMLElement>('[data-to]');
  if (!bars.length) return;
  // Une image plus tard : le navigateur a posé l'ancienne largeur, la transition joue.
  requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach((b) => (b.style.width = b.dataset.to!))));
}
