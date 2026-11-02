/** Ton d'un petit message : neutre, gain (doré) ou danger (rouge). */
export type ToastTone = 'info' | 'good' | 'danger';

/** Petits messages affichés au plus en même temps (le plus ancien s'efface quand un nouveau arrive), et fondu final (s). */
const MAX_TOASTS = 3;
const FADE_TIME = 0.5;

/**
 * Petits messages d'information en haut de l'écran (achats, pêche, barre, cale pleine…), empilés et effacés seuls. Les
 * alertes et les moments forts (boss, « Voile à l'horizon ! », naufrage) gardent le grand bandeau central.
 */
export class Toasts {
  private readonly root: HTMLElement;
  private readonly items: { el: HTMLElement; time: number }[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-toasts';
    parent.appendChild(this.root);
  }

  show(text: string, seconds: number, tone: ToastTone) {
    // Le même message déjà affiché est simplement prolongé.
    const same = this.items.find((i) => i.el.textContent === text);
    if (same) {
      same.time = Math.max(same.time, seconds);
      same.el.classList.remove('out');
      return;
    }
    const el = document.createElement('div');
    el.className = `hud-toast ${tone}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.items.push({ el, time: seconds });
    const live = this.items.filter((i) => i.time > FADE_TIME);
    if (live.length > MAX_TOASTS) live[0].time = FADE_TIME;
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.time -= dt;
      if (item.time <= FADE_TIME) item.el.classList.add('out');
      if (item.time > 0) continue;
      item.el.remove();
      this.items.splice(i, 1);
    }
  }
}
