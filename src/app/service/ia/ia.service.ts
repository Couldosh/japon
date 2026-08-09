import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DescriptionRequest,
  DescriptionResponse,
  ExtractionPlatsRequest,
  ExtractionPlatsResponse,
  PlatInfoRequest,
  PlatInfoResponse,
  RechercheRestaurantRequest,
  RechercheRestaurantResponse,
  ResumeQuotidienRequest,
  ResumeQuotidienResponse,
} from '../../models/ia.model';

/** Appels au backend ClaudeApiTkt (Spring Boot + CLI Claude Code) — voir docs de ce backend
 * pour le détail des prompts système. En prod, `environment.iaApiUrl` est une URL relative
 * (même origine que l'app, ex: "/api/ai") : un reverse proxy côté hébergement ("japon") relaie
 * vers le vrai backend en authentifiant ce hop serveur-à-serveur avec un Service Token
 * Cloudflare Access — le navigateur n'a donc jamais besoin de se connecter à Cloudflare
 * directement. Erreurs mappées en messages utilisateur français, comme PlacesSearchService. */
@Injectable({
  providedIn: 'root',
})
export class IaService {
  private readonly http = inject(HttpClient);

  genererDescription(request: DescriptionRequest): Observable<DescriptionResponse> {
    return this.http
      .post<DescriptionResponse>(`${environment.iaApiUrl}/description`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  extrairePlats(request: ExtractionPlatsRequest): Observable<ExtractionPlatsResponse> {
    return this.http
      .post<ExtractionPlatsResponse>(`${environment.iaApiUrl}/plats`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  genererResumeQuotidien(request: ResumeQuotidienRequest): Observable<ResumeQuotidienResponse> {
    return this.http
      .post<ResumeQuotidienResponse>(`${environment.iaApiUrl}/resume-quotidien`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  genererPlatInfo(request: PlatInfoRequest): Observable<PlatInfoResponse> {
    return this.http
      .post<PlatInfoResponse>(`${environment.iaApiUrl}/plat-info`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  rechercherRestaurant(request: RechercheRestaurantRequest): Observable<RechercheRestaurantResponse> {
    return this.http
      .post<RechercheRestaurantResponse>(`${environment.iaApiUrl}/recherche-restaurant`, request)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  private messageErreur(err: HttpErrorResponse): string {
    if (err.status === 504) {
      return "Le service IA a mis trop de temps à répondre. Réessaie.";
    }
    return 'Service IA indisponible. Réessaie plus tard.';
  }
}
