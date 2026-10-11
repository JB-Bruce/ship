import { OFFICERS, RANKS, type ModifierKey, type OfficerRole, type OfficerTrait, type StatEffect } from '../config';

/** Un officier de bord. */
export interface Officer {
  readonly id: number;
  readonly name: string;
  readonly role: OfficerRole;
  /** Talent à l'engagement (étoiles), et talent actuel (progression comprise). */
  readonly baseTalent: number;
  talent: number;
  readonly trait: OfficerTrait | null;
  /** Victoires de son navire depuis qu'il est à bord. */
  xp: number;
  /** Navire où il sert (id du FleetMember), ou null : à terre. */
  assignedTo: number | null;
  /** Officier nommé, gagné par une mission spéciale. */
  readonly unique: boolean;
}

const ROLES = Object.keys(OFFICERS.roles) as OfficerRole[];
const TRAITS = Object.keys(OFFICERS.traits) as OfficerTrait[];
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Un candidat tiré au hasard (nom pas encore porté, si possible). */
export function randomOfficer(id: number, takenNames: ReadonlySet<string>): Officer {
  let name = '';
  for (let i = 0; i < 10 && (!name || takenNames.has(name)); i++) name = `${pick(OFFICERS.firstNames)} ${pick(OFFICERS.lastNames)}`;
  const roll = Math.random();
  const talent = OFFICERS.talent.find(([, p]) => roll < p)![0];
  const trait = Math.random() < OFFICERS.traitChance ? pick(TRAITS) : null;
  return { id, name, role: pick(ROLES), baseTalent: talent, talent, trait, xp: 0, assignedTo: null, unique: false };
}

/** Prix d'engagement (or). */
export function officerPrice(o: Officer): number {
  const base = OFFICERS.price[Math.min(OFFICERS.price.length, o.baseTalent) - 1];
  return Math.round(base * (o.trait ? OFFICERS.traitPrice : 1));
}

/** Ce que l'officier apporte à son navire : sa fonction × son talent, plus son trait. */
export function officerEffect(o: Officer): StatEffect {
  const effect: StatEffect = {};
  const add = (e: StatEffect, scale: number) => {
    for (const key of Object.keys(e) as ModifierKey[]) effect[key] = (effect[key] ?? 0) + (e[key] ?? 0) * scale;
  };
  add(roleEffect(o), 1);
  if (o.trait) add(OFFICERS.traits[o.trait].effect, 1);
  return effect;
}

/** La part de sa fonction seule (× son talent), sans son trait. */
export function roleEffect(o: Officer): StatEffect {
  const effect: StatEffect = {};
  const perStar = OFFICERS.roles[o.role].perStar;
  for (const key of Object.keys(perStar) as ModifierKey[]) effect[key] = (perStar[key] ?? 0) * o.talent;
  return effect;
}

/** Victoires qu'il lui faut encore pour sa prochaine étoile, ou null s'il n'en gagnera plus. */
export function xpToNextStar(o: Officer): number | null {
  const earned = o.talent - o.baseTalent;
  if (earned >= OFFICERS.xpForStar.length || o.talent >= OFFICERS.maxTalent) return null;
  return OFFICERS.xpForStar[earned] - o.xp;
}

/** Avancement vers sa prochaine étoile : victoires faites depuis la précédente, et victoires qu'il faut ; null au maximum. */
export function starProgress(o: Officer): { done: number; needed: number } | null {
  const earned = o.talent - o.baseTalent;
  if (xpToNextStar(o) === null) return null;
  const previous = earned > 0 ? OFFICERS.xpForStar[earned - 1] : 0;
  return { done: o.xp - previous, needed: OFFICERS.xpForStar[earned] - previous };
}

/** Ajoute une victoire à son compte. Renvoie true s'il gagne une étoile. */
export function gainXp(o: Officer): boolean {
  o.xp++;
  const left = xpToNextStar(o);
  if (left === null || left > 0) return false;
  o.talent++;
  return true;
}

const LABELS: Record<ModifierKey, string> = {
  health: 'vie',
  speed: 'vitesse',
  turn: 'virage',
  reload: 'rechargement',
  spread: 'dispersion des tirs',
  range: 'portée',
  damage: 'dégâts des canons',
  repair: 'réparation en mer',
  loot: 'butin',
  hold: 'cale',
  ram: 'éperonnage',
  damageTaken: 'dégâts reçus',
  wind: 'effet du vent',
  radar: 'portée du radar',
};

/** « rechargement −8 % · dispersion des tirs −10 % » */
export function effectText(effect: StatEffect): string {
  return (Object.keys(effect) as ModifierKey[])
    .filter((k) => Math.abs(effect[k] ?? 0) > 1e-6)
    .map((k) => {
      const v = Math.round((effect[k] ?? 0) * 100);
      return `${LABELS[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)} %`;
    })
    .join(' · ');
}

/** « ★★ » : seulement les étoiles de talent. */
export const talentText = (talent: number) => '★'.repeat(talent);

/** Rang d'un navire (0 à 3 étoiles) selon ses victoires. */
export function rankOf(kills: number): number {
  let stars = 0;
  RANKS.levels.forEach((level, i) => {
    if (kills >= level.kills) stars = i;
  });
  return stars;
}

export const rankName = (stars: number) => RANKS.levels[stars].name;
