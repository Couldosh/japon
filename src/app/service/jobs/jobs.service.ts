import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { JobEtatResponse, JobLancementResponse, JobOptions, JobType } from '../../models/jobs.model';

/**
 * Menu caché "jobs" (voir JobsPanelComponent) — mêmes principes que IaService : en prod,
 * `environment.jobsApiUrl` est une URL relative vers public/api/jobs.php, qui relaie côté serveur
 * vers ClaudeApiTkt authentifié par un Service Token Cloudflare Access. Un seul job actif à la
 * fois pour tout le groupe (voir JobRunnerService côté backend) : `lancer()` peut échouer en 409.
 */
@Injectable({
  providedIn: 'root',
})
export class JobsService {
  private readonly http = inject(HttpClient);

  lancer(type: JobType, options: JobOptions): Observable<JobLancementResponse> {
    return this.http
      .post<JobLancementResponse>(`${environment.jobsApiUrl}/${type}/lancer`, options)
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  /** Polling incrémental : renvoyer `total` de la réponse précédente comme `depuis` suivant. */
  etat(depuis: number): Observable<JobEtatResponse> {
    const params = new HttpParams().set('depuis', depuis);
    return this.http
      .get<JobEtatResponse>(`${environment.jobsApiUrl}/etat`, { params })
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  annuler(): Observable<void> {
    return this.http
      .post<void>(`${environment.jobsApiUrl}/annuler`, {})
      .pipe(catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err)))));
  }

  private messageErreur(err: HttpErrorResponse): string {
    if (err.status === 409) {
      return 'Un autre job est déjà en cours, réessaie après sa fin.';
    }
    if (err.status === 504) {
      return 'Le service jobs a mis trop de temps à répondre. Réessaie.';
    }
    return 'Service jobs indisponible. Réessaie plus tard.';
  }
}
