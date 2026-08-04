import { Injectable, signal } from '@angular/core';

const CLE_STOCKAGE = 'lieux_connus';
// Durée d'affichage du badge "Nouveau" une fois un lieu détecté pour la première fois sur cet appareil.
const SEUIL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class NouveauteService {
  // id -> timestamp de première détection sur cet appareil (pas la date d'ajout réelle
  // au Sheet, qui n'est pas connue : simple approximation "vu pour la première fois ici").
  private readonly connus = signal<ReadonlyMap<string, number>>(this.lireConnus());

  /**
   * À appeler à chaque chargement complet des lieux. Un id absent de l'historique local
   * est considéré comme nouveau et horodaté à maintenant — sauf au tout premier lancement
   * de l'app sur cet appareil (aucun historique en localStorage), où tout est backdaté
   * silencieusement pour ne pas afficher un badge "Nouveau" sur l'intégralité de la liste.
   */
  enregistrer(ids: readonly string[]): void {
    const actuel = this.connus();
    const premierLancement = actuel.size === 0 && localStorage.getItem(CLE_STOCKAGE) === null;
    const fusion = new Map(actuel);
    const maintenant = premierLancement ? 0 : Date.now();
    let modifie = false;

    for (const id of ids) {
      if (!fusion.has(id)) {
        fusion.set(id, maintenant);
        modifie = true;
      }
    }

    if (modifie) {
      this.connus.set(fusion);
      this.sauvegarder(fusion);
    }
  }

  estNouveau(id: string): boolean {
    const premiereVue = this.connus().get(id);
    return premiereVue != null && premiereVue > 0 && Date.now() - premiereVue < SEUIL_MS;
  }

  private lireConnus(): Map<string, number> {
    try {
      const stocke = localStorage.getItem(CLE_STOCKAGE);
      return stocke ? new Map(Object.entries(JSON.parse(stocke))) : new Map();
    } catch {
      return new Map();
    }
  }

  private sauvegarder(connus: ReadonlyMap<string, number>): void {
    try {
      localStorage.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(connus)));
    } catch {
      // Best-effort : l'absence de persistance dégrade juste la détection "Nouveau", rien de bloquant.
    }
  }
}
