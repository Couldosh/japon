import { Injectable, signal } from '@angular/core';

export interface Position {
  latitude: number;
  longitude: number;
}

@Injectable({ providedIn: 'root' })
export class GeolocationService {

  // Position courante exposée en signal pour être consommée facilement
  // dans les composants standalone (home, liste, carte...)
  readonly position = signal<Position | null>(null);
  readonly erreur = signal<string | null>(null);

  demarrerSuivi(): void {
    if (!navigator.geolocation) {
      this.erreur.set("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }

    navigator.geolocation.watchPosition(
      (pos) => {
        this.position.set({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
        this.erreur.set(null);
      },
      (err) => {
        this.erreur.set(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );
  }

  /**
   * Distance en mètres entre deux points (formule de Haversine)
   */
  static distanceMetres(a: Position, b: Position): number {
    const R = 6371000; // rayon terrestre en mètres
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  static formaterDistance(metres: number): string {
    if (metres < 1000) {
      return `${Math.round(metres)} m`;
    }
    return `${(metres / 1000).toFixed(1)} km`;
  }

  static extraireCoordonnees(lienGoogleMaps: string): { latitude: number; longitude: number } | null {
    if (!lienGoogleMaps) {
      return null;
    }

    // Format 1 : .../@35.6595,139.7005,17z/...
    const matchArobase = lienGoogleMaps.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchArobase) {
      return {
        latitude: parseFloat(matchArobase[1]),
        longitude: parseFloat(matchArobase[2])
      };
    }

    // Format 2 : ...?q=35.6595,139.7005
    const matchQuery = lienGoogleMaps.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (matchQuery) {
      return {
        latitude: parseFloat(matchQuery[1]),
        longitude: parseFloat(matchQuery[2])
      };
    }

    // Format 3 : liens de type "place" avec coordonnées encodées (!3d et !4d)
    // ex: .../data=!4m5!3m4!1s...!8m2!3d35.6595!4d139.7005
    const matchPlace = lienGoogleMaps.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (matchPlace) {
      return {
        latitude: parseFloat(matchPlace[1]),
        longitude: parseFloat(matchPlace[2])
      };
    }

    return null;
  }
}
