import type { CharacterId } from './dialogueTypes';
import type { MainQuest, QuestStep } from './mainQuest';

/** Une page du carnet de l'histoire : son titre, et le récit de ce qui s'est passé (selon les choix du joueur). */
export interface StoryEntry {
  readonly title: string;
  readonly text: string;
}

/** Ordre des étapes de la quête principale. */
const ORDER: readonly QuestStep[] = ['intro', 'findIsaure', 'proveYourself'];

/** Une page par étape franchie : celle dont l'étape est `after` s'écrit une fois l'étape suivante atteinte. */
const PAGES: readonly { after: QuestStep; title: string; text: (flags: ReadonlySet<string>) => string; met: CharacterId }[] = [
  {
    after: 'intro',
    title: 'Prologue : Le Vieux',
    met: 'kerdal',
    text: (f) =>
      [
        'À l’aube, sur le quai de la Tortue, un vieil homme m’a abordé : Bastien Kerdal, ancien quartier-maître de la Sirène Noire. Il m’a confié sa chaloupe.',
        f.has('kerdalScoffed') ? 'Je l’ai d’abord pris pour un radoteur. Il ne s’est pas laissé démonter.' : '',
        'Il m’a parlé du capitaine Étienne Lagrange, parti chercher le Cœur des Abysses, et de la nuit où des navires morts sont sortis de l’eau au large de l’Île Royale. La Sirène Noire a sombré ; Lagrange a été pendu à Port-Royal, et son journal n’a jamais été retrouvé.',
        'La malédiction poursuit ceux qui cherchent le Cœur, et les capitaines du gouverneur suivent la même piste.',
        f.has('kerdalAccepted') ? 'J’ai promis de retrouver Isaure Mercier, la navigatrice de Lagrange, cachée à Port-Sabre.' : 'Je n’ai rien promis. Mais je sais maintenant qu’Isaure Mercier, la navigatrice de Lagrange, se cache à Port-Sabre.',
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    after: 'findIsaure',
    title: 'Chapitre I : La navigatrice',
    met: 'isaure',
    text: (f) =>
      [
        'À la taverne de Port-Sabre, j’ai trouvé Isaure Mercier, qu’on appelle ici Isa la Rousse.',
        f.has('isaureWary') ? 'J’ai demandé la navigatrice de Lagrange à voix haute : elle a failli me laisser là.' : 'Le nom de Kerdal m’a ouvert sa table.',
        'Elle affirme que le Cœur existe, au-delà des tempêtes qui ceinturent l’archipel. Pour l’atteindre, il faut un navire qui tienne dans ces tempêtes, et la carte de Lagrange, coupée en morceaux : elle garde le sien, les capitaines de la Marine ont pris les autres sur les morts de la Sirène Noire.',
        f.has('isaurePushed') ? 'J’ai réclamé son morceau trop tôt. Elle me le donnera quand la Marine tremblera devant mon pavillon, pas avant.' : 'Elle me donnera son morceau quand la Marine tremblera devant mon pavillon.',
      ].join(' '),
  },
];

const reached = (quest: MainQuest, step: QuestStep) => ORDER.indexOf(quest.step) > ORDER.indexOf(step);

/** Les pages déjà écrites du carnet, de la plus ancienne à la plus récente. */
export function storyEntries(quest: MainQuest): StoryEntry[] {
  return PAGES.filter((p) => reached(quest, p.after)).map((p) => ({ title: p.title, text: p.text(quest.flags) }));
}

/** Les personnages déjà rencontrés. */
export function storyPeople(quest: MainQuest): CharacterId[] {
  return PAGES.filter((p) => reached(quest, p.after)).map((p) => p.met);
}
