import { Injectable } from '@angular/core';
import { Papa } from 'ngx-papaparse';
import { Observable, map } from 'rxjs';
import { SheetsApi } from '../google/sheets-api.service';
import { HebergementModel } from '../../models/hebergement.model';
import { GeolocationService } from '../geolocation/GeolocationService';
import { genererIdLieu } from '../../utils/lieu-id';
import { parserDateISO, parserHeure } from '../../utils/planning';


const GID_HEBERGEMENT = '786595870';

@Injectable({
  providedIn: 'root',
})
export class HebergementService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getHebergements(forceRefresh = false): Observable<HebergementModel[]> {
    return this.sheetsApi.getCsv(GID_HEBERGEMENT, forceRefresh).pipe(
      map(csv => {
        const resultat = this.papa.parse(csv, {
          header: true,
          skipEmptyLines: 'greedy'
        });

        return (resultat.data as any[])
          .filter(row => row['Nom']?.trim())
          .map((row): HebergementModel => {
            // Même piège que Restaurant/Activité/Magasin : pas de constructeur ici,
            // donc les coordonnées sont extraites explicitement du lien Maps.
            const coordonnees = GeolocationService.extraireCoordonnees(row['Localisation']);

            return {
              id: genererIdLieu('hebergement', row['Nom'], row['Date arrivée']),
              nom: row['Nom'].trim(),
              adresse: row['Adresse']?.trim() ?? '',
              localisation: row['Localisation']?.trim() || undefined,
              latitude: coordonnees?.latitude ?? null,
              longitude: coordonnees?.longitude ?? null,
              dateArrivee: parserDateISO(row['Date arrivée']) ?? '',
              heureCheckIn: parserHeure(row['Heure check-in']),
              dateDepart: parserDateISO(row['Date départ']) ?? '',
              heureCheckOut: parserHeure(row['Heure check-out']),
              commentaires: row['Commentaires']?.trim() || undefined
            };
          })
          // Une ligne sans date d'arrivée ou de départ lisible ne peut pas être
          // rattachée à un jour du Planning : plutôt l'ignorer que l'afficher
          // partout ou nulle part de façon incohérente.
          .filter(h => h.dateArrivee && h.dateDepart);
      })
    );
  }
}
