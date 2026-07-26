import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'favoris';

@Injectable({ providedIn: 'root' })
export class FavorisService {
  readonly favoris = signal<ReadonlySet<string>>(this.lireFavoris());

  estFavori(id: string): boolean {
    return this.favoris().has(id);
  }

  basculer(id: string): void {
    const nouveaux = new Set(this.favoris());
    if (nouveaux.has(id)) {
      nouveaux.delete(id);
    } else {
      nouveaux.add(id);
    }
    this.favoris.set(nouveaux);
    this.sauvegarder(nouveaux);
  }

  private lireFavoris(): Set<string> {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? new Set(JSON.parse(stocke)) : new Set();
    } catch {
      return new Set();
    }
  }

  private sauvegarder(favoris: ReadonlySet<string>): void {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify([...favoris]));
    } catch {
      // localStorage indisponible ou quota dépassé : le stockage des favoris est best-effort.
    }
  }
}
