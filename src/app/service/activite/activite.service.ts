import {Injectable} from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {ActiviteModel} from '../../models/activite.model';
import {RestaurantModel} from '../../models/restaurant.model';
import {Avis} from '../../models/avis.model';
import {QuartierModel} from '../../models/quartier.model';

@Injectable({
  providedIn: 'root',
})
export class ActiviteService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {

  }

  getActivites(forceRefresh = false): Observable<ActiviteModel[]> {
    return this.sheetsApi.getCsv('0', forceRefresh).pipe(
      map(csv => {
          const result = this.papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
          })
          return result.data.map((row: any, index: any) => {
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

            // 3. Retourner l'objet restaurant complet

            return {
              ...row,
              Avis: avisData,
              Quartier: row.Quartier
                .split(',')
                .map((p: string) => p.trim())
                .filter(Boolean)
                .map((nom: string) => ({Nom: nom}) as QuartierModel),
              id: 'activite_' + index
            } as RestaurantModel;
          })
        }
      )
    );
  }

}
