import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {Avis} from '../../models/avis.model';
import {QuartierModel} from '../../models/quartier.model';
import {MagasinModel} from '../../models/magasin.model';
import {GeolocationService} from '../geolocation/GeolocationService';

@Injectable({
  providedIn: 'root',
})
export class MagasinService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getMagasins(forceRefresh = false): Observable<MagasinModel[]> {
    return this.sheetsApi.getCsv('346756517', forceRefresh).pipe(
      map(csv => {
          const result = this.papa.parse(csv, {
            header: true,
            skipEmptyLines: 'greedy',
          })
          return result.data
            .filter((row: any) => row.Nom?.trim())
            .map((row: any, index: any) => {
            // 1. Parser les avis
            const avisData = new Avis({
              Valérian: Avis.countX(row.Valérian),
              Laurie: Avis.countX(row.Laurie),
              Greg: Avis.countX(row.Greg),
              Alex: Avis.countX(row.Alex),
              Mela: Avis.countX(row.Mela),
              Tiffa: Avis.countX(row.Tiffa),
              Tony: Avis.countX(row.Tony),
              Fabrice: Avis.countX(row.Fabrice)
            });

            // 2. Calculer la moyenne automatiquement via la méthode de la classe
            avisData.calculerMoyenne();

            // 3. Retourner l'objet magasin complet
            const coordonnees = GeolocationService.extraireCoordonnees(row.Localisation);

            return {
              ...row,
              id: 'magasin_' + index,
              Avis: avisData,
              Quartier: row.Quartier
                .split(',')
                .map((p: string) => p.trim())
                .filter(Boolean)
                .map((nom: string) => ({Nom: nom}) as QuartierModel),
              latitude: coordonnees?.latitude ?? null,
              longitude: coordonnees?.longitude ?? null
            } as MagasinModel;
          })
        }
      )
    );
  }
}
