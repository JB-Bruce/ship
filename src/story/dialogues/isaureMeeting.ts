import type { Dialogue } from '../dialogueTypes';

/**
 * Chapitre I, fin : à la taverne de Port-Sabre, Isaure Mercier, navigatrice de Lagrange, confirme que le Cœur des
 * Abysses existe et dit ce qu'il faut pour l'atteindre. Elle garde son morceau de la carte de Lagrange jusqu'à ce que le
 * joueur se soit fait un nom contre les capitaines de la Marine (suite de l'histoire).
 */
export const ISAURE_MEETING: Dialogue = {
  id: 'isaureMeeting',
  steps: [
    {
      say: 'isaure',
      text: 'On ne demande pas les gens par leur nom, ici. Pas à voix haute. Qui t’envoie ?',
      choices: [
        { text: 'Bastien Kerdal.', goto: 'kerdal' },
        { text: 'Personne. Je cherche la navigatrice de Lagrange.', goto: 'nobody', flag: 'isaureWary' },
      ],
    },
    { id: 'nobody', say: 'isaure', text: 'Alors tu cherches la corde, et tu la trouveras vite en parlant comme ça.' },
    { say: 'isaure', text: 'Personne ne connaît ce nom-là à Port-Sabre, sauf un vieil entêté de la Tortue. C’est Kerdal qui t’envoie, n’est-ce pas ?', goto: 'sit' },
    { id: 'kerdal', say: 'isaure', text: 'Le Vieux est encore en vie… Il a toujours eu plus de chance que de jugeote.' },
    { id: 'sit', say: 'isaure', text: 'Assieds-toi. Et parle bas : la moitié de cette salle vendrait sa mère pour une prime de la Marine.' },
    { say: 'isaure', text: 'Je sais ce que Kerdal t’a raconté. Ce qu’il ne t’a pas dit, c’est que Lagrange n’avait pas perdu la tête. Il avait raison. Le Cœur existe.' },
    {
      say: 'isaure',
      text: 'Il repose loin au large, au-delà des tempêtes qui ceinturent l’archipel. Pour l’atteindre, il faut un navire qui tienne dans ces tempêtes, et la carte de Lagrange.',
      choices: [
        { text: 'Où est la carte ?', goto: 'map' },
        { text: 'Pourquoi ne pas y être allée toi-même ?', goto: 'herself' },
      ],
    },
    { id: 'herself', say: 'isaure', text: 'J’ai vu ce qui est sorti de l’eau, cette nuit-là. Je n’ai pas eu le courage d’y retourner seule. Et je n’ai jamais eu la carte entière.' },
    { id: 'map', say: 'isaure', text: 'Lagrange l’avait coupée en morceaux et confiée à ses officiers. Le mien, je l’ai encore. Les autres ont coulé avec leurs porteurs, ou dorment dans les coffres de la Marine.' },
    { say: 'isaure', text: 'Les capitaines du gouverneur les ont pris sur nos morts. Ce sont eux qu’il faudra aller chercher, un par un.' },
    {
      say: 'isaure',
      text: 'Pour l’instant, tu n’as qu’une chaloupe et du courage. Ce n’est pas assez pour affronter la Marine.',
      choices: [
        { text: 'Alors aide-moi.', goto: 'help' },
        { text: 'Donne-moi ton morceau, je me débrouillerai.', goto: 'give', flag: 'isaurePushed' },
      ],
    },
    { id: 'give', say: 'isaure', text: 'Pour qu’il finisse au fond de l’eau avec toi à la première escadre venue ? Non.', goto: 'name' },
    { id: 'help', say: 'isaure', text: 'Je t’aiderai, le moment venu. Pas avant.' },
    { id: 'name', say: 'isaure', text: 'Fais-toi un navire, un équipage, un nom. Quand les capitaines de la Marine trembleront en voyant ton pavillon, reviens me voir. Mon morceau sera à toi.' },
    { say: 'isaure', text: 'D’ici là, oublie ce visage, et le nom de Mercier. À Port-Sabre, on m’appelle Isa la Rousse.', end: true },
  ],
};
