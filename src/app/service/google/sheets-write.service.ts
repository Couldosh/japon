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

/** Normalise un nom pour un matching insensible à la casse/aux accents — même principe que les
 * fonctions homonymes de ajout-lieu.component.ts/planning.component.ts (dupliquée, pas partagée
 * à ce jour dans ce projet). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Conversion d'un index de colonne 0-based vers sa lettre A1 (0 -> A, 25 -> Z, 26 -> AA...). */
function lettreColonne(index: number): string {
  let lettre = '';
  let n = index;
  while (n >= 0) {
    lettre = String.fromCharCode((n % 26) + 65) + lettre;
    n = Math.floor(n / 26) - 1;
  }
  return lettre;
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
        // Plage explicitement bornée aux colonnes des en-têtes (A:<dernière colonne>), plutôt
        // que la feuille entière : sans ça, values.append peut repérer une donnée isolée plus
        // loin dans la feuille (hors colonne A) et y ancrer le "tableau" détecté, décalant la
        // nouvelle ligne vers la droite au lieu de l'aligner sur les colonnes réelles.
        const derniereColonne = lettreColonne(Math.max(entetes.length - 1, 0));
        const url =
          `${this.baseUrl}/values/${encodeURIComponent(titre)}!A:${derniereColonne}:append` +
          `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        return this.http.post(url, { values: [ligne] }, { headers });
      }),
      map(() => {
        this.sheetsApi.clearCache(gid);
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err))))
    );
  }

  /**
   * Modifie une ligne déjà présente dans l'onglet identifié par son gid, localisée par
   * correspondance sur `cle` (Nom, et Quartier si fourni — un Plat n'en a pas). Contrairement à
   * `ajouterLigne()`, ne réécrit PAS la ligne entière : seules les colonnes présentes dans
   * `valeurs` sont modifiées (une requête `values.batchUpdate` par colonne), pour ne jamais
   * toucher aux colonnes hors formulaire (Horaires, votes individuels, Avis...).
   *
   * `cle` doit être capturé avant modification (à l'ouverture du formulaire d'édition) : le nom
   * ou le quartier peuvent eux-mêmes faire partie des valeurs modifiées.
   */
  modifierLigne(gid: string, cle: { nom: string; quartier?: string }, valeurs: Record<string, string>): Observable<void> {
    const token = this.googleAuth.token();
    if (!token) {
      return throwError(() => new Error('Connecte-toi avec Google avant de modifier ce lieu.'));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    return this.recupererMeta(gid, headers).pipe(
      switchMap(({ titre, entetes }) =>
        this.http
          .get<{ values?: string[][] }>(`${this.baseUrl}/values/${encodeURIComponent(titre)}`, { headers })
          .pipe(
            map(reponse => {
              const lignes = reponse.values ?? [];
              const idxNom = entetes.findIndex(e => e?.trim() === 'Nom');
              const idxQuartier = cle.quartier !== undefined ? entetes.findIndex(e => e?.trim() === 'Quartier') : -1;

              const correspondances = lignes
                .map((ligne, i) => ({ ligne, i }))
                .filter(({ ligne, i }) => {
                  if (i === 0 || idxNom === -1) return false;
                  if (normaliser(ligne[idxNom] ?? '') !== normaliser(cle.nom)) return false;
                  if (idxQuartier !== -1 && normaliser(ligne[idxQuartier] ?? '') !== normaliser(cle.quartier ?? '')) return false;
                  return true;
                });

              if (correspondances.length === 0) {
                throw new Error("Lieu introuvable dans le Sheet — a-t-il été modifié ou supprimé entre-temps ?");
              }
              if (correspondances.length > 1) {
                throw new Error('Plusieurs lignes correspondent à ce lieu dans le Sheet — modification annulée par sécurité.');
              }

              return { titre, entetes, numeroLigne: correspondances[0].i + 1 };
            })
          )
      ),
      switchMap(({ titre, entetes, numeroLigne }) => {
        const data = Object.entries(valeurs)
          .map(([colonne, valeur]) => {
            const idx = entetes.findIndex(e => e?.trim() === colonne);
            return idx === -1 ? null : { range: `${titre}!${lettreColonne(idx)}${numeroLigne}`, values: [[valeur]] };
          })
          .filter((entry): entry is { range: string; values: string[][] } => entry !== null);

        if (data.length === 0) {
          return of(void 0);
        }

        return this.http
          .post(`${this.baseUrl}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data }, { headers })
          .pipe(map(() => void 0));
      }),
      map(() => {
        this.sheetsApi.clearCache(gid);
      }),
      // Les erreurs "introuvable"/"plusieurs correspondances" (Error) levées ci-dessus doivent
      // remonter telles quelles ; seules les vraies erreurs HTTP passent par messageErreur().
      catchError((err: unknown) =>
        throwError(() => (err instanceof HttpErrorResponse ? new Error(this.messageErreur(err)) : err))
      )
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
