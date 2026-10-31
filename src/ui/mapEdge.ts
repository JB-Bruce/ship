import { MAP_EDGE, WORLD_EDGE } from '../config';
import { fractalNoise } from '../utils/noise';
import { INK } from './mapGlyphs';

/** Graine du bruit qui fait onduler le bout de la carte. */
const EDGE_SEED = 61;
/** Points du contour ondulé (sur tout le tour). */
const EDGE_STEPS = 240;

/**
 * Le bord du monde sur une carte : toujours son trait en tirets ; avec les territoires (`shaded`), tout ce qui est au-delà
 * est peint du gris de la tempête, avec une limite floue et ondulée, plus foncée sur son bord, comme le bout d'une
 * vieille carte. Dessiné par-dessus la brume.
 */
export function paintWorldEdge(ctx: CanvasRenderingContext2D, toX: (x: number) => number, toY: (z: number) => number, scale: number, width: number, height: number, shaded: boolean) {
  const [cx, cz] = WORLD_EDGE.center;
  const r = WORLD_EDGE.radius;
  ctx.save();
  if (shaded) {
    // Contour ondulé, toujours au-delà du trait (le bruit ne fait que repousser la limite vers le large).
    const edge = new Path2D();
    for (let i = 0; i <= EDGE_STEPS; i++) {
      const a = (i / EDGE_STEPS) * Math.PI * 2;
      const ex = cx + Math.sin(a) * r;
      const ez = cz + Math.cos(a) * r;
      const reach = r + MAP_EDGE.wobble * (0.5 + 0.5 * fractalNoise(ex, ez, MAP_EDGE.octaves, EDGE_SEED));
      const px = toX(cx + Math.sin(a) * reach);
      const py = toY(cz + Math.cos(a) * reach);
      if (i === 0) edge.moveTo(px, py);
      else edge.lineTo(px, py);
    }
    edge.closePath();
    const outside = new Path2D();
    outside.rect(-MAP_EDGE.blur * 4, -MAP_EDGE.blur * 4, width + MAP_EDGE.blur * 8, height + MAP_EDGE.blur * 8);
    outside.addPath(edge);
    ctx.filter = `blur(${MAP_EDGE.blur}px)`;
    ctx.fillStyle = MAP_EDGE.color;
    ctx.fill(outside, 'evenodd');
    // Le pigment s'accumule au bord du lavis.
    ctx.strokeStyle = MAP_EDGE.rim;
    ctx.lineWidth = MAP_EDGE.rimWidth;
    ctx.stroke(edge);
    ctx.filter = 'none';
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(toX(cx), toY(cz), r * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
