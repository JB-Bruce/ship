import { STORY_QUEST } from '../../config';
import type { Dialogue } from '../dialogueTypes';

/** Chapitre I, « Le prix du silence » : le rhum livré, Gaspard oublie Isaure, qui donne son morceau de la carte de Lagrange. */
export const GASPARD_SILENCE: Dialogue = {
  id: 'gaspardSilence',
  steps: [
    { say: 'gaspard', text: `Les ${STORY_QUEST.rum} caisses de rhum sont roulées dans ma cave. Tu sais parler aux gens, toi.` },
    {
      say: 'gaspard',
      text: 'Une rousse, dans ma taverne ? Jamais vu. Ni toi non plus, d’ailleurs. On se comprend ?',
      choices: [
        { text: 'On se comprend.', goto: 'deal' },
        { text: 'Si la Marine entend parler d’elle, je saurai d’où ça vient.', goto: 'warn', flag: 'gaspardWarned' },
      ],
    },
    { id: 'warn', say: 'gaspard', text: 'Doucement, doucement. Gaspard a de la mémoire pour ses amis, et aucune pour le reste. Ta rousse est en sécurité ici.' },
    { id: 'deal', say: 'isaure', text: 'Viens. Pendant qu’il compte ses caisses.' },
    { say: 'isaure', text: 'Voilà le morceau de Lagrange : le tracé des récifs au-delà des tempêtes, de sa main. Personne d’autre ne l’a vu depuis six ans.' },
    { say: 'isaure', text: 'Les autres morceaux sont entre les mains des capitaines du gouverneur. Quand tu seras prêt à les affronter, je te dirai où les trouver.' },
    {
      say: 'isaure',
      text: 'D’ici là, garde-le au sec, et ne le montre à personne.',
      choices: [
        { text: 'Pourquoi m’aider, maintenant ?', goto: 'why' },
        { text: 'Je serai prêt.', goto: 'ready' },
      ],
    },
    { id: 'why', say: 'isaure', text: 'Parce que Lagrange m’a tirée du ruisseau, un jour. Et parce que tu ne lâches pas. Ça, c’est rare.', end: true },
    { id: 'ready', say: 'isaure', text: 'Je l’espère. Que la mer te soit clémente.', end: true },
  ],
};
