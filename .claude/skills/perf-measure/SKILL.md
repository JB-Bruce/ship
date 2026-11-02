---
name: perf-measure
description: Mesure le temps GPU d'une image du jeu (requêtes EXT_disjoint_timer_query_webgl2) et compare deux variantes A/B dans la même session de navigateur. À utiliser pour savoir si un changement de rendu (shader de l'eau, effets, résolution, réglages graphiques) coûte ou fait gagner du temps.
argument-hint: <ce qu'on compare> (ex. « liseré d'écume activé / désactivé »)
---

# Mesurer le coût GPU : $ARGUMENTS

Les temps « réels » (FPS, intervalle entre images) ne valent rien ici : le rAF est gelé quand le panneau du navigateur est masqué, et la puce graphique change de vitesse. On mesure donc le **temps GPU** avec des requêtes de temps, en **A/B dans la même session**, en alternant plusieurs fois.

## Démarche
1. Lancer le jeu (`npm run dev`, port 5173 ; s'il est déjà pris, ouvrir directement l'adresse) avec `?debug` : `http://localhost:5173/?debug`. `window.game` est alors exposé.
2. Placer la scène à mesurer (même position de caméra, même météo pour A et B ; la météo se choisit avec les boutons de temps).
3. Coller le script ci-dessous dans la console, puis mesurer en alternant : `await gpuTime('A')`, basculer la variante (réglage du panneau lil-gui, `game.…`, menu Échap > Graphismes), `await gpuTime('B')`, puis A, puis B. Garder la médiane de chaque série.
4. Recharger la page à la fin (le script coupe la boucle d'animation et la résolution dynamique).

Si l'extension manque (certains navigateurs ou GPU), le dire plutôt que de se rabattre sur des FPS.

## Script

```js
// Temps GPU moyen et médian (ms) de tous les rendus d'une image, sur `frames` images simulées.
// La résolution dynamique est coupée (elle a sa propre requête de temps et changerait la résolution entre A et B).
async function gpuTime(label, frames = 150, warmup = 20) {
  const r = game.renderer, gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) throw new Error('EXT_disjoint_timer_query_webgl2 indisponible');
  game.display.apply({ ...game.display.settings, dynamicResolution: false });
  r.setAnimationLoop(null);
  const render = r.render, pending = [], perFrame = new Map(), yieldToBrowser = () => new Promise((ok) => setTimeout(ok, 0));
  let frame = 0;
  r.render = function (scene, camera) {
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    render.call(this, scene, camera);
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push({ q, frame });
  };
  const collect = () => {
    while (pending.length && gl.getQueryParameter(pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, frame: f } = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && f >= warmup) perFrame.set(f, (perFrame.get(f) ?? 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
  };
  let t = performance.now();
  try {
    for (frame = 0; frame < warmup + frames; frame++) {
      game.frame((t += 1000 / 60));
      await yieldToBrowser(); // les résultats n'arrivent qu'entre deux images
      collect();
    }
    for (let i = 0; i < 200 && pending.length; i++) { await yieldToBrowser(); collect(); }
  } finally {
    r.render = render;
  }
  const ms = [...perFrame.values()].sort((a, b) => a - b);
  const mean = ms.reduce((s, v) => s + v, 0) / ms.length;
  const result = { label, images: ms.length, moyenne: +mean.toFixed(3), médiane: +ms[ms.length >> 1].toFixed(3), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(3) };
  console.table([result]);
  return result;
}
```

## Rapport
Un tableau A/B (médiane, moyenne, p90 en ms GPU par image, nombre d'images), l'écart en ms et en %, et les conditions (scène, météo, résolution, anticrénelage). Un écart de moins de ~3 % entre séries alternées est du bruit.
