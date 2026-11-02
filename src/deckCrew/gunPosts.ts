import { DECK_CREW } from '../config';
import type { DeckPlan, DeckSpot } from '../ship/deckPlan';
import type { ShipModel } from '../ship/shipModel';

/**
 * Canons d'un navire vus par son équipage : le poste du canonnier derrière la culasse de chaque pièce servie à
 * découvert, et les tirs (une pièce chargée dont le rechargement repart). Un nouveau tableau de rechargements (canons
 * refaits après une amélioration) n'est pas un tir.
 */
export class GunPosts {
  posts: { cannon: number; spot: DeckSpot }[] = [];
  private postsOf: unknown = null;
  private readonly cooldowns: number[] = [];
  private cooldownsOf: readonly number[] | null = null;

  /** Oublie les postes (pont reconstruit) : ils seront recalculés au prochain `sync`. */
  reset() {
    this.postsOf = null;
  }

  /** Recalcule les postes quand les canons du modèle changent. Renvoie true s'ils ont changé. */
  sync(model: ShipModel, plan: DeckPlan): boolean {
    const key = model.cannons[0]?.object ?? null;
    if (key === this.postsOf) return false;
    this.postsOf = key;
    this.posts = [];
    model.cannons.forEach((mount, cannon) => {
      if (!plan.isOpenGun(mount)) return;
      const p = mount.object.position;
      const side = Math.sign(p.x) || 1;
      this.posts.push({ cannon, spot: { x: p.x - side * DECK_CREW.gunnerOffset, y: p.y, z: p.z, facing: (side * Math.PI) / 2 } });
    });
    return true;
  }

  /** Appelle `onShot` pour chaque pièce qui vient de tirer. */
  detectShots(cooldowns: readonly number[], onShot: (cannon: number) => void) {
    const same = cooldowns === this.cooldownsOf;
    this.cooldownsOf = cooldowns;
    for (let i = 0; i < cooldowns.length; i++) {
      if (same && cooldowns[i] > this.cooldowns[i] + 0.05) onShot(i);
      this.cooldowns[i] = cooldowns[i];
    }
    this.cooldowns.length = cooldowns.length;
  }
}
