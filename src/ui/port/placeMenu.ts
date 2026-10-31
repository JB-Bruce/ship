import { hideTip } from '../kit/tooltip';
import { ParchmentMenu } from '../parchmentMenu';
import { audioPlaces } from '../../audio/audioView';

/**
 * Un lieu du port (Chantier, Taverne…) : il s'ouvre depuis le panneau du port, sans touche à lui, et Échap (ou son
 * bouton de retour) y ramène. `opened` / `closed` : ce que le lieu fait à l'ouverture et à la fermeture.
 */
export abstract class PlaceMenu extends ParchmentMenu {
  constructor(
    parent: HTMLElement,
    title: string,
    /** Retour au panneau du port. */
    private readonly back: () => void,
  ) {
    super(parent, title, 'Échap : retour au port', []);
  }

  setOpen(open: boolean) {
    const opening = open && !this.isOpen;
    const closing = this.isOpen && !open;
    if (opening) this.opened();
    super.setOpen(open);
    if (opening) audioPlaces.port = true;
    if (!closing) return;
    audioPlaces.port = false;
    hideTip();
    this.closed();
    // Fermé par Échap (aucun autre menu ne s'ouvre à sa place) : retour au panneau du port.
    queueMicrotask(() => {
      if (!ParchmentMenu.anyOpen()) this.back();
    });
  }

  /** Juste avant l'ouverture (remise à zéro des choix). */
  protected opened() {}
  /** Juste après la fermeture. */
  protected closed() {}
}
