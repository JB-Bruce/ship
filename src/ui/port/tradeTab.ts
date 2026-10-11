import type { IslandId } from '../../config';
import { fleetHold, fleetStock } from '../../fleet/holds';
import { GOOD_NAMES } from '../../progression/goods';
import { islandInSentence, resourcesHtml, type PortContext, type TradeGood } from './portContext';

const TRADE_GOODS: readonly TradeGood[] = ['wood', 'fish', 'rum', 'spices'];
const NAMES: Record<TradeGood, string> = { wood: 'Bois', fish: 'Poisson', rum: 'Rhum', spices: 'Épices' };
/** Ce qu'on dit de chaque marchandise sur le marché de chaque île. */
const NOTES: Record<IslandId, Record<TradeGood, string>> = {
  tortuga: {
    wood: 'Réserve commune : sert aux navires et aux améliorations.',
    fish: 'Pêché par tes chaloupes et tes sloops.',
    rum: 'Produit sur l’île. Port-Sabre le paie bien plus cher.',
    spices: 'Venues de Port-Sabre, ou des cales des navires coulés.',
  },
  sabre: {
    wood: 'Rare sur ce rocher : cher à l’achat, bien payé à la vente.',
    fish: 'Pêché par tes chaloupes et tes sloops.',
    rum: 'Les Frères du Sabre en raffolent. Achète-le à la Tortue.',
    spices: 'Écoulées par les contrebandiers. La Tortue les rachète plus cher.',
  },
};

/** Onglet Commerce : le bois (réserve commune) et les marchandises des cales, aux prix de l'île. */
export function tradeTab(ctx: PortContext): string {
  const hold = fleetHold(ctx.fleet.hand);
  const free = hold.capacity - hold.used;
  return `
    <p class="subtitle">Le marché de ${islandInSentence(ctx)}. Les marchandises voyagent dans les cales de ta flotte (${free} places libres).</p>
    ${resourcesHtml(ctx)}
    <div class="trade-table">
      <div class="trade-row head"><span>Marchandise</span><span>Tu as</span><span>Achat</span><span>Vente</span><span></span></div>
      ${TRADE_GOODS.map((g) => row(ctx, g, free)).join('')}
    </div>`;
}

function row(ctx: PortContext, good: TradeGood, free: number): string {
  const price = ctx.island.price(good);
  const have = good === 'wood' ? ctx.state.wood : fleetStock(ctx.fleet.hand, good);
  const room = good === 'wood' ? Infinity : free;
  const canBuy = price.buy !== null && ctx.state.gold >= price.buy && room > 0;
  const canSell = price.sell !== null && have > 0;
  const button = (side: 'buy' | 'sell', amount: number, label: string, enabled: boolean) =>
    `<button class="${side === 'sell' ? 'secondary ' : ''}small" data-action="${side}" data-arg="${good}:${amount}"${enabled ? '' : ' disabled'}>${label}</button>`;
  const buys = price.buy === null ? '' : [button('buy', 1, 'Acheter 1', canBuy), button('buy', 10, '10', canBuy)].join('');
  const sells = price.sell === null ? '' : [button('sell', 1, 'Vendre 1', canSell), button('sell', Infinity, 'Tout', canSell)].join('');
  const unit = good === 'wood' ? 'bois' : GOOD_NAMES[good].one;
  return `
    <div class="trade-row">
      <span><b>${NAMES[good]}</b><small>${NOTES[ctx.island.id][good]}</small></span>
      <span>${have}</span>
      <span>${price.buy === null ? '—' : `${price.buy} or`}</span>
      <span>${price.sell === null ? '—' : `${price.sell} or`}</span>
      <span class="trade-buttons" title="Prix pour 1 ${unit}">${buys}${sells}</span>
    </div>`;
}
