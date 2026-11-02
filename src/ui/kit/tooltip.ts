import { UI_FX } from '../../config';

/**
 * Bulles d'aide des menus refaits : tout élément qui porte `data-tip` (via `tip()` de kit.ts) montre son texte au survol,
 * dans une bulle posée au-dessus de lui (en dessous s'il n'y a pas la place), dans une couche à part : elle n'est
 * jamais coupée par le bord d'une feuille qui défile. Un seul écouteur pour toute la page.
 */
let bubble: HTMLDivElement | null = null;
let anchor: Element | null = null;

function show(target: Element) {
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'kit-tip';
    document.body.appendChild(bubble);
  }
  anchor = target;
  bubble.textContent = target.getAttribute('data-tip');
  bubble.style.display = 'block';
  const r = target.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const gap = UI_FX.tipGap;
  const above = r.top - b.height - gap;
  const top = above >= gap ? above : r.bottom + gap;
  const left = Math.min(window.innerWidth - b.width - gap, Math.max(gap, r.left + r.width / 2 - b.width / 2));
  bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

export function hideTip() {
  anchor = null;
  if (bubble) bubble.style.display = 'none';
}

document.addEventListener('mouseover', (e) => {
  const target = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
  if (target === anchor) return;
  if (target) show(target);
  else hideTip();
});
// Un clic redessine souvent le menu : la bulle de l'ancien élément s'en va.
document.addEventListener('mousedown', hideTip);
