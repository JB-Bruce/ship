import { BOSS_IDS, BOSSES } from '../../config';
import { SHIP_TYPES, type ShipType } from '../../shipTypes';
import { resourcesHtml, type PortContext } from './portContext';

const ORDER: readonly ShipType[] = ['rowboat', 'longboat', 'sloop', 'caravel', 'schooner', 'brigantine', 'xebec', 'brig', 'corvette', 'frigate'];

/** Onglet Registre : les exploits de ta flotte depuis le début de la partie, et tes trophées. */
export function ledgerTab(ctx: PortContext): string {
  const l = ctx.ledger;
  const sunk = ORDER.map((t) => `<div><span>${SHIP_TYPES[t].name}</span><b>${l.sunk[t] ?? 0}</b></div>`).join('');
  // Un trophée par boss : son pavillon s'il a été pris, sinon ce qu'en disent les tavernes.
  const trophy = BOSS_IDS.map((id) => {
    const b = BOSSES[id];
    const n = l.bossFlags[id] ?? 0;
    if (!n) return `<div class="trophy unknown"><span class="flag">?</span><div><b>${b.name}</b><p>Les tavernes évoquent ${b.rumor}.</p></div></div>`;
    return `<div class="trophy ${id}"><span class="flag">☠</span><div><b>Pavillon de ${b.name}</b><p>${b.trophy}${n > 1 ? ` (${n} fois)` : ''}.</p></div></div>`;
  }).join('');
  return `
    <p class="subtitle">Le registre de bord de ta flotte.</p>
    ${resourcesHtml(ctx)}
    <h3 class="section">Navires coulés <span class="count">${l.totalSunk}</span></h3>
    <div class="island-facts">${sunk}<div><span>Dont d’élite</span><b>${l.elites}</b></div></div>
    <h3 class="section">Trophées</h3>
    ${trophy}
    <h3 class="section">Navigation</h3>
    <div class="island-facts">
      <div><span>Distance parcourue à la barre</span><b>${(l.distanceSailed / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</b></div>
    </div>
    <h3 class="section">Commerce et campagnes</h3>
    <div class="island-facts">
      <div><span>Or gagné</span><b>${l.goldEarned}</b></div>
      <div><span>Poissons pêchés</span><b>${l.fishCaught}</b></div>
      <div><span>Marchandises vendues</span><b>${l.goodsSold}</b></div>
      <div><span>Bénéfice des routes commerciales</span><b>${l.tradeProfit}</b></div>
      <div><span>Escales de marchands alliés</span><b>${l.merchantVisits}</b></div>
      <div><span>Contrats remplis</span><b>${l.contractsDone}</b></div>
      <div><span>Navires allongés</span><b>${l.shipsExtended}</b></div>
      <div><span>Navires perdus</span><b>${l.shipsLost}</b></div>
    </div>`;
}
