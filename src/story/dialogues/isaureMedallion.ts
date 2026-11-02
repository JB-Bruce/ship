import { STORY_QUEST } from '../../config';
import type { Dialogue } from '../dialogueTypes';

/**
 * Chapitre I, « Le médaillon » : à la taverne de Port-Sabre, Isaure reconnaît le médaillon repêché au Banc du Naufragé
 * (celui de Jacquemin, maître canonnier de la Sirène Noire) et accepte de confier son morceau de carte. Mais Gaspard,
 * le patron, l'a vue avec le joueur : il faudra acheter son silence avec du rhum.
 */
export const ISAURE_MEDALLION: Dialogue = {
  id: 'isaureMedallion',
  steps: [
    { say: 'isaure', text: 'Te revoilà. On raconte que Le Faucon dort par le fond… Qu’est-ce que tu tiens là ? Montre.' },
    { say: 'isaure', text: 'La sirène de Lagrange. Il en avait fait graver une pour chacun de ses officiers. Celle-ci, c’était celle de Jacquemin, notre maître canonnier.' },
    {
      say: 'isaure',
      text: 'Où l’as-tu trouvée ?',
      choices: [
        { text: 'Sur un navire maudit, au Banc du Naufragé.', goto: 'cursed' },
        { text: 'Peu importe. Elle est à toi, si tu la veux.', goto: 'gift', flag: 'medallionOffered' },
      ],
    },
    { id: 'gift', say: 'isaure', text: 'Non. Garde-la. Je n’en veux plus, de ces souvenirs-là. Et tu ne l’as pas trouvée dans un champ, je le vois à tes yeux.' },
    { id: 'cursed', say: 'isaure', text: 'Alors Jacquemin navigue encore, avec ce qui reste de lui. Les morts de la Sirène ne reposent pas. Ils cherchent ceux qui cherchent le Cœur.' },
    { say: 'isaure', text: 'Le Banc, de nuit, et te revoilà sans une égratignure. Avec Duroc par le fond en plus. Ça me suffit : je vais te confier mon morceau.' },
    { say: 'isaure', text: 'Il est caché ici, sous le plancher de la réserve. Mais il y a un problème : Gaspard, le patron, m’a vue avec toi. Il sait qui je suis.' },
    {
      say: 'isaure',
      text: 'Ce soir, il me l’a fait comprendre. Un mot à la Marine, et je finis au bout d’une corde, comme Lagrange.',
      choices: [
        { text: 'Je vais lui parler, à ma façon.', goto: 'threat', flag: 'gaspardThreatened' },
        { text: 'Que veut-il ?', goto: 'price' },
      ],
    },
    { id: 'threat', say: 'isaure', text: 'Pas de sang ici. Les Frères du Sabre le protègent, et j’ai besoin de cette taverne. On va le payer.' },
    { id: 'price', say: 'isaure', text: `Du rhum. ${STORY_QUEST.rum} caisses pour sa cave, et il oublie mon visage. Gaspard ne vend personne tant que sa cave est pleine.` },
    { say: 'isaure', text: 'Le rhum s’achète dans les comptoirs des autres îles, ou se prend dans les cales de ceux que tu coules. Reviens avec, et apporte-les-lui.', end: true },
  ],
};
