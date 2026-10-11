import { CONTRACTS, ISLAND_INFO, type Cost, type IslandId, type SpecialContractDef } from '../config';
import { SHIP_TYPES, sizeRank, type ShipType } from '../shipTypes';
import type { Contract, ContractKind, ContractOptions } from './contracts';
import { GOODS, goodText, type Good } from './goods';

/** Une offre de taverne, avant qu'on lui donne un numéro. */
export type Offer = Omit<Contract, 'id' | 'progress'>;

const randInt = ([min, max]: readonly [number, number]) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
/** Pluriel d'un type de navire (« sloops », « corvettes »). */
const plural = (type: ShipType) => `${SHIP_TYPES[type].name.toLowerCase()}s`;
/** Prime d'un contrat de base `gold` / `wood`, multipliée selon ses étoiles. */
const rewardFor = (gold: number, wood: number, stars: number): Cost => {
  const f = CONTRACTS.starReward[stars - 1];
  return { gold: Math.round(gold * f), wood: Math.round(wood * f) };
};
const ISLAND_IDS = Object.keys(ISLAND_INFO) as IslandId[];

/** Genre d'une offre, pour ne pas en proposer deux pareilles : les livraisons se distinguent par leur marchandise. */
export const offerKey = (c: Offer): string => (c.kind === 'deliver' ? `deliver-${c.good}` : c.kind);

/**
 * Nouvelle offre du jour pour la taverne d'une île pirate, d'un genre qui n'est ni déjà proposé ici ni déjà accepté
 * (`taken`) : couler des navires de la Marine, livrer du poisson, chasse à un capitaine, défense du port, escorte d'un
 * marchand, et les convois de son marché. La chasse à un type de navire reste toujours possible (elle varie par le type).
 */
export function createOffer(island: IslandId, options: ContractOptions, stars: number, taken: ReadonlySet<string>): Offer {
  const offer = (kind: ContractKind, title: string, description: string, target: number, reward: Cost, claimAt = island): Offer => ({
    kind,
    stars,
    title,
    description,
    target,
    reward,
    from: island,
    claimAt,
  });
  const convoys = convoyRoutes(island);
  const kinds = ['sink', 'deliver-fish', 'hunt', 'defend', 'escort', ...(options.elites ? ['sinkElite'] : []), ...convoys.map((c) => `deliver-${c.good}`)];
  const kind = pick([...kinds.filter((k) => !taken.has(k)), 'sinkType']);
  const info = ISLAND_INFO[island];

  const convoy = convoys.find((c) => `deliver-${c.good}` === kind);
  if (convoy) {
    const c = CONTRACTS.convoy[convoy.good]!;
    const n = c.perStar * stars + randInt([0, c.perStar]);
    const text = `Achète ${goodText(convoy.good, n)} à ${info.shortName} et livre-les à la taverne de ${ISLAND_INFO[convoy.to].shortName}.`;
    return { ...offer('deliver', c.title, text, n, { gold: n * c.goldPerUnit, wood: 0 }, convoy.to), good: convoy.good };
  }
  switch (kind) {
    case 'sink': {
      const n = 2 + stars + randInt([0, 2]);
      return offer('sink', 'Nettoyer les eaux', `Coule ${n} navires de la Marine, quels qu'ils soient.`, n, rewardFor(CONTRACTS.sink.gold, CONTRACTS.sink.wood, stars));
    }
    case 'sinkElite': {
      const e = CONTRACTS.sinkElite;
      const n = e.count[stars - 1];
      const text = n > 1 ? `Coule ${n} navires d’élite de la Marine (couronne dorée sur la grand-voile).` : 'Coule un navire d’élite de la Marine (couronne dorée sur la grand-voile).';
      return offer('sinkElite', 'Humilier la Couronne', text, n, rewardFor(e.gold, e.wood, stars));
    }
    case 'deliver-fish': {
      const d = CONTRACTS.deliverFish;
      const n = d.perStar * (stars + randInt([0, 1]));
      return { ...offer('deliver', 'Commande de la taverne', `Livre ${n} poissons à la taverne (ils doivent être dans tes cales).`, n, { gold: n * d.goldPerFish, wood: 0 }), good: 'fish' };
    }
    case 'hunt': {
      const h = CONTRACTS.hunt;
      const name = pick(h.names);
      const ship = SHIP_TYPES[h.captain[stars - 1]].name.toLowerCase();
      const text = `${name} (${ship} d'élite) et son escorte rôdent dans une zone marquée sur ta carte (M). Coule son navire.`;
      return { ...offer('hunt', `Tête mise à prix : ${name}`, text, 1, rewardFor(h.gold, h.wood, stars)), captain: name };
    }
    case 'defend': {
      const d = CONTRACTS.defend;
      const fort = `${info.fort.feminine ? 'la' : 'le'} ${info.fort.noun}`;
      const text = `Une escadre de ${d.squadron[stars - 1]} navires de la Marine attaquera ${fort} ${d.delay} s après ton accord. Coule-la avant qu'elle ne fasse tomber les remparts. Prime versée sur-le-champ.`;
      return offer('defend', `Défendre ${info.shortName}`, text, 1, rewardFor(d.gold, d.wood, stars));
    }
    case 'escort': {
      const e = CONTRACTS.escort;
      const to = pick(ISLAND_IDS.filter((id) => id !== island));
      const ambushes = e.ambushes[stars - 1];
      const danger = ambushes ? ` On craint ${ambushes > 1 ? 'des embuscades' : 'une embuscade'} en route.` : '';
      const text = `Un sloop marchand quitte ${info.shortName} pour ${ISLAND_INFO[to].shortName}. Protège-le jusqu'au port.${danger} Prime versée à l'arrivée.`;
      return offer('escort', 'Escorter un marchand', text, 1, rewardFor(e.gold, e.wood, stars), to);
    }
    default: {
      // Plus d'étoiles = un type plus gros, parmi ceux qui apparaissent déjà.
      const types = [...options.types].sort((a, b) => sizeRank(a) - sizeRank(b));
      const type = types[Math.min(types.length - 1, Math.floor(((stars - 1) / (CONTRACTS.stars - 1)) * types.length))] ?? 'rowboat';
      const n = randInt(CONTRACTS.sinkType.count);
      const reward = rewardFor(CONTRACTS.sinkType.gold, CONTRACTS.sinkType.wood, stars);
      return { ...offer('sinkType', `Chasse aux ${plural(type)}`, `Coule ${n} ${plural(type)} de la Marine.`, n, reward), shipType: type };
    }
  }
}

/**
 * Mission spéciale d'une île : ce qu'elle demande vient de sa fiche (escadre, embuscades, quantité), sa prime vaut celle
 * d'une offre du jour du même genre et de la même difficulté × CONTRACTS.specialReward (les primes sur les boss sont fixes).
 */
export function specialOffer(island: IslandId, def: SpecialContractDef): Offer {
  const { stars } = def;
  const twice = (c: Cost): Cost => ({ gold: Math.round(c.gold * CONTRACTS.specialReward), wood: Math.round(c.wood * CONTRACTS.specialReward) });
  const base = { kind: def.kind, stars, title: def.title, description: def.description, target: 1, from: island, claimAt: island, special: def.id };
  switch (def.kind) {
    case 'hunt': {
      const h = CONTRACTS.hunt;
      return { ...base, reward: twice(rewardFor(h.gold, h.wood, stars)), captain: def.captain, squadron: def.squadron };
    }
    case 'defend': {
      const d = CONTRACTS.defend;
      return { ...base, reward: twice(rewardFor(d.gold, d.wood, stars)), squadron: def.squadron };
    }
    case 'escort': {
      const e = CONTRACTS.escort;
      return { ...base, reward: twice(rewardFor(e.gold, e.wood, stars)), claimAt: def.to ?? island, ambushes: def.ambushes };
    }
    case 'deliver': {
      const good = def.good ?? 'fish';
      const n = def.amount ?? 1;
      const perUnit = good === 'fish' ? CONTRACTS.deliverFish.goldPerFish : (CONTRACTS.convoy[good]?.goldPerUnit ?? 0);
      return { ...base, target: n, reward: twice({ gold: n * perUnit, wood: 0 }), good };
    }
    case 'sinkBoss':
      return { ...base, reward: { ...CONTRACTS.sinkBoss[def.boss ?? 'widow'] }, boss: def.boss };
  }
}

/**
 * Convois du marché d'une île : chaque marchandise qu'on peut y acheter (et dont un convoi est réglé), vers l'île
 * qui la rachète le plus cher, si elle la paie plus qu'ici.
 */
function convoyRoutes(island: IslandId): { good: Good; to: IslandId }[] {
  const routes: { good: Good; to: IslandId }[] = [];
  for (const good of GOODS) {
    const buy = ISLAND_INFO[island].market[good].buy;
    if (buy === null || !CONTRACTS.convoy[good]) continue;
    let best: IslandId | null = null;
    for (const id of ISLAND_IDS) {
      const sell = ISLAND_INFO[id].market[good].sell;
      if (id !== island && sell !== null && sell > buy && (!best || sell > (ISLAND_INFO[best].market[good].sell ?? 0))) best = id;
    }
    if (best) routes.push({ good, to: best });
  }
  return routes;
}
