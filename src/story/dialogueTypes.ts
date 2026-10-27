/** Qui parle : un personnage de l'histoire (voir characters.ts). */
export type CharacterId = 'kerdal' | 'isaure';

/** L'allure d'un personnage, pour son buste en 3D (ui/dialogue/portraitBust.ts). */
export interface CharacterLook {
  skin: number;
  hair: number;
  /** Cheveux : courts, longs noués dans le dos, ou aucun (crâne caché par le couvre-chef). */
  hairStyle: 'short' | 'long' | 'none';
  beard: 'none' | 'stubble' | 'full';
  hat: 'tricorne' | 'bandana' | 'none';
  hatColor: number;
  coat: number;
  /** Chemise ou foulard au col. */
  collar: number;
  scar?: boolean;
  earring?: boolean;
  eyePatch?: boolean;
  /** Rides et sourcils broussailleux d'un vieil homme. */
  old?: boolean;
  /** Visage plus fin. */
  slim?: boolean;
}

export interface Character {
  name: string;
  /** Titre sous le nom (« Ancien quartier-maître de la Sirène Noire »). */
  title: string;
  look: CharacterLook;
}

/** Une réponse du joueur : le texte du bouton, l'étape où elle mène (sinon la suivante) et le choix qu'elle note. */
export interface DialogueChoice {
  text: string;
  goto?: string;
  flag?: string;
}

/**
 * Une étape : un personnage dit `text` ; puis le joueur choisit une réponse (`choices`), ou l'on passe à `goto`, sinon
 * à l'étape suivante de la liste. `end` : la conversation s'arrête après cette étape.
 */
export interface DialogueStep {
  id?: string;
  say: CharacterId;
  text: string;
  choices?: readonly DialogueChoice[];
  goto?: string;
  end?: boolean;
}

export interface Dialogue {
  id: string;
  steps: readonly DialogueStep[];
}
