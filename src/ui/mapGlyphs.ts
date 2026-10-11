import type { LandmarkKind } from '../world/landmarks';
import type { Wind } from '../world/wind';

/** Encre de la carte. */
export const INK = '#4a2e14';
/** Côté où s'écrit le nom de chaque lieu, pour que les noms voisins ne se chevauchent pas. */
const LABEL_SIDE: Record<LandmarkKind, 'left' | 'right' | 'below'> = { fort: 'left', lighthouse: 'right', port: 'below' };

/** Icône et nom d'un lieu. */
export function paintLandmark(ctx: CanvasRenderingContext2D, kind: LandmarkKind, name: string, x: number, y: number) {
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (kind === 'port') {
    // Ancre : anneau, verge, jas et bras recourbés.
    ctx.arc(x, y - 7, 2.2, 0, Math.PI * 2);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 7);
    ctx.moveTo(x - 4, y - 2);
    ctx.lineTo(x + 4, y - 2);
    ctx.moveTo(x - 6, y + 2);
    ctx.quadraticCurveTo(x - 5, y + 7, x, y + 7);
    ctx.quadraticCurveTo(x + 5, y + 7, x + 6, y + 2);
    ctx.stroke();
  } else if (kind === 'fort') {
    // Muraille crénelée.
    ctx.moveTo(x - 7, y + 6);
    ctx.lineTo(x - 7, y - 5);
    for (let i = 0; i < 4; i++) {
      const cx = x - 7 + i * 3.5;
      ctx.lineTo(cx, y - 7);
      ctx.lineTo(cx + 1.75, y - 7);
      ctx.lineTo(cx + 1.75, y - 5);
      ctx.lineTo(cx + 3.5, y - 5);
    }
    ctx.lineTo(x + 7, y + 6);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Phare : tour effilée et rayons de lumière.
    ctx.moveTo(x - 3.5, y + 7);
    ctx.lineTo(x - 2, y - 4);
    ctx.lineTo(x + 2, y - 4);
    ctx.lineTo(x + 3.5, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const a of [-0.5, 0, 0.5]) {
      ctx.moveTo(x - 4 * Math.cos(a), y - 6 + 4 * Math.sin(a));
      ctx.lineTo(x - 10 * Math.cos(a), y - 6 + 10 * Math.sin(a));
      ctx.moveTo(x + 4 * Math.cos(a), y - 6 + 4 * Math.sin(a));
      ctx.lineTo(x + 10 * Math.cos(a), y - 6 + 10 * Math.sin(a));
    }
    ctx.stroke();
  }
  ctx.font = "italic 14px 'IM Fell English', Georgia, serif";
  const side = LABEL_SIDE[kind];
  ctx.textAlign = side === 'left' ? 'right' : side === 'right' ? 'left' : 'center';
  ctx.textBaseline = side === 'below' ? 'top' : 'middle';
  ctx.fillText(name, x + (side === 'left' ? -11 : side === 'right' ? 11 : 0), y + (side === 'below' ? 10 : 0));
}

/** Navire vu de dessus : une flèche orientée selon son cap (nord en haut, ouest à gauche). */
export function paintShip(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, size: number, color: string) {
  const dx = -Math.sin(heading);
  const dy = -Math.cos(heading);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255, 245, 220, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + dx * size, y + dy * size);
  ctx.lineTo(x - dx * size * 0.7 - dy * size * 0.6, y - dy * size * 0.7 + dx * size * 0.6);
  ctx.lineTo(x - dx * size * 0.35, y - dy * size * 0.35);
  ctx.lineTo(x - dx * size * 0.7 + dy * size * 0.6, y - dy * size * 0.7 - dx * size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Rose des vents (N, E, S, O) et flèche du vent, avec sa force. */
export function paintCompass(ctx: CanvasRenderingContext2D, x: number, y: number, wind: Wind) {
  const r = 26;
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Étoile à quatre branches : pointe vers chaque direction, base étroite autour du centre.
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.moveTo(x + Math.sin(a - Math.PI / 4) * 5, y - Math.cos(a - Math.PI / 4) * 5);
    ctx.lineTo(x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3));
    ctx.lineTo(x + Math.sin(a + Math.PI / 4) * 5, y - Math.cos(a + Math.PI / 4) * 5);
    ctx.lineTo(x, y);
  }
  ctx.fill();
  ctx.font = "bold 13px 'IM Fell English', Georgia, serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, a] of [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['O', -Math.PI / 2]] as const) {
    ctx.fillText(label, x + Math.sin(a) * (r + 10), y - Math.cos(a) * (r + 10));
  }

  // Vent : la flèche part d'où il vient et pointe vers où il va.
  const wx = -Math.sin(wind.direction);
  const wy = -Math.cos(wind.direction);
  const length = 14 + 16 * wind.strength;
  const cy = y + r + 42;
  ctx.strokeStyle = ctx.fillStyle = '#2d5d78';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - wx * length, cy - wy * length);
  ctx.lineTo(x + wx * (length - 6), cy + wy * (length - 6));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + wx * (length + 4), cy + wy * (length + 4));
  ctx.lineTo(x + wx * (length - 6) - wy * 6, cy + wy * (length - 6) + wx * 6);
  ctx.lineTo(x + wx * (length - 6) + wy * 6, cy + wy * (length - 6) - wx * 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = "italic 13px 'IM Fell English', Georgia, serif";
  ctx.fillText(`Vent ${wind.knots} nœuds`, x, cy + 36);
}

/** Échelle : une barre de `step` mètres. */
export function paintScale(ctx: CanvasRenderingContext2D, x: number, y: number, step: number, scale: number) {
  const length = step * scale;
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.lineTo(x + length, y - 4);
  ctx.stroke();
  ctx.font = "13px 'IM Fell English', Georgia, serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(step >= 1000 ? `${step / 1000} km` : `${step} m`, x + length / 2, y - 5);
}
