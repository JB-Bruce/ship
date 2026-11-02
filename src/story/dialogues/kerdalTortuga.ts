import { STORY_QUEST } from '../../config';
import type { Dialogue } from '../dialogueTypes';

/**
 * Le prologue à la Tortue : ce que Kerdal dit au port quand on vient lui rapporter chaque petite quête (le poisson,
 * la coque améliorée, les barques de la Marine coulées, le premier bâtiment du port), jusqu'au départ pour Port-Sabre.
 */
export const KERDAL_FISH: Dialogue = {
  id: 'kerdalFish',
  steps: [
    { say: 'kerdal', text: `Le compte est bon : ${STORY_QUEST.tortuga.fish} poissons, et pas un de pourri. Pour une première sortie, c’est honnête.` },
    { say: 'kerdal', text: 'Je te les achète. Voilà de quoi payer un charpentier, parce que cette chaloupe prend l’eau par tous les bouts.' },
    {
      say: 'kerdal',
      text: 'Tu ne l’as pas remarqué ?',
      choices: [
        { text: 'Elle tient très bien la mer.', goto: 'proud', flag: 'kerdalTeased' },
        { text: 'Que faut-il faire ?', goto: 'yard' },
      ],
    },
    { id: 'proud', say: 'kerdal', text: 'Elle tient tant que la mer est d’humeur. Le jour où elle ne l’est plus, tu me remercieras.' },
    { id: 'yard', say: 'kerdal', text: 'Passe au chantier, là, au bout du quai. Fais renforcer la coque, ajouter de la toile, ce que tu voudras. Puis reviens me voir.', end: true },
  ],
};

export const KERDAL_UPGRADE: Dialogue = {
  id: 'kerdalUpgrade',
  steps: [
    { say: 'kerdal', text: 'La voilà qui a meilleure allure. Le charpentier a fait du bon travail, et toi aussi.' },
    { say: 'kerdal', text: 'Maintenant, les ennuis. Deux barques de la Marine rôdent au sud de l’île. Elles rançonnent nos pêcheurs et fouillent tout ce qui sort de la crique.' },
    {
      say: 'kerdal',
      text: 'Tant qu’elles traînent là, la Tortue ne respire pas.',
      choices: [
        { text: 'Je vais les couler.', goto: 'go', flag: 'kerdalEager' },
        { text: 'La Marine, rien que ça ?', goto: 'fear' },
      ],
    },
    { id: 'fear', say: 'kerdal', text: 'Deux barques et une poignée de soldats mal payés. Si tu ne sais pas couler ça, tu ne survivras pas une journée à Port-Sabre.' },
    { id: 'go', say: 'kerdal', text: 'Approche-toi par le travers et laisse parler tes canons. Et ramène-moi ma chaloupe en un seul morceau.', end: true },
  ],
};

export const KERDAL_RATS: Dialogue = {
  id: 'kerdalRats',
  steps: [
    { say: 'kerdal', text: 'Les pêcheurs ne parlent que de ça : une chaloupe qui envoie la Marine par le fond. Ton nom commence à circuler.' },
    { say: 'kerdal', text: 'La Tortue a été généreuse avec toi. Rends-lui un peu : le port tombe en ruine depuis que la Marine nous serre la gorge.' },
    { say: 'kerdal', text: 'Va à la capitainerie et fais construire quelque chose : un atelier, un quai, ce qui te semble utile. Les pêcheurs t’ont laissé du bois en remerciement, sers-t’en.', end: true },
  ],
};

export const KERDAL_SEND: Dialogue = {
  id: 'kerdalSend',
  steps: [
    { say: 'kerdal', text: 'Des charpentiers sur le port, des marteaux qui sonnent… Ça faisait longtemps. La Tortue te doit quelque chose, maintenant. Et moi aussi.' },
    { say: 'kerdal', text: 'Tu sais tenir une barre, te battre, et tu ne laisses pas les tiens dans la misère. Isaure voudra voir ça.' },
    { say: 'kerdal', text: 'Port-Sabre est à l’ouest d’ici, au-delà de la passe. Va à la taverne et demande Isaure. Ne donne mon nom qu’à elle.' },
    {
      say: 'kerdal',
      text: 'Le reste, c’est à toi de l’écrire.',
      choices: [
        { text: 'Et toi, tu ne viens pas ?', goto: 'stay' },
        { text: 'J’y vais.', goto: 'bye' },
      ],
    },
    { id: 'stay', say: 'kerdal', text: 'Mes jambes ne valent plus rien sur un pont. Mais mes yeux suivront ta voile jusqu’à l’horizon.' },
    { id: 'bye', say: 'kerdal', text: 'Que la mer te soit clémente.', end: true },
  ],
};
