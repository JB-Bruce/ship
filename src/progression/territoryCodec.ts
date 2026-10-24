/** Réglages de la grille, écrits en tête : une sauvegarde d'une autre grille est refusée (on repart du partage de départ). */
export interface TerritoryHeader {
  cell: number;
  size: number;
  originX: number;
  originZ: number;
}

/** Marque du format (à changer si le format change). */
const FORMAT = 't1';

/**
 * Territoires en texte compact : en tête les réglages de la grille, puis, en base64, chaque suite de cases du même camp,
 * case après case, rangée après rangée : un octet pour le camp, puis sa longueur sur 7 bits par octet (le bit de poids
 * fort annonce un octet de plus).
 */
export function encodeOwners(owner: Uint8Array, h: TerritoryHeader): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < owner.length) {
    const value = owner[i];
    let run = 0;
    while (i < owner.length && owner[i] === value) {
      run++;
      i++;
    }
    bytes.push(value);
    for (; run >= 0x80; run = Math.floor(run / 0x80)) bytes.push((run & 0x7f) | 0x80);
    bytes.push(run);
  }
  let text = '';
  for (let k = 0; k < bytes.length; k += 8192) text += String.fromCharCode(...bytes.slice(k, k + 8192));
  return [FORMAT, h.cell, h.size, h.originX, h.originZ, btoa(text)].join(';');
}

/** Relit un texte d'`encodeOwners` pour la grille `h`, ou null s'il est illisible ou d'une autre grille. */
export function decodeOwners(data: string, h: TerritoryHeader): Uint8Array | null {
  const parts = data.split(';');
  if (parts.length !== 6 || parts[0] !== FORMAT) return null;
  const [cell, size, originX, originZ] = parts.slice(1, 5).map(Number);
  if (cell !== h.cell || size !== h.size || originX !== h.originX || originZ !== h.originZ) return null;
  let text: string;
  try {
    text = atob(parts[5]);
  } catch {
    return null;
  }
  const owner = new Uint8Array(size * size);
  let i = 0;
  let k = 0;
  while (k < text.length) {
    const value = text.charCodeAt(k++);
    if (value > 2) return null;
    let length = 0;
    let shift = 0;
    for (;;) {
      if (k >= text.length) return null;
      const byte = text.charCodeAt(k++);
      length += (byte & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    if (i + length > owner.length) return null;
    owner.fill(value, i, i + length);
    i += length;
  }
  return i === owner.length ? owner : null;
}
