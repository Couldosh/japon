import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'favoris';

@Injectable({ providedIn: 'root' })
export class FavorisService {
  readonly favoris = signal<ReadonlySet<string>>(this.lireFavoris());

  estFavori(id: string): boolean {
    return this.favoris().has(id);
  }

  /** Retourne false si la sauvegarde localStorage a échoué (quota dépassé, navigation privée...),
   * pour que l'appelant puisse le signaler plutôt que d'afficher une confirmation trompeuse. */
  basculer(id: string): boolean {
    const nouveaux = new Set(this.favoris());
    if (nouveaux.has(id)) {
      nouveaux.delete(id);
    } else {
      nouveaux.add(id);
    }
    this.favoris.set(nouveaux);
    return this.sauvegarder(nouveaux);
  }

  /** Fusionne un ensemble importé (restauration d'une sauvegarde, transfert entre appareils)
   * avec les favoris actuels : n'écrase jamais, ne fait qu'ajouter. */
  importer(ids: readonly string[]): boolean {
    const fusion = new Set(this.favoris());
    for (const id of ids) {
      fusion.add(id);
    }
    this.favoris.set(fusion);
    return this.sauvegarder(fusion);
  }

  private lireFavoris(): Set<string> {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? new Set(JSON.parse(stocke)) : new Set();
    } catch {
      return new Set();
    }
  }

  private sauvegarder(favoris: ReadonlySet<string>): boolean {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify([...favoris]));
      return true;
    } catch {
      return false;
    }
  }
}
