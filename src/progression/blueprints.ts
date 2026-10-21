import { BLUEPRINTS, ISLAND_UPGRADES } from '../config';
import { SHIP_TYPES, typeName, type ShipType } from '../shipTypes';

/** Ce qu'une sauvegarde garde des plans : les bouts gagnés des types encore inconnus, et les types connus. */
export interface BlueprintsSnapshot {
  fragments: Partial<Record<ShipType, number>>;
  unlocked: ShipType[];
}

/** Où en est le plan d'un type après un bout ramassé. */
export interface BlueprintProgress {
  type: ShipType;
  count: number;
  needed: number;
  /** Ce bout vient de compléter le plan : le type est désormais connu. */
  completed: boolean;
}

/** Nom affiché à la place de celui d'un type inconnu (masculin : les accords suivent `labelFeminine`). */
const UNKNOWN = { name: 'Navire inconnu', noun: 'navire inconnu', plural: 'navires inconnus' };

const isShipType = (t: string): t is ShipType => t in SHIP_TYPES;

/**
 * Plans de navires : pour construire un type, il faut réunir les bouts de son plan (BLUEPRINTS.fragments), lâchés par
 * les navires de ce type que ta flotte coule (world/planScrolls.ts). Un type sans plan à réunir (chaloupe, barque) et
 * ceux de ta flotte sont connus d'office. Tant qu'un type est inconnu, son nom est caché partout (`shipTypeLabel`).
 * État unique, comme `harbors` : la campagne le remet à zéro, le sauvegarde et le rétablit.
 */
class Blueprints {
  private readonly fragments = new Map<ShipType, number>();
  private readonly unlocked = new Set<ShipType>();
  /** Augmente à chaque type découvert : les étiquettes gardées en cache (barres de vie) se refont. */
  version = 0;

  /** Bouts de plan à réunir pour ce type (0 : connu d'office). */
  needed(type: ShipType): number {
    return BLUEPRINTS.fragments[type] ?? 0;
  }

  isUnlocked(type: ShipType): boolean {
    return this.needed(type) === 0 || this.unlocked.has(type);
  }

  /** Bouts gagnés (le total quand le type est connu). */
  count(type: ShipType): number {
    return this.isUnlocked(type) ? this.needed(type) : (this.fragments.get(type) ?? 0);
  }

  /** Le type devient connu (plan complet, ou navire de ta flotte). */
  unlock(type: ShipType) {
    if (this.isUnlocked(type)) return;
    this.unlocked.add(type);
    this.fragments.delete(type);
    this.version++;
  }

  /** Un bout de plan ramassé. Renvoie la progression ; le dernier bout débloque le type. */
  addFragment(type: ShipType): BlueprintProgress {
    const needed = this.needed(type);
    if (this.isUnlocked(type)) return { type, count: needed, needed, completed: false };
    const count = Math.min(needed, (this.fragments.get(type) ?? 0) + 1);
    if (count >= needed) this.unlock(type);
    else this.fragments.set(type, count);
    return { type, count, needed, completed: count >= needed };
  }

  /** Nouvelle partie : aucun bout gagné ; seuls les types de `known` (ta flotte de départ) sont connus, en plus des types sans plan. */
  reset(known: Iterable<ShipType>) {
    this.fragments.clear();
    this.unlocked.clear();
    for (const type of known) this.unlock(type);
    this.version++;
  }

  snapshot(): BlueprintsSnapshot {
    return { fragments: Object.fromEntries(this.fragments), unlocked: [...this.unlocked] };
  }

  /**
   * Reprend une sauvegarde. Absent (sauvegarde d'avant les plans) : on garde l'état de départ, où les types de ta flotte
   * (`known`, en commerce compris) sont connus. Dans tous les cas, les types de ta flotte restent connus.
   */
  restore(s: BlueprintsSnapshot | undefined, known: Iterable<ShipType>) {
    if (s) {
      this.reset([]);
      for (const type of s.unlocked ?? []) if (isShipType(type)) this.unlock(type);
      for (const [type, n] of Object.entries(s.fragments ?? {})) {
        if (!isShipType(type) || this.isUnlocked(type) || !(n > 0)) continue;
        if (n >= this.needed(type)) this.unlock(type);
        else this.fragments.set(type, Math.floor(n));
      }
    }
    for (const type of known) this.unlock(type);
    this.version++;
  }
}

export const blueprints = new Blueprints();

/**
 * Nom affiché d'un type (selon ses allongements, « Grande frégate ») : le sien s'il est connu, sinon « Navire inconnu ».
 * À utiliser partout où peut paraître un navire qui n'est pas à toi (ennemis, alliés, contrats, registre…).
 */
export function shipTypeLabel(type: ShipType, extension = 0): string {
  return blueprints.isUnlocked(type) ? typeName(type, extension) : UNKNOWN.name;
}

/** Le nom affiché est-il féminin (« coulée », « cette ») ? « Navire inconnu » est masculin. */
export function labelFeminine(type: ShipType): boolean {
  return blueprints.isUnlocked(type) && !!SHIP_TYPES[type].feminine;
}

/** « 3 navires inconnus » / « un navire inconnu » (liste des constructions du chantier naval). */
export function unknownShips(count: number): string {
  return count > 1 ? `${count} ${UNKNOWN.plural}` : `un ${UNKNOWN.noun}`;
}

/**
 * Formes d'un nom de type dans un texte gardé (contrat, rumeur) : `t` le nom (« sloop »), `ts` son pluriel, `un` et
 * `le` avec l'article (« une corvette »), `au` (« à la corvette », « au sloop »), `e` la marque du féminin (accords).
 * Une majuscule à la forme (`T`, `Un`…) met une majuscule au résultat.
 */
const TOKEN = /\{(t|ts|un|le|au|e|T|Ts|Un|Le|Au):([a-zA-Z]+)\}/g;
const VOWEL = /^[aeiouyàâéèêîôû]/i;

/** « {ts:sloop} » : un nom de type dans un texte qu'on garde (contrat), révélé seulement à l'affichage par `revealTypes`. */
export function typeToken(form: 't' | 'ts' | 'un' | 'le' | 'au' | 'e' | 'T' | 'Ts' | 'Un' | 'Le' | 'Au', type: ShipType): string {
  return `{${form}:${type}}`;
}

/** Remplace les noms de types à trous d'un texte (`typeToken`) par leur nom, ou « navire inconnu » tant qu'il l'est. */
export function revealTypes(text: string): string {
  if (!text.includes('{')) return text;
  return text.replace(TOKEN, (token, form: string, type: string) => {
    if (!isShipType(type)) return token;
    const phrase = typePhrase(form.toLowerCase(), type);
    return form[0] === form[0].toUpperCase() ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
  });
}

function typePhrase(form: string, type: ShipType): string {
  const known = blueprints.isUnlocked(type);
  const noun = known ? SHIP_TYPES[type].name.toLowerCase() : UNKNOWN.noun;
  const feminine = labelFeminine(type);
  switch (form) {
    case 'ts':
      return known ? `${noun}s` : UNKNOWN.plural;
    case 'un':
      return `${feminine ? 'une' : 'un'} ${noun}`;
    case 'le':
      return `${VOWEL.test(noun) ? 'l’' : feminine ? 'la ' : 'le '}${noun}`;
    case 'au':
      return `${VOWEL.test(noun) ? 'à l’' : feminine ? 'à la ' : 'au '}${noun}`;
    case 'e':
      return feminine ? 'e' : '';
    default:
      return noun;
  }
}

/**
 * Texte d'une ancienne sauvegarde, où les noms de types sont écrits en clair (« Chasse aux corvettes ») : chaque nom
 * devient un nom à trous (le pluriel d'abord), pour être caché tant que le type est inconnu. Un texte qui a déjà des
 * trous est laissé tel quel.
 */
export function tokenizeTypeNames(text: string): string {
  if (text.includes('{')) return text;
  let out = text;
  for (const type of Object.keys(SHIP_TYPES) as ShipType[]) {
    const name = SHIP_TYPES[type].name.toLowerCase();
    for (const [word, form] of [[`${name}s`, 'ts'], [name, 't']] as const) {
      const pattern = new RegExp(`(?<!\\p{L}|\\{\\w*:?)${word}(?!\\p{L})`, 'giu');
      out = out.replace(pattern, (m) => `{${m[0] === m[0].toUpperCase() ? form.charAt(0).toUpperCase() + form.slice(1) : form}:${type}}`);
    }
  }
  return out;
}

/** Popup d'un bout de plan ramassé : « 📜 Plan de navire inconnu · 2/5 », ou le nom du navire une fois le plan complet. */
export function fragmentNotice(p: BlueprintProgress): string {
  const name = p.completed ? SHIP_TYPES[p.type].name.toLowerCase() : UNKNOWN.noun;
  return `📜 Plan de ${name} · ${p.count}/${p.needed}`;
}

/** Grand message d'un plan complet, qui révèle enfin le nom du navire (et le chantier naval qu'il demande). */
export function unlockMessage(type: ShipType): string {
  const def = SHIP_TYPES[type];
  const yard = ISLAND_UPGRADES.shipyard.required[type] ?? 0;
  const where = yard ? ` (chantier naval de niveau ${yard})` : '';
  const article = def.feminine ? 'la' : 'le';
  return `📜 Plan complet : ${article} ${def.name.toLowerCase()} ! Tu sais désormais ${article} construire${where}.`;
}
