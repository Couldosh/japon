import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'notes_perso';

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly notes = signal<ReadonlyMap<string, string>>(this.lireNotes());

  obtenirNote(id: string): string {
    return this.notes().get(id) ?? '';
  }

  /** Toutes les notes de l'appareil (export/sauvegarde). */
  toutes(): ReadonlyMap<string, string> {
    return this.notes();
  }

  aUneNote(id: string): boolean {
    return !!this.notes().get(id);
  }

  /** Retourne false si la sauvegarde localStorage a échoué (quota dépassé, navigation privée...),
   * pour que l'appelant puisse le signaler plutôt que d'afficher une confirmation trompeuse. */
  definirNote(id: string, texte: string): boolean {
    const nouvelles = new Map(this.notes());
    const nettoye = texte.trim();
    if (nettoye) {
      nouvelles.set(id, nettoye);
    } else {
      nouvelles.delete(id);
    }
    this.notes.set(nouvelles);
    return this.sauvegarder(nouvelles);
  }

  /** Fusionne des notes importées avec celles de l'appareil : ne remplace jamais une note déjà
   * présente localement, pour ne pas écraser une saisie plus récente que celle de la sauvegarde. */
  importer(notes: Readonly<Record<string, string>>): boolean {
    const fusion = new Map(this.notes());
    for (const [id, texte] of Object.entries(notes)) {
      const nettoye = texte?.trim();
      if (nettoye && !fusion.has(id)) {
        fusion.set(id, nettoye);
      }
    }
    this.notes.set(fusion);
    return this.sauvegarder(fusion);
  }

  private lireNotes(): Map<string, string> {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? new Map(Object.entries(JSON.parse(stocke))) : new Map();
    } catch {
      return new Map();
    }
  }

  private sauvegarder(notes: ReadonlyMap<string, string>): boolean {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(notes)));
      return true;
    } catch {
      return false;
    }
  }
}
