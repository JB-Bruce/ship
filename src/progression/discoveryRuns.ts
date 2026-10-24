/** Réglages d'une grille de découverte, écrits en tête de sa sauvegarde : une grille relue avec d'autres réglages est refaite. */
export interface GridHeader {
  cell: number;
  size: number;
  originX: number;
  originZ: number;
}

/** Une grille relue : découverte ou non au point (x, z) du monde. */
export interface DecodedGrid {
  at(x: number, z: number): boolean;
}

/** Marque du format (à changer si le format change). */
const FORMAT = 'd1';

/**
 * Grille de découverte en texte compact : en tête ses réglages, puis, en base64, la longueur de chaque suite de cases
 * égales (d'abord des cases inconnues, puis découvertes, en alternance), case après case, rangée après rangée, chaque
 * longueur sur 7 bits par octet (le bit de poids fort annonce un octet de plus). Une zone découverte d'un seul tenant
 * ne coûte que deux longueurs par rangée.
 */
export function encodeRuns(known: Uint8Array, h: GridHeader): string {
  const bytes: number[] = [];
  let value = 0;
  let run = 0;
  for (let i = 0; i < known.length; i++) {
    if (known[i] === value) {
      run++;
      continue;
    }
    pushLength(bytes, run);
    value = known[i];
    run = 1;
  }
  pushLength(bytes, run);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.slice(i, i + 8192));
  return [FORMAT, h.cell, h.size, h.originX, h.originZ, btoa(text)].join(';');
}

/** Relit une grille écrite par `encodeRuns`, ou null si le texte est illisible. */
export function decodeRuns(data: string): DecodedGrid | null {
  const parts = data.split(';');
  if (parts.length !== 6 || parts[0] !== FORMAT) return null;
  const [cell, size, originX, originZ] = parts.slice(1, 5).map(Number);
  if (!(cell > 0) || !Number.isInteger(size) || size <= 0 || !Number.isFinite(originX) || !Number.isFinite(originZ)) return null;
  let text: string;
  try {
    text = atob(parts[5]);
  } catch {
    return null;
  }
  const known = new Uint8Array(size * size);
  let i = 0;
  let value = 0;
  let length = 0;
  let shift = 0;
  for (let k = 0; k < text.length; k++) {
    const byte = text.charCodeAt(k);
    length += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if (byte & 0x80) continue;
    if (i + length > known.length) return null;
    if (value) known.fill(1, i, i + length);
    i += length;
    value = 1 - value;
    length = shift = 0;
  }
  if (i !== known.length) return null;
  return {
    at(x, z) {
      const c = Math.floor((x - originX) / cell);
      const r = Math.floor((z - originZ) / cell);
      return c >= 0 && r >= 0 && c < size && r < size && known[r * size + c] === 1;
    },
  };
}

function pushLength(bytes: number[], length: number) {
  while (length >= 0x80) {
    bytes.push((length & 0x7f) | 0x80);
    length = Math.floor(length / 0x80);
  }
  bytes.push(length);
}
