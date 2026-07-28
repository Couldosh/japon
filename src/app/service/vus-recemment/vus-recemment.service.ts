import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'vus_recemment';
const MAX_ENTREES = 15;

@Injectable({ providedIn: 'root' })
export class VusRecemmentService {
  private readonly ids = signal<readonly string[]>(this.lireIds());

  /** Ids des lieux consultés récemment, du plus récent au plus ancien. */
  readonly idsRecents = this.ids.asReadonly();

  /** À appeler à chaque ouverture de la popup de détail d'un lieu. */
  marquerVu(id: string): void {
    const sansDoublon = this.ids().filter(existant => existant !== id);
    const nouveaux = [id, ...sansDoublon].slice(0, MAX_ENTREES);
    this.ids.set(nouveaux);
    this.sauvegarder(nouveaux);
  }

  private lireIds(): string[] {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? JSON.parse(stocke) : [];
    } catch {
      return [];
    }
  }

  private sauvegarder(ids: readonly string[]): void {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(ids));
    } catch {
      // Best-effort : un historique de consultation qui ne persiste pas n'est pas bloquant.
    }
  }
}
