import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, switchMap } from 'rxjs';
import { MeteoJour } from '../../models/meteo.model';

interface Coordonnees {
  latitude: number;
  longitude: number;
}

interface CachePrevisions {
  coords: Coordonnees;
  previsions: Record<string, MeteoJour>;
  timestamp: number;
}

interface ReponseGeocodage {
  results?: { latitude: number; longitude: number }[];
}

interface ReponsePrevisions {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

const CACHE_PREFIX = 'meteo_cache_';
// La météo n'a pas besoin d'être temps réel comme le Planning (cache stale-while-revalidate
// de 0min) : 6h suffit largement et évite de re-solliciter Open-Meteo à chaque ouverture d'onglet.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Prévisions météo (Open-Meteo, gratuit, sans clé API) pour les villes du Planning.
 * Best-effort partout : ville non géolocalisable, jour hors de la fenêtre de
 * prévision (~16 jours) ou erreur réseau renvoient simplement une Map vide plutôt
 * qu'une erreur bloquante — c'est une amélioration cosmétique du Planning, pas
 * une donnée critique comme les activités elles-mêmes.
 */
@Injectable({
  providedIn: 'root',
})
export class MeteoService {
  constructor(private http: HttpClient) {}

  /** Prévisions connues pour une ville, indexées par date ISO "yyyy-MM-dd". */
  getPrevisions(ville: string): Observable<Map<string, MeteoJour>> {
    const cle = this.normaliser(ville);
    const cache = this.lireCache(cle);
    if (cache) {
      return of(this.versMap(cache.previsions));
    }

    return this.geocoder(ville).pipe(
      switchMap(coords => {
        if (!coords) {
          return of(new Map<string, MeteoJour>());
        }
        return this.previsions(coords).pipe(
          map(previsions => {
            this.ecrireCache(cle, { coords, previsions: this.versRecord(previsions), timestamp: Date.now() });
            return previsions;
          })
        );
      }),
      catchError(() => of(new Map<string, MeteoJour>()))
    );
  }

  private geocoder(ville: string): Observable<Coordonnees | null> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ville)}&count=1&language=fr&format=json`;
    return this.http.get<ReponseGeocodage>(url).pipe(
      map(reponse => {
        const resultat = reponse.results?.[0];
        return resultat ? { latitude: resultat.latitude, longitude: resultat.longitude } : null;
      }),
      catchError(() => of(null))
    );
  }

  private previsions(coords: Coordonnees): Observable<Map<string, MeteoJour>> {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16';
    return this.http.get<ReponsePrevisions>(url).pipe(
      map(reponse => {
        const map = new Map<string, MeteoJour>();
        const daily = reponse.daily;
        daily?.time.forEach((date, i) => {
          map.set(date, {
            code: daily.weather_code[i],
            tempMax: Math.round(daily.temperature_2m_max[i]),
            tempMin: Math.round(daily.temperature_2m_min[i])
          });
        });
        return map;
      }),
      catchError(() => of(new Map<string, MeteoJour>()))
    );
  }

  private normaliser(ville: string): string {
    return ville.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  private versRecord(previsions: Map<string, MeteoJour>): Record<string, MeteoJour> {
    return Object.fromEntries(previsions);
  }

  private versMap(previsions: Record<string, MeteoJour>): Map<string, MeteoJour> {
    return new Map(Object.entries(previsions));
  }

  private lireCache(cle: string): CachePrevisions | null {
    try {
      const brut = localStorage.getItem(CACHE_PREFIX + cle);
      if (!brut) {
        return null;
      }
      const entry: CachePrevisions = JSON.parse(brut);
      if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  private ecrireCache(cle: string, entry: CachePrevisions): void {
    try {
      localStorage.setItem(CACHE_PREFIX + cle, JSON.stringify(entry));
    } catch {
      // localStorage indisponible ou quota dépassé : le cache est best-effort, on ignore.
    }
  }
}
