import { MARKET, type IslandId, type TradeGood } from '../../config';
import { capacityOf, fleetHold, fleetStock } from '../../fleet/holds';
import { cargoTotal, GOODS, type Cargo } from '../../progression/goods';
import { COIN_ICON, tip } from '../kit/kit';
import { knownPorts, portLabel, type MarketContext } from './marketContext';

/** Les caisses de l'étal, dans l'ordre : le bois (réserve commune) puis les marchandises des cales. */
export const STALL: readonly TradeGood[] = ['wood', 'fish', 'rum', 'spices'];
export const GOOD_LABELS: Record<TradeGood, string> = { wood: 'Bois', fish: 'Poisson', rum: 'Rhum', spices: 'Épices' };

/** Ce qu'on dit de chaque marchandise sur le marché de chaque île (bulle de son nom). */
const NOTES: Record<IslandId, Record<TradeGood, string>> = {
  tortuga: {
    wood: 'Réserve commune : sert aux navires et aux améliorations.',
    fish: 'Pêché par tes chaloupes et tes autres navires de pêche.',
    rum: 'Produit sur l’île. Port-Sabre le paie bien plus cher.',
    spices: 'Venues de Port-Sabre, ou des cales des navires coulés.',
  },
  sabre: {
    wood: 'Rare sur ce rocher : cher à l’achat, bien payé à la vente.',
    fish: 'Pêché par tes chaloupes et tes autres navires de pêche.',
    rum: 'Les Frères du Sabre en raffolent. Achète-le à la Tortue.',
    spices: 'Écoulées par les contrebandiers. La Tortue les rachète plus cher.',
  },
  dauphin: {
    wood: 'Les bois de l’île ne coûtent presque rien.',
    fish: 'Pêché par les gens du Dauphin : le moins cher de l’archipel. Port-Royal le paie bien.',
    rum: 'Les pêcheurs en manquent. Achète-le à la Tortue.',
    spices: 'Rares ici : la Marine les rachète correctement.',
  },
  royale: {
    wood: 'Les forêts de l’île en regorgent : le bois le moins cher de l’archipel.',
    fish: 'La garnison et l’arsenal en consomment beaucoup.',
    rum: 'Les marins du roi le paient cher. Achète-le à la Tortue.',
    spices: 'Les officiers de la Marine en raffolent : le meilleur prix de l’archipel.',
  },
};

/** Couleur de chaque marchandise : dessus de sa caisse et part de la cale. */
const TINTS: Record<TradeGood, string> = { wood: '#a8743c', fish: '#2d7f9a', rum: '#9a3f1c', spices: '#e0782c' };
/** Ce qui dépasse de chaque caisse (repère 120 × 84, la caisse occupe le bas). */
const TOPS: Record<TradeGood, string> = {
  wood: 'M16 11h40a4.5 4.5 0 0 1 0 9h-40zM60 11h40a4.5 4.5 0 0 1 0 9h-40zM36 2h44a4.5 4.5 0 0 1 0 9h-44z',
  fish: 'M20 8C40 0 60 16 50 20C40 24 26 18 20 8ZM60 12C80 4 100 18 90 20C80 22 66 18 60 12Z',
  rum: 'M30 3h22l4 17H26zM64 3h22l4 17H60z',
  spices: 'M26 20C30 5 50 5 54 20ZM64 20C68 8 86 8 90 20Z',
};
const CRATE = 'M10 20h100v60H10zM10 40h100M10 60h100M10 20l100 60M110 20L10 80';

/** Ce qu'on a de cette marchandise : le bois de la réserve, ou ce que portent les cales de la flotte. */
export function stockOf(ctx: MarketContext, good: TradeGood): number {
  return good === 'wood' ? ctx.state.wood : fleetStock(ctx.fleet.hand, good);
}

/** L'étal : une caisse par marchandise, ses prix, ce qu'on en a, et les boutons d'achat et de vente. */
export function stallHtml(ctx: MarketContext): string {
  const hold = fleetHold(ctx.fleet.hand);
  return STALL.map((g) => crate(ctx, g, hold.capacity - hold.used)).join('');
}

function crate(ctx: MarketContext, good: TradeGood, free: number): string {
  const price = ctx.island.price(good);
  const have = stockOf(ctx, good);
  const roomless = good !== 'wood' && free <= 0;
  const button = (side: 'buy' | 'sell', amount: number, label: string, dim: boolean) =>
    `<button class="kit-btn small${side === 'sell' ? ' red' : ''}${dim ? ' dim' : ''}" data-action="${side}" data-arg="${good}:${amount}">${label}</button>`;
  const buyDim = price.buy === null || ctx.state.gold < price.buy || roomless;
  const buys =
    price.buy === null
      ? '<span class="mk-none">Ne s’achète pas ici</span>'
      : `<span class="mk-verb">Acheter</span>${button('buy', 1, '1', buyDim)}${button('buy', MARKET.bulk, `${MARKET.bulk}`, buyDim)}${good === 'wood' ? button('buy', MARKET.woodBulk, `${MARKET.woodBulk}`, buyDim) : button('buy', Infinity, 'Plein', buyDim)}`;
  const sells =
    price.sell === null
      ? '<span class="mk-none">Ne se vend pas ici</span>'
      : `<span class="mk-verb">Vendre</span>${button('sell', 1, '1', have <= 0)}${button('sell', MARKET.bulk, `${MARKET.bulk}`, have <= 0)}${button('sell', Infinity, 'Tout', have <= 0)}`;
  const amount = (n: number | null) => (n === null ? '—' : `${COIN_ICON}${n}`);
  return `
    <div class="mk-crate" data-crate="${good}">
      <svg class="mk-art" viewBox="0 0 120 84" aria-hidden="true"><path class="mk-box" d="${CRATE}"/><path d="${TOPS[good]}" fill="${TINTS[good]}"/></svg>
      <b class="mk-name"${tip(NOTES[ctx.island.id][good])}>${GOOD_LABELS[good]}</b>
      <span class="mk-have">${good === 'wood' ? 'En réserve' : 'Dans tes cales'} : <b>${have}</b></span>
      <div class="mk-prices"><span>Achat <b>${amount(price.buy)}</b></span><span>Vente <b>${amount(price.sell)}</b></span></div>
      ${hint(ctx, good, price.sell)}
      <div class="mk-row">${buys}</div>
      <div class="mk-row">${sells}</div>
    </div>`;
}

/** Où cette marchandise se vend le mieux parmi les ports découverts (ou ici). */
function hint(ctx: MarketContext, good: TradeGood, sell: number | null): string {
  let best: { id: IslandId; price: number } | null = null;
  for (const i of knownPorts(ctx)) {
    const p = ctx.priceAt(i.id, good).sell;
    if (p !== null && (!best || p > best.price)) best = { id: i.id, price: p };
  }
  if (best && (sell === null || best.price > sell))
    return `<span class="mk-hint up"${tip('Meilleure vente parmi les ports que tu connais')}>${portLabel(best.id)} paie ${COIN_ICON}${best.price}</span>`;
  if (sell !== null && best) return `<span class="mk-hint best">Le meilleur prix connu</span>`;
  return '<span class="mk-hint"></span>';
}

/** Ce que portait chaque navire avant un achat ou une vente : les parts de cale glissent ensuite jusqu'au nouveau. */
export type HoldSnapshot = Map<number, Cargo>;

export function holdSnapshot(ctx: MarketContext): HoldSnapshot {
  return new Map(ctx.fleet.hand.map((m) => [m.id, { ...m.cargo }]));
}

/** Les cales de la flotte : une barre par navire, une part de couleur par marchandise. */
export function holdsHtml(ctx: MarketContext, before: HoldSnapshot | null): string {
  const rows = ctx.fleet.hand.map((m) => {
    const capacity = Math.max(1, capacityOf(m));
    const was = before?.get(m.id);
    const share = (n: number) => `${((100 * n) / capacity).toFixed(1)}%`;
    const parts = GOODS.map((g) => {
      const now = share(m.cargo[g]);
      const style = `background:${TINTS[g]};width:${was ? share(was[g]) : now}`;
      return `<span class="mk-part" style="${style}"${was ? ` data-to="${now}"` : ''}></span>`;
    }).join('');
    return `<div class="mk-hold"><span class="mk-hold-name">${m.name}</span><span class="mk-hold-bar">${parts}</span><span class="mk-hold-text">${cargoTotal(m.cargo)} / ${capacityOf(m)}</span></div>`;
  });
  const legend = GOODS.map((g) => `<span><i style="background:${TINTS[g]}"></i>${GOOD_LABELS[g].toLowerCase()}</span>`).join('');
  return `${rows.join('')}<div class="mk-legend">${legend}</div>`;
}
