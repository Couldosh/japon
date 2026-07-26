import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'notes_perso';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly notes = signal<ReadonlyMap<string, string>>(this.lireNotes());

  obtenirNote(id: string): string {
    return this.notes().get(id) ?? '';
  }

  aUneNote(id: string): boolean {
    return !!this.notes().get(id);
  }

  definirNote(id: string, texte: string): void {
    const nouvelles = new Map(this.notes());
    const nettoye = texte.trim();
    if (nettoye) {
      nouvelles.set(id, nettoye);
    } else {
      nouvelles.delete(id);
    }
    this.notes.set(nouvelles);
    this.sauvegarder(nouvelles);
  }

  private lireNotes(): Map<string, string> {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? new Map(Object.entries(JSON.parse(stocke))) : new Map();
    } catch {
      return new Map();
    }
  }

  private sauvegarder(notes: ReadonlyMap<string, string>): void {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(notes)));
    } catch {
      // localStorage indisponible ou quota dépassé : les notes perso sont best-effort.
    }
  }
}
