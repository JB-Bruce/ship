import { sound } from '../audio/sound';

/**
 * Écran d'accueil, au lancement : le navigateur n'autorise le son qu'après un geste du joueur. « Larguer les amarres »
 * allume le son (et la musique du port), puis rend la main au jeu (`onStart` : reprendre la barre, souris capturée).
 * Le monde vit déjà derrière.
 */
export function showWelcome(parent: HTMLElement, onStart: () => void) {
  const root = document.createElement('div');
  root.className = 'welcome';
  root.innerHTML = `
    <div class="welcome-card">
      <h1>Pirate’s life</h1>
      <p class="welcome-sub">Au temps des flibustiers</p>
      <button class="welcome-go">Larguer les amarres</button>
      <p class="welcome-hint">Le son s’allume en larguant les amarres. Échap : paramètres et volumes.</p>
    </div>`;
  parent.appendChild(root);
  document.body.classList.add('welcome-open');
  const start = () => {
    void sound.unlock();
    root.remove();
    document.body.classList.remove('welcome-open');
    removeEventListener('keydown', onKey, true);
    onStart();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    e.stopPropagation();
    start();
  };
  root.querySelector('.welcome-go')!.addEventListener('click', start);
  addEventListener('keydown', onKey, true);
}
