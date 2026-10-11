/** Une commande proposée à l'écran : touche + libellé, cliquable. */
interface Prompt {
  readonly button: HTMLButtonElement;
  readonly label: HTMLElement;
  text: string | null;
}

/**
 * Commandes contextuelles en bas de l'écran : « E · Port de la Tortue » près du quai, « F · Pêcher » près d'un
 * banc, et une ligne d'état (pêche en cours). Cliquer revient à presser la touche.
 */
export class ActionPrompts {
  private readonly port: Prompt;
  private readonly fish: Prompt;
  private readonly status: HTMLElement;
  private statusText: string | null = null;

  constructor(parent: HTMLElement, onPort: () => void, onFish: () => void) {
    const root = document.createElement('div');
    root.className = 'action-prompts';
    this.status = document.createElement('div');
    this.status.className = 'action-status';
    this.port = this.prompt('E', onPort);
    this.fish = this.prompt('F', onFish);
    root.append(this.status, this.port.button, this.fish.button);
    parent.appendChild(root);
  }

  /** Libellés à afficher (null = commande cachée) et état de la pêche. */
  update(port: string | null, fish: string | null, status: string | null) {
    this.set(this.port, port);
    this.set(this.fish, fish);
    if (status === this.statusText) return;
    this.statusText = status;
    this.status.textContent = status ?? '';
    this.status.classList.toggle('on', status !== null);
  }

  private prompt(key: string, action: () => void): Prompt {
    const button = document.createElement('button');
    button.className = 'action-prompt';
    button.innerHTML = `<kbd>${key}</kbd><span></span>`;
    // Le clic ne doit pas laisser le focus sur le bouton (Espace / Entrée le relanceraient).
    button.addEventListener('click', () => {
      button.blur();
      action();
    });
    return { button, label: button.querySelector('span')!, text: null };
  }

  private set(prompt: Prompt, text: string | null) {
    if (text === prompt.text) return;
    prompt.text = text;
    if (text !== null) prompt.label.textContent = text;
    prompt.button.classList.toggle('on', text !== null);
  }
}
