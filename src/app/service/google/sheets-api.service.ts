import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of, tap} from 'rxjs';

interface CacheEntry {
  data: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root',
})
export class SheetsApi {
  baseUrl: string;

  /** Durée de vie d'une entrée de cache avant de la considérer périmée. */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly CACHE_PREFIX = 'sheets_cache_';

  constructor(private http: HttpClient) {
    this.baseUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIQ3ubHj9wlK-m3PwBWXkag_mS5S0Qdp3SKOgsZ4QEuFwjIcsJCiJADh14n_Nc-ZS8uYF1snQduWXR/pub?single=true&output=csv'

  }

  /**
   * Récupère le CSV d'un onglet du Google Sheet.
   * Le résultat est mis en cache dans le localStorage (par gid, avec horodatage)
   * pour éviter de re-solliciter Google Sheets à chaque affichage, y compris
   * après un rechargement de la page. Passer forceRefresh=true (ex: bouton de
   * rafraîchissement dans l'UI) pour ignorer le cache et retélécharger les données.
   */
  getCsv(gid: string, forceRefresh = false): Observable<string> {
    if (!forceRefresh) {
      const cached = this.lireCache(gid);
      if (cached) {
        return of(cached.data);
      }
    }

    const url =
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIQ3ubHj9wlK-m3PwBWXkag_mS5S0Qdp3SKOgsZ4QEuFwjIcsJCiJADh14n_Nc-ZS8uYF1snQduWXR/pub?single=true&output=csv&gid='+gid;

    return this.http.get(url, {
      responseType: 'text'
    }).pipe(
      tap(data => this.ecrireCache(gid, data))
    );
  }

  /** Vide le cache (un onglet précis, ou tous les onglets si aucun gid n'est fourni). */
  clearCache(gid?: string): void {
    if (gid) {
      localStorage.removeItem(SheetsApi.CACHE_PREFIX + gid);
      return;
    }
    Object.keys(localStorage)
      .filter(key => key.startsWith(SheetsApi.CACHE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }

  private lireCache(gid: string): CacheEntry | null {
    try {
      const raw = localStorage.getItem(SheetsApi.CACHE_PREFIX + gid);
      if (!raw) {
        return null;
      }
      const entry: CacheEntry = JSON.parse(raw);
      if (Date.now() - entry.timestamp > SheetsApi.CACHE_TTL_MS) {
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private ecrireCache(gid: string, data: string): void {
    try {
      const entry: CacheEntry = {data, timestamp: Date.now()};
      localStorage.setItem(SheetsApi.CACHE_PREFIX + gid, JSON.stringify(entry));
    } catch {
      // localStorage indisponible ou quota dépassé : le cache est best-effort, on ignore.
    }
  }
}
