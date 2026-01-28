import {Injectable} from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {Avis} from '../../models/avis.model';
import {QuartierModel} from '../../models/quartier.model';
import {RestaurantModel} from '../../models/restaurant.model';

@Injectable({
  providedIn: 'root',
})
export class RestaurantService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getRestaurants(): Observable<RestaurantModel[]> {
    return this.sheetsApi.getCsv('892590698').pipe(
      map(csv => {
          const result = this.papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
          })
        return result.data.map((row: any) => {
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
            Plats: row.Plats
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean)
              .map((nom: string) => ({Nom: nom})),
            Quartier: row.Quartier
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean)
              .map((nom: string) => ({Nom: nom}) as QuartierModel)
          } as RestaurantModel;
          })
        }
      )
    );
  }


}
