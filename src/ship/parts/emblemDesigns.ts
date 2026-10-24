import type { EmblemId } from '../../config';

/** Rouge = couleur principale, vert = seconde couleur (voir sailEmblem.ts). Toile de 128 × 128. */
const MAIN = '#ff0000';
const SECOND = '#00ff00';

type Pen = CanvasRenderingContext2D;

const circle = (g: Pen, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

const poly = (g: Pen, points: readonly (readonly [number, number])[]) => {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fill();
};

const stroke = (g: Pen, width: number, draw: () => void) => {
  g.lineWidth = width;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  draw();
  g.stroke();
};

/** Tête de mort sur deux os croisés (os et crâne en seconde couleur, orbites en principale). */
function skull(g: Pen) {
  g.strokeStyle = g.fillStyle = SECOND;
  stroke(g, 13, () => {
    g.moveTo(22, 104);
    g.lineTo(106, 30);
    g.moveTo(22, 30);
    g.lineTo(106, 104);
  });
  for (const [x, y] of [[20, 100], [26, 108], [108, 26], [100, 34], [20, 34], [26, 26], [108, 108], [100, 100]]) circle(g, x, y, 8);
  circle(g, 64, 58, 30);
  poly(g, [[46, 76], [82, 76], [78, 96], [50, 96]]);
  g.fillStyle = MAIN;
  circle(g, 52, 58, 9);
  circle(g, 76, 58, 9);
  poly(g, [[64, 68], [58, 80], [70, 80]]);
  for (const x of [54, 62, 70]) g.fillRect(x, 86, 4, 10);
}

/** Crâne d'or de Lagrange : tête de mort dans un anneau de pièces (anneau et crâne en seconde couleur). */
function goldSkull(g: Pen) {
  g.fillStyle = SECOND;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    circle(g, 64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52, 9);
  }
  circle(g, 64, 56, 30);
  poly(g, [[46, 74], [82, 74], [78, 94], [50, 94]]);
  g.fillStyle = MAIN;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    circle(g, 64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52, 3.5);
  }
  circle(g, 52, 56, 9);
  circle(g, 76, 56, 9);
  poly(g, [[64, 66], [58, 78], [70, 78]]);
  for (const x of [54, 62, 70]) g.fillRect(x, 84, 4, 10);
}

/** Deux sabres croisés : lames en seconde couleur, gardes et poignées en principale. */
function sabres(g: Pen) {
  for (const side of [1, -1]) {
    g.save();
    g.translate(64, 64);
    g.scale(side, 1);
    g.rotate(-Math.PI / 4);
    g.fillStyle = SECOND;
    g.beginPath();
    g.moveTo(-6, 30);
    g.quadraticCurveTo(-10, -20, 6, -58);
    g.quadraticCurveTo(2, -20, 6, 30);
    g.closePath();
    g.fill();
    g.fillStyle = MAIN;
    g.fillRect(-16, 28, 32, 7);
    g.fillRect(-4, 34, 9, 20);
    circle(g, 0, 56, 6);
    g.restore();
  }
}

/** Kraken : tête et tentacules en principale, yeux en seconde couleur. */
function kraken(g: Pen) {
  g.fillStyle = g.strokeStyle = MAIN;
  g.beginPath();
  g.ellipse(64, 40, 26, 30, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8;
    stroke(g, 8 - Math.abs(a) * 2, () => {
      g.moveTo(64 + Math.sin(a) * 16, 62);
      g.bezierCurveTo(64 + Math.sin(a) * 40, 84, 64 + Math.sin(a) * 70 - Math.sign(a) * 10, 92, 64 + Math.sin(a) * 52, 116);
    });
  }
  g.fillStyle = SECOND;
  circle(g, 54, 42, 6);
  circle(g, 74, 42, 6);
}

/** Serpent de mer en S : corps en principale, œil et ventre en seconde couleur. */
function serpent(g: Pen) {
  g.strokeStyle = MAIN;
  stroke(g, 16, () => {
    g.moveTo(30, 112);
    g.bezierCurveTo(110, 100, 110, 66, 64, 64);
    g.bezierCurveTo(18, 62, 18, 28, 92, 22);
  });
  g.fillStyle = MAIN;
  poly(g, [[86, 10], [112, 20], [88, 34]]);
  g.strokeStyle = SECOND;
  stroke(g, 3, () => {
    g.moveTo(34, 108);
    g.bezierCurveTo(104, 96, 104, 70, 64, 68);
  });
  g.fillStyle = SECOND;
  circle(g, 96, 21, 3);
}

/** Rose des vents : étoile à huit branches en principale, cercle et centre en seconde couleur. */
function compass(g: Pen) {
  g.strokeStyle = SECOND;
  stroke(g, 5, () => g.arc(64, 64, 38, 0, Math.PI * 2));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const r = i % 2 ? 34 : 56;
    g.fillStyle = MAIN;
    poly(g, [[64 + Math.sin(a) * r, 64 - Math.cos(a) * r], [64 + Math.sin(a + 0.4) * 10, 64 - Math.cos(a + 0.4) * 10], [64 + Math.sin(a - 0.4) * 10, 64 - Math.cos(a - 0.4) * 10]]);
  }
  g.fillStyle = SECOND;
  circle(g, 64, 64, 7);
}

/** Ancre : verge, jas et pattes en principale, organeau en seconde couleur. */
function anchor(g: Pen) {
  g.strokeStyle = MAIN;
  stroke(g, 10, () => {
    g.moveTo(64, 28);
    g.lineTo(64, 108);
    g.moveTo(40, 40);
    g.lineTo(88, 40);
    g.moveTo(26, 82);
    g.quadraticCurveTo(34, 112, 64, 110);
    g.quadraticCurveTo(94, 112, 102, 82);
  });
  g.fillStyle = MAIN;
  poly(g, [[18, 86], [34, 72], [32, 92]]);
  poly(g, [[110, 86], [94, 72], [96, 92]]);
  g.strokeStyle = SECOND;
  stroke(g, 6, () => g.arc(64, 18, 9, 0, Math.PI * 2));
}

/** Corbeau aux ailes déployées : silhouette en principale, œil en seconde couleur. */
function raven(g: Pen) {
  g.fillStyle = MAIN;
  poly(g, [[64, 40], [100, 22], [122, 34], [104, 46], [118, 52], [94, 60], [80, 70], [76, 100], [64, 116], [52, 100], [48, 70], [34, 60], [10, 52], [24, 46], [6, 34], [28, 22]]);
  g.beginPath();
  g.ellipse(64, 44, 11, 13, 0, 0, Math.PI * 2);
  g.fill();
  poly(g, [[60, 34], [64, 22], [68, 34]]);
  g.fillStyle = SECOND;
  circle(g, 68, 40, 3);
}

/** Sirène : silhouette en principale, chevelure en seconde couleur. */
function mermaid(g: Pen) {
  g.fillStyle = MAIN;
  circle(g, 60, 22, 11);
  g.beginPath();
  g.moveTo(52, 34);
  g.quadraticCurveTo(44, 60, 56, 76);
  g.quadraticCurveTo(70, 96, 58, 106);
  g.lineTo(76, 106);
  g.quadraticCurveTo(84, 90, 72, 74);
  g.quadraticCurveTo(80, 56, 68, 34);
  g.closePath();
  g.fill();
  poly(g, [[58, 104], [36, 120], [64, 112], [92, 120], [76, 104]]);
  g.strokeStyle = SECOND;
  stroke(g, 6, () => {
    g.moveTo(52, 18);
    g.quadraticCurveTo(40, 34, 46, 54);
    g.moveTo(68, 16);
    g.quadraticCurveTo(80, 30, 76, 50);
  });
}

/** Couronne de la Marine (livrée d'élite) : dorure en principale, contour et pierres en seconde couleur. */
function crown(g: Pen) {
  const shape = () => {
    g.beginPath();
    g.moveTo(24, 92);
    for (const [x, y] of [[18, 40], [42, 62], [64, 30], [86, 62], [110, 40], [104, 92]]) g.lineTo(x, y);
    g.closePath();
    g.rect(24, 92, 80, 16);
  };
  g.fillStyle = g.strokeStyle = SECOND;
  g.lineWidth = 9;
  g.lineJoin = 'round';
  shape();
  g.stroke();
  for (const [x, y] of [[18, 36], [64, 25], [110, 36]]) circle(g, x, y, 10);
  g.fillStyle = MAIN;
  shape();
  g.fill();
  for (const [x, y] of [[18, 36], [64, 25], [110, 36]]) circle(g, x, y, 6);
  g.fillStyle = SECOND;
  for (const x of [42, 64, 86]) circle(g, x, 100, 4.5);
}

const DESIGNS: Record<EmblemId | 'crown', (g: Pen) => void> = { skull, sabres, kraken, serpent, compass, anchor, raven, mermaid, crown, goldSkull };

/** Dessine le masque de l'emblème `id` (la texture est retournée à l'envoi : le haut du dessin est le haut de la voile). */
export function drawEmblem(g: Pen, id: EmblemId | 'crown') {
  DESIGNS[id](g);
}
