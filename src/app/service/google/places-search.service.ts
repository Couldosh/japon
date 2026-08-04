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
  /** URL directement utilisable en <img src>, pour aider à confirmer que c'est la bonne
   * enseigne avant d'ajouter (utile pour les chaînes ambiguës — Daiso, Uniqlo...). null si
   * Places ne renvoie aucune photo pour ce résultat. */
  photoUrl: string | null;
}

/**
 * Construit le lien Google Maps écrit dans la colonne "Localisation" du Sheet, à partir
 * des coordonnées et (si disponible) de l'id du lieu renvoyé par Places API (New).
 *
 * Avec `query_place_id`, Google Maps affiche la fiche complète du lieu au clic (nom,
 * avis, horaires, photos...) plutôt qu'un simple pin — voir la doc "Search Action" des
 * Google Maps URLs (developers.google.com/maps/documentation/urls). Repli sur l'ancien
 * format `?q=lat,lng` (juste un pin) si l'id est absent, ce qui ne devrait pas arriver en
 * pratique pour un résultat Places valide, mais reste géré par
 * GeolocationService.extraireCoordonnees dans les deux cas.
 */
function construireLienLocalisation(location: { latitude: number; longitude: number }, placeId?: string): string {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

/**
 * URL directement utilisable en <img src> pour la première photo d'un résultat Places, via
 * l'endpoint Photo media de Places API (New) : contrairement aux autres endpoints, celui-ci
 * accepte la clé API en paramètre d'URL (`key=`) plutôt qu'en en-tête, et répond par une
 * redirection HTTP vers l'image elle-même — exactement ce qu'un <img> sait suivre nativement,
 * sans appel HttpClient/Observable supplémentaire ni gestion d'auth côté template.
 */
function construireUrlPhoto(photos?: { name: string }[]): string | null {
  const nomPhoto = photos?.[0]?.name;
  if (!nomPhoto) {
    return null;
  }
  return `https://places.googleapis.com/v1/${nomPhoto}/media?maxWidthPx=400&key=${environment.placesApiKey}`;
}

interface PlaceApi {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  editorialSummary?: { text?: string };
  photos?: { name: string }[];
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
              'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.editorialSummary,places.photos',
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
            lienLocalisation: construireLienLocalisation(place.location, place.id),
            siteWeb: place.websiteUri ?? null,
            resume: place.editorialSummary?.text ?? null,
            photoUrl: construireUrlPhoto(place.photos),
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
