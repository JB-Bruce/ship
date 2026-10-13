import { CONTRACTS, ISLAND_INFO, SPECIAL_CONTRACTS, type BossId, type Cost, type IslandId } from '../config';
import type { ShipType } from '../shipTypes';
import { createOffer, offerKey, specialOffer } from './contractOffers';
import type { Good } from './goods';
import { shipThreat } from './missionThreat';

export type ContractKind = 'sink' | 'sinkType' | 'sinkElite' | 'deliver' | 'sinkBoss' | 'hunt' | 'defend' | 'escort';

export interface Contract {
  readonly id: number;
  readonly kind: ContractKind;
  readonly title: string;
  readonly description: string;
  /** Difficulté, de 1 à CONTRACTS.stars étoiles (pour un combat : la menace réelle, missionThreat.ts). */
  readonly stars: number;
  /**
   * Palier des tables par étoile (escadre, embuscades) d'une offre du jour : les étoiles tirées autour du niveau de ta
   * flotte. Absent des anciennes sauvegardes et des missions spéciales : `stars`.
   */
  readonly tier?: number;
  /** Nombre à atteindre (navires, unités livrées, 1 pour une mission). */
  readonly target: number;
  readonly reward: Cost;
  /** Taverne qui l'a proposé, et port où toucher la prime (ou livrer, ou que vise l'escorte). */
  readonly from: IslandId;
  readonly claimAt: IslandId;
  readonly shipType?: ShipType;
  /** Marchandise à livrer (contrats de livraison et convois). */
  readonly good?: Good;
  /** Capitaine à couler (chasse). */
  readonly captain?: string;
  /** Boss à couler (prime sur un boss). */
  readonly boss?: BossId;
  /** Mission spéciale (son identifiant dans SPECIAL_CONTRACTS), unique. */
  readonly special?: string;
  /** Escadre imposée (chasse, défense d'une mission spéciale), le chef d'abord ; sinon tirée selon les étoiles. */
  readonly squadron?: readonly ShipType[];
  /** Embuscades imposées (escorte d'une mission spéciale). */
  readonly ambushes?: number;
  /** Avancement (navires coulés depuis l'acceptation, mission réussie). Les livraisons se font d'un coup. */
  progress: number;
}

/** Ce que les contrats peuvent demander en ce moment. */
export interface ContractOptions {
  /** Types d'ennemis qui peuvent apparaître. */
  types: readonly ShipType[];
  /** Les élites apparaissent déjà. */
  elites: boolean;
  /** Niveau de ta flotte (1 à 5) : les étoiles des offres se tirent autour. */
  level: number;
}

/** Genre de mission affiché sur les contrats (offres, contrats en cours, suivi à l'écran). */
export type MissionType = 'combat' | 'hunt' | 'bounty' | 'defense' | 'escort' | 'convoy' | 'delivery';

export const MISSION_TYPES: Record<MissionType, { name: string; icon: string }> = {
  combat: { name: 'Combat', icon: '⚔' },
  hunt: { name: 'Chasse', icon: '🎯' },
  bounty: { name: 'Prime', icon: '☠' },
  defense: { name: 'Défense', icon: '🏰' },
  escort: { name: 'Escorte', icon: '⛵' },
  convoy: { name: 'Convoi', icon: '📦' },
  delivery: { name: 'Livraison', icon: '🐟' },
};

export function missionType(c: Contract): MissionType {
  switch (c.kind) {
    case 'hunt': return 'hunt';
    case 'sinkBoss': return 'bounty';
    case 'defend': return 'defense';
    case 'escort': return 'escort';
    case 'deliver': return c.good === 'fish' ? 'delivery' : 'convoy';
    default: return 'combat';
  }
}

/** Étiquette du genre de mission, pour les cartes de la taverne. */
export function missionTag(c: Contract): string {
  const type = missionType(c);
  const { name, icon } = MISSION_TYPES[type];
  return `<span class="tag mission ${type}">${icon} ${name}</span>`;
}

/** « ★★★ » : seulement les étoiles gagnées. */
export const starsText = (stars: number) => '★'.repeat(stars);

/** Ce qu'une sauvegarde garde des contrats. */
export interface ContractsSnapshot {
  offers: Record<IslandId, Contract[]>;
  active: Contract[];
  dayLeft: number;
  specialsDone: string[];
  nextId: number;
}

/**
 * Contrats des tavernes. Chaque île pirate affiche ses offres du jour (contractOffers.ts : les mêmes genres partout,
 * plus les convois de son marché), tirées autour du niveau de ta flotte et remplacées à chaque nouvelle journée, et ses
 * missions spéciales (SPECIAL_CONTRACTS) : uniques, plus dures et mieux payées, deux à la fois, la suivante après une
 * réussite. On en accepte 4 au plus en même temps, toutes tavernes confondues. Les navires coulés font avancer les
 * contrats acceptés ; les missions (chasse, défense, escorte) sont suivies par le directeur des missions. La prime se
 * touche à la taverne indiquée.
 */
export class Contracts {
  readonly offers = Object.fromEntries(Object.keys(ISLAND_INFO).map((id) => [id, []])) as unknown as Record<IslandId, Contract[]>;
  readonly active: Contract[] = [];
  /** Temps restant avant la journée suivante (s). */
  dayLeft = CONTRACTS.dayLength;
  /** Missions spéciales réussies : elles ne reviennent jamais. */
  private readonly specialsDone = new Set<string>();
  /** Contrat de chaque mission spéciale proposée ou en cours (le même tant qu'elle n'est ni réussie ni ratée). */
  private readonly specialContracts = new Map<string, Contract>();
  private nextId = 1;

  /** État à sauvegarder : offres du jour, contrats acceptés (avec leur avancement), missions spéciales réussies. */
  snapshot(): ContractsSnapshot {
    return { offers: structuredClone(this.offers), active: structuredClone(this.active), dayLeft: this.dayLeft, specialsDone: [...this.specialsDone], nextId: this.nextId };
  }

  restore(s: ContractsSnapshot) {
    for (const id of Object.keys(this.offers) as IslandId[]) this.offers[id] = s.offers[id] ?? [];
    this.active.splice(0, this.active.length, ...s.active);
    this.dayLeft = s.dayLeft;
    this.specialsDone.clear();
    for (const id of s.specialsDone) this.specialsDone.add(id);
    // Une mission spéciale acceptée reste la même (elle n'est plus proposée tant qu'elle est en cours).
    this.specialContracts.clear();
    for (const c of this.active) if (c.special) this.specialContracts.set(c.special, c);
    this.nextId = s.nextId;
  }

  /** Le temps passe : à chaque nouvelle journée, les offres du jour non acceptées sont retirées. Renvoie true alors. */
  tick(dt: number): boolean {
    this.dayLeft -= dt;
    if (this.dayLeft > 0) return false;
    this.dayLeft = CONTRACTS.dayLength;
    for (const offers of Object.values(this.offers)) offers.length = 0;
    return true;
  }

  /** Complète les offres du jour de la taverne d'une île (seules les îles pirates en proposent). */
  refresh(island: IslandId, options: ContractOptions) {
    if (ISLAND_INFO[island].allegiance !== 'pirate') return;
    const offers = this.offers[island];
    while (offers.length < CONTRACTS.offers) {
      // Pas deux offres du même genre ici, ni d'un genre déjà accepté.
      const taken = new Set(offers.concat(this.active).map(offerKey));
      const offer = createOffer(island, options, drawStars(options.level), taken);
      offers.push({ ...offer, id: this.nextId++, progress: 0 });
    }
  }

  /** Missions spéciales proposées par une île : les premières de sa liste pas encore réussies, hors celles en cours. */
  specials(island: IslandId): Contract[] {
    if (ISLAND_INFO[island].allegiance !== 'pirate') return [];
    const open = SPECIAL_CONTRACTS[island].filter((d) => !this.specialsDone.has(d.id)).slice(0, CONTRACTS.specialsShown);
    return open.map((def) => {
      let contract = this.specialContracts.get(def.id);
      if (!contract) {
        contract = { ...specialOffer(island, def), id: this.nextId++, progress: 0 };
        this.specialContracts.set(def.id, contract);
      }
      return contract;
    }).filter((c) => !this.active.includes(c));
  }

  /** Toutes les missions spéciales de l'île sont réussies. */
  specialsFinished(island: IslandId): boolean {
    return SPECIAL_CONTRACTS[island].every((d) => this.specialsDone.has(d.id));
  }

  /** Accepte une offre du jour ou une mission spéciale. Renvoie le contrat, ou null si impossible. */
  accept(id: number): Contract | null {
    if (this.active.length >= CONTRACTS.maxActive) return null;
    for (const offers of Object.values(this.offers)) {
      const i = offers.findIndex((c) => c.id === id);
      if (i < 0) continue;
      const [contract] = offers.splice(i, 1);
      this.active.push(contract);
      return contract;
    }
    const special = (Object.keys(SPECIAL_CONTRACTS) as IslandId[]).flatMap((island) => this.specials(island)).find((c) => c.id === id);
    if (!special) return null;
    this.active.push(special);
    return special;
  }

  /** Retire un contrat accepté (abandonné ou échoué) : une mission spéciale redevient disponible, à recommencer. */
  remove(contract: Contract) {
    const i = this.active.indexOf(contract);
    if (i >= 0) this.active.splice(i, 1);
    if (contract.special) this.specialContracts.delete(contract.special);
  }

  /** Contrat rempli (prime versée) : une mission spéciale ne reviendra plus. */
  complete(contract: Contract) {
    this.remove(contract);
    if (contract.special) this.specialsDone.add(contract.special);
  }

  isDone(contract: Contract): boolean {
    return contract.kind !== 'deliver' && contract.progress >= contract.target;
  }

  /** Un ennemi a coulé : les contrats acceptés qu'il concerne avancent. Renvoie ceux qui viennent d'être remplis. */
  onSunk(type: ShipType, elite: boolean, boss: BossId | null): Contract[] {
    const done: Contract[] = [];
    for (const c of this.active) {
      if (this.isDone(c)) continue;
      const counts =
        (c.kind === 'sink' && !boss) ||
        (c.kind === 'sinkType' && c.shipType === type && !boss) ||
        (c.kind === 'sinkElite' && elite) ||
        (c.kind === 'sinkBoss' && c.boss === boss);
      if (!counts) continue;
      c.progress++;
      if (this.isDone(c)) done.push(c);
    }
    return done;
  }
}

/** Étoiles d'une offre du jour : le niveau de la flotte ou une de moins, parfois une de plus. */
function drawStars(level: number): number {
  const roll = Math.random();
  const offset = CONTRACTS.starSpread.find(([, p]) => roll < p)![0];
  return Math.min(CONTRACTS.stars, Math.max(1, level + offset));
}

/** Niveau d'une flotte (1 à 5) d'après la taille de ses navires : une chaloupe seule = 1, six corvettes = 5. */
export function fleetLevel(types: readonly ShipType[]): number {
  const size = types.reduce((sum, t) => sum + shipThreat(t), 0);
  return Math.min(CONTRACTS.stars, Math.max(1, Math.round(size / CONTRACTS.fleetLevelDivisor)));
}
