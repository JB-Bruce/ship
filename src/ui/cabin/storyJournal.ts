import { CHARACTERS } from '../../story/characters';
import type { MainQuest } from '../../story/mainQuest';
import { storyEntries, storyPeople } from '../../story/storyLog';

/**
 * Le Journal suit la trame principale, « Le Cœur des Abysses » : l'objectif en cours sous un sceau de cire, puis le
 * carnet des étapes franchies (écrit selon les choix faits dans les conversations), et les personnages rencontrés.
 */
export function storyJournalHtml(quest: MainQuest): string {
  const [goal] = quest.objectives();
  const entries = storyEntries(quest)
    .reverse()
    .map((e) => `<article class="cabin-story-page"><h3>${e.title}</h3><p>${e.text}</p></article>`)
    .join('');
  const people = storyPeople(quest)
    .map((id) => `<span class="cabin-story-person"><b>${CHARACTERS[id].name}</b><i>${CHARACTERS[id].title}</i></span>`)
    .join('');
  const current = goal
    ? `<div class="cabin-story-goal"><span class="cabin-story-seal">⚓</span><div><b>${goal.title.replace(/^⚓\s*/, '')}</b><span>${goal.note}</span></div></div>`
    : '<p class="cabin-muted">L’histoire n’a pas encore commencé.</p>';
  return `
    <section class="cabin-story">
      <div class="cabin-section-head"><h2>Le Cœur des Abysses</h2><span>Histoire principale</span></div>
      ${current}
      <div class="cabin-story-book">${entries || '<p class="cabin-muted">Rien d’écrit pour l’instant.</p>'}</div>
      ${quest.flags.has('isaurePiece') ? '<div class="cabin-story-people"><span class="cabin-muted">Carte de Lagrange</span><span class="cabin-story-person"><b>🗺 1 morceau</b><i>celui d’Isaure : les récifs au-delà des tempêtes</i></span></div>' : ''}
      ${people ? `<div class="cabin-story-people"><span class="cabin-muted">Rencontres</span>${people}</div>` : ''}
    </section>`;
}
