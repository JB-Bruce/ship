import { WAKE } from '../config';
import { WATERLINE_SAMPLES } from '../ship/parts/hullShape';

// Texture de traces : canal rouge = écume, canal vert = eau lissée (rides effacées derrière un bateau),
// canal bleu = eau qui frémit (rides fines et agitées au-dessus d'un banc de poissons), canal alpha = ombre d'une
// grande masse sous l'eau (le Kraken qui approche), qui s'efface vite.
// Elle couvre un carré de WAKE.areaSize mètres centré sur le joueur ; un texel = toujours le même point du monde.

/** Quad plein écran, sans caméra : les sommets sont déjà en coordonnées écran. */
export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Passe d'effacement : recopie l'image précédente décalée du déplacement du joueur (en texels entiers),
 * l'étale un peu (les traces s'élargissent) et la fait pâlir.
 */
export const FADE_FRAGMENT = /* glsl */ `
uniform sampler2D uPrevious;
uniform vec2 uShift;
uniform float uTexel;
uniform float uSpread;
uniform float uDecay;
uniform float uShadowDecay;
varying vec2 vUv;

vec4 previousAt(vec2 uv) {
  // Ce qui entre par le bord de la zone n'a pas d'historique.
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return texture2D(uPrevious, uv) * inside.x * inside.y;
}

void main() {
  vec2 uv = vUv + uShift;
  vec4 around = previousAt(uv + vec2(uTexel, 0.0)) + previousAt(uv - vec2(uTexel, 0.0))
    + previousAt(uv + vec2(0.0, uTexel)) + previousAt(uv - vec2(0.0, uTexel));
  vec4 c = previousAt(uv) * (1.0 - 4.0 * uSpread) + around * uSpread;
  gl_FragColor = vec4(max(c.rgb - uDecay, 0.0), max(c.a - uShadowDecay, 0.0));
}
`;

/**
 * Tampons : un quad par trace, placé dans le monde (centre, cap) puis projeté dans la zone de la texture.
 * Le motif est calculé dans le repère local : x = vers bâbord, y = vers l'avant (en mètres).
 */
export const STAMP_VERTEX = /* glsl */ `
attribute vec4 aPlace; // centre x, z, sinus et cosinus du cap
attribute vec4 aShape; // demi-largeur et demi-longueur du quad, type de trace, intensité
attribute vec4 aHull;  // demi-longueur et demi-largeur de coque (ou rayon), force, décalage du quad vers l'avant
attribute float aTurn; // virage du bateau (−1..1, positif = vers bâbord)
uniform vec2 uOrigin;
uniform float uHalfSize;
varying vec2 vLocal;
varying vec4 vShape;
varying vec4 vHull;
varying float vTurn;

void main() {
  vec2 local = position.xy * aShape.xy + vec2(0.0, aHull.w);
  // Avant = (sin, cos), bâbord = (cos, -sin).
  vec2 world = aPlace.xy + vec2(aPlace.w, -aPlace.z) * local.x + aPlace.zw * local.y;
  vLocal = local;
  vShape = aShape;
  vHull = aHull;
  vTurn = aTurn;
  gl_Position = vec4((world - uOrigin) / uHalfSize, 0.0, 1.0);
}
`;

export const STAMP_FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec4 vShape;
varying vec4 vHull;
varying float vTurn;

// Anneau d'écume de rayon r et d'épaisseur t, eau lissée à l'intérieur.
vec2 ring(float d, float r, float t) {
  return vec2(1.0 - smoothstep(0.0, t, abs(d - r)), 1.0 - smoothstep(r, r + t, d));
}

void main() {
  vec2 p = vLocal;
  float type = vShape.z;
  float k = vShape.w;
  vec2 trace;
  float shimmer = 0.0;
  float shadow = 0.0;
  if (type < 0.5) {
    // Bateau : deux fines traînées d'écume qui partent des coins de la poupe (là où la coque se resserre),
    // un remous au centre juste derrière, et de l'eau lissée sur la largeur du sillage (jamais devant la proue).
    float L = vHull.x;
    float W = vHull.y;
    float ax = abs(p.x);
    float corner = W * 0.72;
    float side = 1.0 - smoothstep(0.1, 0.35, abs(ax - corner));
    side *= smoothstep(-L * 1.05, -L * 0.95, p.y) * (1.0 - smoothstep(-L * 0.8, -L * 0.6, p.y));
    float wash = 1.0 - smoothstep(W * 0.3, W * 0.6, ax);
    wash *= smoothstep(-L - 2.2, -L - 1.0, p.y) * (1.0 - smoothstep(-L - 0.2, -L + 0.4, p.y));
    float calm = (1.0 - smoothstep(W * 0.9, W * 1.5, ax)) * smoothstep(-L - 3.0, -L - 1.5, p.y) * (1.0 - smoothstep(-L * 0.6, -L * 0.2, p.y));
    // En virage, le flanc extérieur pousse l'eau : sa traînée est plus forte, et il laisse une bande d'écume le long
    // de la coque (côté bâbord = x positif ; virage vers bâbord = vTurn positif, flanc extérieur = tribord).
    float outer = clamp(-vTurn * sign(p.x), 0.0, 1.0);
    side *= clamp(1.0 - 0.4 * vTurn * sign(p.x), 0.6, 1.25);
    // En virage, le flanc extérieur pousse l'eau sur le côté : une gerbe d'écume en éventail, de l'étrave au
    // tableau arrière, d'autant plus large que le virage est serré. Peinte à chaque image, elle laisse une
    // large traînée courbe sur l'extérieur du virage.
    float u = clamp(p.y / L, -1.0, 1.0);
    float hullHalf = W * sqrt(max(0.0, u > 0.0 ? 1.0 - u * u : 1.0 - u * u * u * u));
    float reach = 0.4 + 2.6 * outer;
    float fan = outer * smoothstep(hullHalf - 0.2, hullHalf + 0.1, ax) * (1.0 - smoothstep(hullHalf + 0.2, hullHalf + reach, ax));
    fan *= smoothstep(-L * 1.05, -L * 0.7, p.y) * (1.0 - smoothstep(L * 0.6, L * 0.9, p.y));
    trace = vec2(max(max(side * 0.75, wash * 0.5), fan * 0.8), calm * 0.8) * vHull.z;
  } else if (type < 1.5) {
    // Anneau (boulet tombé à l'eau, butin qui flotte).
    trace = ring(length(p), vHull.x, 0.9);
  } else if (type < 2.5) {
    // Naufrage : tache d'écume bouillonnante au contour irrégulier, différente pour chaque épave (graine vHull.z).
    // Quelques ondulations lentes et décalées, pas de branches régulières ; plus dense au centre, fondue au bord.
    float d = length(p);
    float a = atan(p.y, p.x);
    float s = vHull.z;
    float edge = vHull.x * (0.72 + 0.12 * sin(a * 2.0 + s) + 0.08 * sin(a * 3.0 - s * 1.7) + 0.05 * sin(a * 5.0 + s * 2.9));
    float churn = 0.75 + 0.25 * sin(p.x * 1.3 + s) * sin(p.y * 1.1 - s * 0.7);
    float blob = (1.0 - smoothstep(edge * 0.35, edge, d)) * churn;
    trace = vec2(blob * 0.95, 1.0 - smoothstep(edge * 0.6, edge * 1.1, d));
  } else if (type > 3.5) {
    // Grande masse sous l'eau (le Kraken) : une ombre allongée au bord flou qui ondule (demi-longueur vHull.x,
    // demi-largeur = celle du quad / 1,2, graine vHull.y, horloge vHull.z), et quelques bouillons qui crèvent au-dessus
    // d'elle ; l'eau y est lissée.
    vec2 q = p / vec2(vShape.x / 1.2, vHull.x);
    float a = atan(q.y, q.x);
    float wob = 1.0 + 0.1 * sin(a * 3.0 + vHull.z * 1.3 + vHull.y) + 0.06 * sin(a * 5.0 - vHull.z * 2.1);
    float d = length(q) / wob;
    shadow = 1.0 - smoothstep(0.35, 1.0, d);
    vec2 cell = floor(p * 0.35);
    float h = fract(sin(dot(cell + vHull.y, vec2(127.1, 311.7))) * 43758.5453);
    float phase = fract(vHull.z * (0.5 + 0.6 * h) + h * 7.0);
    float boil = (1.0 - smoothstep(0.08, 0.3, length(fract(p * 0.35) - 0.5))) * step(0.7, h) * (1.0 - smoothstep(0.15, 0.4, phase));
    trace = vec2(boil * shadow, shadow * 0.7);
  } else {
    // Banc de poissons : des bouillons qui naissent et s'éteignent un peu partout, à un endroit nouveau à chaque
    // fois (graine vHull.y, horloge vHull.z), plus serrés au centre. L'eau n'y est pas lissée : elle frémit (bleu).
    vec2 q = p * 0.5;
    vec2 cell = floor(q);
    float h = fract(sin(dot(cell + vHull.y, vec2(127.1, 311.7))) * 43758.5453);
    float cycle = vHull.z * (0.6 + 0.5 * h) + h * 9.0;
    float n = floor(cycle);
    float phase = fract(cycle);
    vec2 spot = vec2(fract(sin(dot(cell + n, vec2(12.9898, 78.233))) * 43758.5453), fract(sin(dot(cell - n, vec2(39.35, 11.13))) * 24634.6345));
    float bubble = 1.0 - smoothstep(0.1, 0.22 + 0.12 * phase, length(fract(q) - 0.2 - 0.6 * spot));
    bubble *= step(0.45, h) * (1.0 - smoothstep(0.2, 0.45, phase));
    float inside = 1.0 - smoothstep(0.45, 1.0, length(p) / vHull.x);
    trace = vec2(bubble * inside, 0.0);
    shimmer = (1.0 - smoothstep(0.6, 1.0, length(p) / vHull.x)) * 0.9;
  }
  gl_FragColor = vec4(trace * k, shimmer * k, shadow * k);
}
`;

/**
 * Lecture des traces dans le shader de l'océan : texture de traces, plus un liseré d'écume collé à la coque
 * des bateaux proches, calculé à partir de leur position (net, et toujours bien placé).
 */
export const WAKE_GLSL = /* glsl */ `
#define MAX_WAKE_SHIPS ${WAKE.maxShips}
uniform sampler2D uWakeMap;
uniform vec3 uWakeArea;                     // origine x, z de la zone et côté (m)
uniform vec4 uWakeShips[MAX_WAKE_SHIPS];    // x, z, sinus et cosinus du cap
uniform vec4 uWakeHulls[MAX_WAKE_SHIPS];    // demi-longueur, demi-largeur, force (selon la vitesse), virage (−1..1)
uniform vec4 uWakeAttitudes[MAX_WAKE_SHIPS]; // hauteur de la flottaison, sinus du tangage et du roulis, tirant d'eau
uniform int uWakeCount;
// Demi-largeur de chaque coque à la flottaison, en ${WATERLINE_SAMPLES} points de la poupe à la proue (2 vec4 par bateau).
uniform vec4 uWakeProfiles[MAX_WAKE_SHIPS * 2];

float waterlineAt(int ship, float u) {
  vec4 a = uWakeProfiles[ship * 2];
  vec4 b = uWakeProfiles[ship * 2 + 1];
  float samples[8] = float[8](a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
  float f = clamp((u + 1.0) * 3.5, 0.0, 6.999);
  int k = int(f);
  return mix(samples[k], samples[k + 1], f - float(k));
}

/** (écume, eau lissée, frémissement, ombre sous l'eau) laissés par les bateaux, boulets, naufrages, butin, bancs, Kraken. */
vec4 wakeTrace(vec2 p) {
  vec2 uv = (p - uWakeArea.xy) / uWakeArea.z + 0.5;
  // Les traces s'estompent au bord de la zone au lieu d'être coupées net.
  float edge = 1.0 - smoothstep(0.4, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
  return texture2D(uWakeMap, uv) * edge;
}

/**
 * Liseré d'écume collé à la coque, qui épouse sa vraie forme à la flottaison (uWakeProfiles).
 * En route : des paquets d'écume glissent le long du bordé vers l'arrière, marqués contre l'étrave, effacés avant la
 * poupe (rien devant l'étrave) ; un peu plus larges sur le flanc extérieur d'un virage. À l'arrêt : un liseré pâle
 * et discontinu fait le tour de la coque et « respire », comme l'eau qui clapote contre le bois.
 * Il suit l'assiette de la coque (uWakeAttitudes) : là où elle est soulevée au-dessus de l’eau waterY (proue levée
 * par une vague, flanc qui roule), il se resserre vers la quille puis s'efface ; là où elle s'enfonce, il s'élargit un peu.
 * Utilise uRipples (bruit) : à inclure après sa déclaration.
 */
float hullFoam(vec2 p, float waterY, float time) {
  float foam = 0.0;
  for (int i = 0; i < MAX_WAKE_SHIPS; i++) {
    if (i >= uWakeCount) break;
    vec4 s = uWakeShips[i];
    vec4 h = uWakeHulls[i];
    vec2 d = p - s.xy;
    float along = dot(d, s.zw);
    float lateral = d.x * s.w - d.y * s.z; // positif = bâbord
    float across = abs(lateral);
    if (abs(along) > h.x + 1.0 || across > h.y + 1.0) continue;
    // Hauteur de la flottaison de la coque à cet endroit au-dessus de l'eau (positive = coque soulevée).
    // Le tirant d'eau suit la largeur de la coque : l'étrave, fine, est aussi peu profonde.
    vec4 a = uWakeAttitudes[i];
    float u = clamp(along / h.x, -1.0, 1.0);
    float waterline = waterlineAt(i, u);
    float draft = a.w * clamp(waterline / h.y * 1.2, 0.15, 1.0);
    float lift = a.x + clamp(along, -h.x, h.x) * a.y + lateral * a.z - waterY;
    float contact = 1.0 - smoothstep(0.2, 1.0, lift / draft);
    if (contact <= 0.0) continue;
    // Distance au bord de la coque à la flottaison (vue de dessus) ; derrière, le tableau arrière est plat.
    float halfWidth = waterline * clamp(1.0 - 0.6 * lift / draft, 0.35, 1.15);
    float edge = along > h.x ? length(vec2(along - h.x, across))
      : along < -h.x ? length(vec2(-h.x - along, max(across - halfWidth, 0.0)))
      : across - halfWidth;

    // En route : l'écume défile le long de la coque (bruit pris dans le repère du bateau). Le bord extérieur est
    // fondu et irrégulier (pas de ruban à bord net) : l'écume s'éclaircit en s'éloignant de la coque.
    float outer = clamp(-h.w * sign(lateral), 0.0, 1.0);
    // Une grande coque pousse une bande d'écume plus large (sinon, un trait fin le long d'un galion).
    float big = clamp(h.y / ${WAKE.foamWidthRef.toFixed(2)}, 1.0, ${WAKE.foamWidthMax.toFixed(2)});
    float flow = texture2D(uRipples, vec2(along + time * (1.5 + 8.0 * h.z), lateral * 2.0 + float(i) * 7.0) * 0.23).a;
    float spread = (0.2 + 0.18 * (1.0 - u)) * (1.0 + 0.6 * outer) * big;
    float rough = edge + (flow - 0.5) * spread * 1.2;
    // Bord intérieur fondu sous la coque, bord extérieur déchiqueté : jamais un ruban net.
    float band = smoothstep(-0.25, 0.05, edge) * exp(-max(rough, 0.0) / spread);
    // Devant l'étrave, l'écume contourne la pointe puis s'éteint en douceur (ni coupure nette, ni traits devant).
    float run = smoothstep(-0.5, 0.2, u) * (1.0 - smoothstep(h.x - 0.2, h.x + 0.5, along));
    float chunks = 0.15 + 0.85 * smoothstep(0.35, 0.7, flow);
    float turn = clamp(1.0 - 0.6 * h.w * sign(lateral), 0.5, 1.4);
    float moving = band * run * chunks * turn * h.z;

    // À l'arrêt : un clapotis qui s'éclaircit en s'éloignant de la coque, et qui va et vient par endroits
    // (vagues qui longent la coque, bruit qui dérive) au lieu de s'allumer partout à la fois.
    float near = smoothstep(-0.2, 0.05, edge) * exp(-max(edge, 0.0) / (0.3 * big));
    float lap = texture2D(uRipples, vec2(along * 1.3 + time * 0.15, lateral * 1.3 + float(i) * 3.0) * 0.35).a;
    float breath = 0.5 + 0.5 * sin(time * 1.3 + along * 0.9 + sign(lateral) * 1.7 + float(i) * 2.1);
    float still = near * smoothstep(0.4, 0.8, lap * (0.6 + 0.6 * breath)) * (1.0 - h.z) * ${WAKE.idleFoam.toFixed(2)};

    foam = max(foam, max(moving, still) * contact);
  }
  return foam;
}
`;
