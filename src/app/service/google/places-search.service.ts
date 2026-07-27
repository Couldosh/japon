import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ResultatPlaces {
  nom: string;
  adresse: string | null;
  /** Lien Google Maps au format reconnu par GeolocationService.extraireCoordonnees. */
  lienLocalisation: string;
  siteWeb: string | null;
  /** Court résumé Google (quand disponible), utilisé pour deviner des plats connus. */
  resume: string | null;
}

interface PlaceApi {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  editorialSummary?: { text?: string };
}

/**
 * Recherche Google Places API (New) côté navigateur, pour préremplir le
 * formulaire "Ajouter un lieu" (bouton "Rechercher sur Google Places").
 *
 * Reprend exactement le principe des scripts de maintenance
 * (scripts/fetch-localisation.mjs, scripts/fetch-menu.mjs) : POST
 * places:searchText avec la requête "nom quartier", un seul résultat
 * (maxResultCount: 1). Contrairement aux scripts, la clé API utilisée ici
 * (environment.placesApiKey) doit être restreinte par origine HTTP (voir
 * environment.ts), pas par IP serveur.
 */
@Injectable({
  providedIn: 'root',
})
export class PlacesSearchService {
  private readonly http = inject(HttpClient);

  rechercher(nom: string, quartier: string | null): Observable<ResultatPlaces | null> {
    const textQuery = quartier ? `${nom} ${quartier}` : nom;

    return this.http
      .post<{ places?: PlaceApi[] }>(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery, maxResultCount: 1 },
        {
          headers: {
            'X-Goog-Api-Key': environment.placesApiKey,
            // Adapter si Google fait évoluer le nom des champs de l'API Places (New).
            'X-Goog-FieldMask':
              'places.displayName,places.formattedAddress,places.location,places.websiteUri,places.editorialSummary',
          },
        }
      )
      .pipe(
        map(reponse => {
          const place = reponse.places?.[0];
          if (!place?.location) {
            return null;
          }
          return {
            nom: place.displayName?.text ?? nom,
            adresse: place.formattedAddress ?? null,
            lienLocalisation: `https://www.google.com/maps?q=${place.location.latitude},${place.location.longitude}`,
            siteWeb: place.websiteUri ?? null,
            resume: place.editorialSummary?.text ?? null,
          };
        }),
        catchError((err: HttpErrorResponse) => throwError(() => new Error(this.messageErreur(err))))
      );
  }

  private messageErreur(err: HttpErrorResponse): string {
    if (err.status === 403) {
      return "Clé Google Places refusée (vérifie les restrictions d'origine/API dans Google Cloud Console).";
    }
    return 'Recherche Google Places impossible. Réessaie.';
  }
}
