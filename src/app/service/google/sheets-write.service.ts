import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { GoogleAuthService } from './google-auth.service';
import { SheetsApi } from './sheets-api.service';

interface FeuilleMeta {
  titre: string;
  entetes: string[];
}

/**
 * Écriture dans le Google Sheet via l'API Sheets v4 (values.append), pour la
 * fonctionnalité "Ajouter un lieu" — voir docs/architecture-et-pieges.md.
 *
 * Le mapping colonne -> index est lu dynamiquement depuis la ligne d'en-têtes
 * de chaque onglet plutôt que codé en dur, en reprenant le même principe que
 * trouverTitreOnglet()/indexColonne() dans scripts/lib/google-sheets.mjs (les
 * scripts de maintenance côté Node) : robuste si l'ordre des colonnes du Sheet
 * change, à garder cohérent avec ce fichier si l'un des deux évolue.
 */
@Injectable({
  providedIn: 'root',
})
export class SheetsWriteService {
  private readonly http = inject(HttpClient);
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly sheetsApi = inject(SheetsApi);

  private readonly baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${environment.spreadsheetId}`;

  /** Titre + en-têtes par gid, mis en cache en mémoire pour la durée de la session. */
  private readonly cacheMeta = new Map<string, FeuilleMeta>();

  /**
   * Ajoute une ligne à l'onglet identifié par son gid. `valeurs` associe un
   * nom de colonne du Sheet (ex. "Nom", "Quartier") à sa valeur ; les colonnes
   * non fournies (votes, Horaires...) sont laissées vides.
   */
  ajouterLigne(gid: string, valeurs: Record<string, string>): Observable<void> {
    const token = this.googleAuth.token();
    if (!token) {
      return throwError(() => new Error("Connecte-toi avec Google avant d'ajouter un lieu."));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    return this.recupererMeta(gid, headers).pipe(
      switchMap(({ titre, entetes }) => {
        const ligne = entetes.map(entete => valeurs[entete?.trim()] ?? '');
        const url =
          `${this.baseUrl}/values/${encodeURIComponent(titre)}:append` +
          `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        return this.http.post(url, { values: [ligne] }, { headers });
      }),
      map(() => {
        this.sheetsApi.clearCache(gid);
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err))))
    );
  }

  private recupererMeta(gid: string, headers: HttpHeaders): Observable<FeuilleMeta> {
    const enCache = this.cacheMeta.get(gid);
    if (enCache) {
      return of(enCache);
    }

    return this.trouverTitre(gid, headers).pipe(
      switchMap(titre =>
        this.http
          .get<{ values?: string[][] }>(`${this.baseUrl}/values/${encodeURIComponent(titre)}!1:1`, { headers })
          .pipe(
            map(reponse => {
              const meta: FeuilleMeta = { titre, entetes: reponse.values?.[0] ?? [] };
              this.cacheMeta.set(gid, meta);
              return meta;
            })
          )
      )
    );
  }

  private trouverTitre(gid: string, headers: HttpHeaders): Observable<string> {
    return this.http
      .get<{ sheets: { properties: { sheetId: number; title: string } }[] }>(this.baseUrl, { headers })
      .pipe(
        map(reponse => {
          const feuille = reponse.sheets.find(s => String(s.properties.sheetId) === gid);
          if (!feuille) {
            throw new Error(`Aucun onglet avec gid=${gid} trouvé dans le Sheet.`);
          }
          return feuille.properties.title;
        })
      );
  }

  private messageErreur(err: HttpErrorResponse): string {
    if (err.status === 401) return 'Session Google expirée, reconnecte-toi.';
    if (err.status === 403) return "Ce compte Google n'a pas les droits d'édition sur le Sheet.";
    return "Erreur lors de l'écriture dans le Sheet. Réessaie.";
  }
}
