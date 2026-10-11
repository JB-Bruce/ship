import { GRAPHICS } from '../config';

/** Requêtes de temps GPU gardées en attente au plus (leurs résultats arrivent quelques images plus tard). */
const MAX_PENDING = 8;

/**
 * Résolution dynamique : mesure le temps GPU du rendu de chaque image (requêtes de temps WebGL ; à défaut, l'intervalle
 * entre deux images) et revoit régulièrement l'échelle de rendu pour tenir le budget d'une image. Elle baisse vite
 * quand une image traîne, et ne remonte que si la marge dure.
 */
export class DynamicResolution {
  /** Échelle de rendu (GRAPHICS.dynamic.minScale..1), appliquée à la résolution choisie. */
  scale = 1;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  /** Temps mesurés depuis la dernière revue (ms). */
  private samples: number[] = [];
  private timer = 0;
  /** Revues de suite avec beaucoup de marge. */
  private calm = 0;
  /** Mesures attendues à ignorer (prises pendant que le jeu était caché). */
  private ignore = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  /** Juste avant le rendu principal. */
  begin() {
    if (!this.ext || this.active || this.pending.length >= MAX_PENDING) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }

  /** Juste après le rendu principal : relève les mesures arrivées. */
  end() {
    const gl = this.gl;
    if (this.ext && this.active) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      const valid = !gl.getParameter(this.ext!.GPU_DISJOINT_EXT) && this.ignore === 0;
      if (this.ignore > 0) this.ignore--;
      if (valid) this.samples.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
  }

  /**
   * `elapsed` : temps écoulé depuis l'image précédente (s), `budget` : durée visée d'une image (ms).
   * Renvoie true si l'échelle vient de changer.
   */
  update(elapsed: number, budget: number): boolean {
    const d = GRAPHICS.dynamic;
    // Sans requêtes de temps GPU : l'intervalle entre deux images en tient lieu.
    if (!this.ext && elapsed > 0) this.samples.push(elapsed * 1000 * 0.85);
    this.timer += elapsed;
    if (this.timer < d.interval || !this.samples.length) return false;
    this.timer = 0;
    const sorted = this.samples.sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length * 0.75)];
    this.samples = [];
    let next = this.scale;
    if (typical > budget * d.high) {
      // Trop lent : on baisse d'autant qu'il le faut (le coût suit à peu près le nombre de pixels, l'échelle au carré),
      // d'au moins un pas.
      const wanted = this.scale * Math.max(0.8, Math.sqrt((budget * d.high) / typical));
      next = Math.min(this.scale - d.step, Math.floor(wanted / d.step) * d.step);
      this.calm = 0;
    } else if (typical < budget * d.low && ++this.calm >= d.calmChecks) {
      next = this.scale + d.step;
      this.calm = 0;
    }
    next = Math.min(1, Math.max(d.minScale, Math.round(next / d.step) * d.step));
    if (next === this.scale) return false;
    this.scale = next;
    return true;
  }

  /** Oublie les mesures en cours (le jeu était caché : elles sont faussées). Celles encore attendues seront ignorées. */
  forget() {
    this.samples = [];
    this.timer = 0;
    this.calm = 0;
    this.ignore = this.pending.length + (this.active ? 1 : 0);
  }

  dispose() {
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
  }
}
