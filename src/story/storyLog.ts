import type { CharacterId } from './dialogueTypes';
import { STORY_QUEST } from '../config';
import { QUEST_ORDER, type MainQuest, type QuestStep } from './mainQuest';

/** Une page du carnet de l'histoire : son titre, et le récit de ce qui s'est passé (selon les choix du joueur). */
export interface StoryEntry {
  readonly title: string;
  readonly text: string;
}

/** Une page par étape franchie : celle dont l'étape est `after` s'écrit une fois l'étape suivante atteinte. */
const PAGES: readonly { after: QuestStep; title: string; text: (flags: ReadonlySet<string>) => string; met?: CharacterId }[] = [
  {
    after: 'intro',
    title: 'Prologue : Le Vieux',
    met: 'kerdal',
    text: (f) =>
      [
        'À l’aube, sur le quai de la Tortue, un vieil homme est venu me parler : Bastien Kerdal, ancien quartier-maître de la Sirène Noire. Il m’a confié sa chaloupe.',
        f.has('kerdalScoffed') ? 'Je l’ai d’abord pris pour un radoteur. Il ne s’est pas laissé démonter.' : '',
        'Il m’a parlé du capitaine Étienne Lagrange, parti chercher le Cœur des Abysses, et de la nuit où des navires morts sont sortis de l’eau au large de l’Île Royale. La Sirène Noire a sombré ; Lagrange a été pendu à Port-Royal, et son journal n’a jamais été retrouvé.',
        'La malédiction poursuit ceux qui cherchent le Cœur, et les capitaines du gouverneur suivent la même piste.',
        f.has('kerdalAccepted') ? 'J’ai promis de retrouver Isaure Mercier, la navigatrice de Lagrange, cachée à Port-Sabre.' : 'Je n’ai rien promis. Mais je sais maintenant qu’Isaure Mercier, la navigatrice de Lagrange, se cache à Port-Sabre.',
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    after: 'portRepair',
    title: 'Prologue : La Tortue',
    text: (f) =>
      [
        'Avant de m’envoyer à Port-Sabre, Kerdal a voulu me voir tenir une barre. Je lui ai pêché du poisson, fait renforcer la chaloupe au chantier, envoyé par le fond les barques de la Marine qui rançonnaient les pêcheurs, et redonné un peu de vie au port.',
        f.has('kerdalTeased') ? 'Il a bien ri quand j’ai défendu sa vieille chaloupe.' : '',
        'Alors seulement, il m’a envoyé chercher Isaure.',
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
  {
    after: 'aRealShip',
    title: 'Un navire digne de ce nom',
    text: () => 'La chaloupe de Kerdal avait fait son temps : il fallait mieux pour qu’on me prenne au sérieux. J’ai désormais un vrai navire sous les pieds, et un officier à mes côtés.',
  },
  {
    after: 'hangman',
    title: 'Le Pendeur',
    text: () => 'Au sud de l’Île du Dauphin, le lieutenant Duroc pendait les pirates qu’il capturait. Son Faucon dort maintenant par le fond. À Port-Sabre, on commence à prononcer mon nom.',
  },
  {
    after: 'medallion',
    title: 'Les fanaux verts',
    text: () => `Kerdal l’avait fait savoir : des fanaux verts au Banc du Naufragé. De nuit, des navires morts sont sortis de l’eau. J’en ai renvoyé ${STORY_QUEST.greenLights.target} aux abysses, et l’un d’eux a laissé flotter un médaillon d’or gravé d’une sirène.`,
  },
  {
    after: 'returnIsaure',
    title: 'Le médaillon',
    met: 'gaspard',
    text: (f) =>
      [
        'Isaure a reconnu le médaillon : celui de Jacquemin, le maître canonnier de la Sirène Noire. Les morts de Lagrange naviguent encore, et ils cherchent ceux qui cherchent le Cœur.',
        'Elle accepte de me confier son morceau de carte, mais Gaspard, le patron du Sabre Rouillé, l’a reconnue.',
        f.has('gaspardThreatened') ? 'J’ai voulu le faire taire à ma façon ; elle s’y est opposée.' : '',
        `Son silence coûte ${STORY_QUEST.rum} caisses de rhum.`,
      ]
        .filter(Boolean)
        .join(' '),
  },
  {
    after: 'silence',
    title: 'Le prix du silence',
    text: (f) =>
      [
        'Gaspard a eu son rhum et oublié le visage d’Isa la Rousse.',
        f.has('gaspardWarned') ? 'Je lui ai fait comprendre ce qu’il lui en coûterait de parler.' : '',
        'Isaure m’a donné son morceau de la carte de Lagrange : le tracé des récifs au-delà des tempêtes. Les autres sont entre les mains des capitaines du gouverneur.',
      ]
        .filter(Boolean)
        .join(' '),
  },
];

const reached = (quest: MainQuest, step: QuestStep) => QUEST_ORDER.indexOf(quest.step) > QUEST_ORDER.indexOf(step);

/** Les pages déjà écrites du carnet, de la plus ancienne à la plus récente. */
export function storyEntries(quest: MainQuest): StoryEntry[] {
  return PAGES.filter((p) => reached(quest, p.after)).map((p) => ({ title: p.title, text: p.text(quest.flags) }));
}

/** Les personnages déjà rencontrés. */
export function storyPeople(quest: MainQuest): CharacterId[] {
  return PAGES.filter((p) => reached(quest, p.after)).flatMap((p) => (p.met ? [p.met] : []));
}
