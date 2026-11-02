import type { Character, CharacterId } from './dialogueTypes';

/** Les personnages de l'histoire, et l'allure de leur buste. */
export const CHARACTERS: Record<CharacterId, Character> = {
  kerdal: {
    name: 'Bastien Kerdal',
    title: '« le Vieux », ancien quartier-maître de la Sirène Noire',
    look: {
      skin: 0xb88866,
      hair: 0x9c978e,
      hairStyle: 'short',
      beard: 'full',
      hat: 'tricorne',
      hatColor: 0x2b231c,
      coat: 0x36475a,
      collar: 0xc9bfa6,
      scar: true,
      old: true,
    },
  },
  isaure: {
    name: 'Isaure Mercier',
    title: 'ancienne navigatrice de la Sirène Noire',
    look: {
      skin: 0xd4a283,
      hair: 0x9a3a1c,
      hairStyle: 'long',
      beard: 'none',
      hat: 'bandana',
      hatColor: 0x2e4a3a,
      coat: 0x5a3a22,
      collar: 0xe4dac2,
      earring: true,
      slim: true,
    },
  },
  gaspard: {
    name: 'Gaspard',
    title: 'patron du Sabre Rouillé, à Port-Sabre',
    look: {
      skin: 0xc49272,
      hair: 0x3a2a1e,
      hairStyle: 'none',
      beard: 'stubble',
      hat: 'none',
      hatColor: 0x000000,
      coat: 0x7a5a3a,
      collar: 0xd8ccb0,
      earring: true,
    },
  },
};
