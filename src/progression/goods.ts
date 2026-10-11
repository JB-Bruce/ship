/** Marchandises qu'on range dans la cale des navires (le bois et l'or, eux, vont dans la réserve commune). */
export type Good = 'fish' | 'rum' | 'spices';
export const GOODS: readonly Good[] = ['fish', 'rum', 'spices'];

/** Contenu d'une cale : nombre d'unités par marchandise (une unité = une place). */
export type Cargo = Record<Good, number>;

export const GOOD_NAMES: Record<Good, { one: string; many: string }> = {
  fish: { one: 'poisson', many: 'poissons' },
  rum: { one: 'tonneau de rhum', many: 'tonneaux de rhum' },
  spices: { one: "caisse d'épices", many: "caisses d'épices" },
};

/** « 1 poisson », « 12 poissons ». */
export function goodText(good: Good, amount: number): string {
  return `${amount} ${amount > 1 ? GOOD_NAMES[good].many : GOOD_NAMES[good].one}`;
}

export function emptyCargo(): Cargo {
  return { fish: 0, rum: 0, spices: 0 };
}

export function cargoTotal(cargo: Cargo): number {
  return cargo.fish + cargo.rum + cargo.spices;
}
