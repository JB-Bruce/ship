import type { Dialogue } from '../dialogueTypes';

/**
 * Ouverture de la partie : à l'aube, sur le quai de la Tortue, Bastien Kerdal, ancien quartier-maître de Lagrange,
 * confie sa chaloupe au joueur et lui raconte la perte de la Sirène Noire. Avant de l'envoyer à Port-Sabre retrouver
 * Isaure Mercier, la navigatrice de Lagrange, il veut le voir tenir une barre : le prologue à la Tortue (kerdalTortuga.ts). Le joueur n'est ni nommé ni genré : on le tutoie, sans accord.
 */
export const KERDAL_INTRO: Dialogue = {
  id: 'kerdalIntro',
  steps: [
    { say: 'kerdal', text: 'C’est toi qui traînes sur les quais depuis trois jours à demander un embarquement ?' },
    {
      say: 'kerdal',
      text: 'J’ai vu les refus pleuvoir sur toi. Les capitaines d’ici n’engagent plus personne qu’ils ne connaissent pas.',
      choices: [
        { text: 'Qui le demande ?', goto: 'name' },
        { text: 'Si tu as une place à bord, je la prends.', goto: 'place' },
      ],
    },
    { id: 'name', say: 'kerdal', text: 'Bastien Kerdal. Quartier-maître… autrefois. Ici, on m’appelle le Vieux, et ça me va.', goto: 'navy' },
    { id: 'place', say: 'kerdal', text: 'Une place ? Non. Mais j’ai mieux à t’offrir. Bastien Kerdal, ancien quartier-maître. Ici, on m’appelle le Vieux.' },
    { id: 'navy', say: 'kerdal', text: 'Personne ne t’embarquera, et ce n’est pas ta faute. La Marine fouille chaque navire qui passe la crique. Elle cherche des hommes, et des réponses.' },
    {
      say: 'kerdal',
      text: 'Tu vois cette chaloupe, au bout du quai ? Elle est à moi. Je n’ai plus les jambes pour la mener. Et j’ai une dette envers un mort.',
      choices: [
        { text: 'Quel mort ?', goto: 'lagrange' },
        { text: 'Je ne suis pas là pour écouter des histoires de fantômes.', goto: 'scoff', flag: 'kerdalScoffed' },
      ],
    },
    { id: 'scoff', say: 'kerdal', text: 'Alors tu repartiras aussi pauvre qu’à ton arrivée. Écoute-moi jusqu’au bout. Après, tu feras ce que tu voudras.' },
    { id: 'lagrange', say: 'kerdal', text: 'Étienne Lagrange. Le meilleur capitaine que la Tortue ait porté. J’ai été son quartier-maître dix ans, sur la Sirène Noire.' },
    {
      say: 'kerdal',
      text: 'Il y a six ans, il s’est mis en tête de trouver le Cœur des Abysses. Tu en as entendu parler ?',
      choices: [
        { text: 'Une légende de taverne.', goto: 'legend' },
        { text: 'Jamais.', goto: 'never' },
      ],
    },
    { id: 'legend', say: 'kerdal', text: 'C’est ce que je croyais aussi. Lagrange m’a prouvé le contraire, et ça nous a coûté cher.', goto: 'heart' },
    { id: 'never', say: 'kerdal', text: 'Tant mieux. Ceux qui en parlent trop finissent au bout d’une corde.' },
    { id: 'heart', say: 'kerdal', text: 'On dit que c’est ce que la mer garde de plus précieux, une pierre arrachée au dieu des océans lui-même. Lagrange en avait trouvé la trace dans le journal d’un galion espagnol.' },
    { say: 'kerdal', text: 'Nous avons cherché onze mois. Puis une nuit, au large de l’Île Royale, la mer s’est levée sans un souffle de vent.' },
    { say: 'kerdal', text: 'Des navires sont sortis de l’eau, la proue la première. Des navires morts, aux voiles en lambeaux, avec des fanaux verts qui n’éclairaient rien.' },
    {
      say: 'kerdal',
      text: 'La Sirène Noire a coulé en moins d’une heure. Des pêcheurs m’ont repêché au matin, avec cette jambe-là. Les autres, je ne les ai jamais revus.',
      choices: [
        { text: 'Et Lagrange ?', goto: 'hanged' },
        { text: 'Pourquoi me raconter ça, à moi ?', goto: 'why' },
      ],
    },
    { id: 'hanged', say: 'kerdal', text: 'Lui, la Marine l’a repêché vivant. Ils l’ont pendu à Port-Royal, devant toute la garnison. Ils voulaient son journal. Ils ne l’ont jamais trouvé.', goto: 'curse' },
    { id: 'why', say: 'kerdal', text: 'Parce que tu n’as rien à perdre, et que moi, je suis trop vieux pour tenir une barre.' },
    { id: 'curse', say: 'kerdal', text: 'La malédiction ne s’est pas éteinte avec lui. Ces navires-là, on les voit encore certaines nuits. Ils cherchent ceux qui cherchent le Cœur.' },
    { say: 'kerdal', text: 'Et la Marine le cherche aussi. Le gouverneur de l’Île Royale a lancé ses meilleurs capitaines sur la piste de Lagrange. Ils coulent tout ce qui leur barre la route.' },
    {
      say: 'kerdal',
      text: 'Il reste une survivante. Isaure Mercier, la navigatrice de Lagrange. Elle avait sa route en tête mieux que lui. On dit qu’elle se cache à Port-Sabre, sous un autre nom.',
      choices: [
        { text: 'Je vais la trouver.', goto: 'go', flag: 'kerdalAccepted' },
        { text: 'Et si je refuse ?', goto: 'refuse' },
      ],
    },
    { id: 'refuse', say: 'kerdal', text: 'Alors prends quand même la chaloupe : elle ne sert à rien à un vieux comme moi. Mais tu en sais trop, maintenant. La mer ne te laissera pas tranquille bien longtemps.' },
    { id: 'go', say: 'kerdal', text: 'Mais pas tout de suite. Isaure ne parlera jamais à quelqu’un qui ne sait pas tenir une barre, et Port-Sabre mange les débutants.' },
    { say: 'kerdal', text: 'Commence par le commencement : apprends à mener cette chaloupe. Pêche-moi du poisson, une quinzaine. Les bancs frémissent à la surface, près des côtes : tu verras les mouettes tourner au-dessus.' },
    { say: 'kerdal', text: 'Mets en panne au-dessus du banc et laisse tes hommes jeter les filets. Puis reviens me voir au port.' },
    { say: 'kerdal', text: 'Et n’en parle à personne. Ni du Cœur, ni de Lagrange. La Tortue a des oreilles, et certaines sont payées par la Couronne.' },
    { say: 'kerdal', text: 'Allez, largue les amarres. Je t’attends au quai.', end: true },
  ],
};
