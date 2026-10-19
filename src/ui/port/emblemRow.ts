import { EMBLEMS, type EmblemId } from '../../config';
import { drawEmblem } from '../../ship/parts/emblemDesigns';
import { costHtml } from '../parchmentMenu';
import type { PortContext } from './portContext';

const IDS = Object.keys(EMBLEMS.designs) as EmblemId[];
const previews = new Map<EmblemId, string>();

/** Aperçu d'un emblème en couleurs (image PNG), dessiné une fois depuis son masque. */
function preview(id: EmblemId): string {
  let url = previews.get(id);
  if (url) return url;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  drawEmblem(g, id);
  const image = g.getImageData(0, 0, 128, 128);
  const { main, second } = EMBLEMS.designs[id];
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [m, s] = [rgb(main), rgb(second)];
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const gr = d[i + 1] / 255;
    const a = Math.max(r, gr);
    // Fond de toile, puis la seconde couleur, puis la principale par-dessus (comme le shader des voiles).
    const mix = (k: number) => Math.round((232 * (1 - gr) + s[k] * gr) * (1 - r) + m[k] * r);
    d[i] = mix(0);
    d[i + 1] = mix(1);
    d[i + 2] = mix(2);
    d[i + 3] = a > 0 ? 255 : 0;
  }
  g.putImageData(image, 0, 0);
  url = canvas.toDataURL();
  previews.set(id, url);
  return url;
}

/**
 * Emblème de la grande voile du bateau piloté : les dessins au choix, celui en place, le prix d'un nouveau (un emblème
 * déjà payé pour ce navire se remet gratuitement). Il passe et s'écaille avec l'ancienneté du navire.
 */
export function emblemRow(ctx: PortContext): string {
  const member = ctx.fleet.controlled;
  const price = EMBLEMS.price;
  const cards = IDS.map((id) => {
    const owned = member.ownedEmblems.has(id);
    const on = member.emblem === id;
    const disabled = !owned && ctx.state.gold < price ? ' disabled' : '';
    const action = on
      ? '<span class="done">En place</span>'
      : owned
        ? `<button class="secondary" data-action="emblem" data-arg="${id}">Repeindre</button>`
        : `<div class="cost">${costHtml(price, 0, ctx.state.gold)}</div><button data-action="emblem" data-arg="${id}"${disabled}>Peindre</button>`;
    return `<div class="gun-choice emblem-choice${on ? ' on' : ''}"><img src="${preview(id)}" alt=""><b>${EMBLEMS.designs[id].name}</b><div class="buy">${action}</div></div>`;
  }).join('');
  const clear = member.emblem ? '<button class="secondary" data-action="emblem" data-arg="none">Effacer l’emblème</button>' : '';
  return `
    <h3 class="section">Emblème de la grande voile ${clear}</h3>
    <p class="effect">Peint sur la plus grande voile ; il passe et s’écaille avec l’ancienneté du navire.</p>
    <div class="gun-choices emblem-choices">${cards}</div>`;
}
