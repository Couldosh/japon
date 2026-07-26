import {Injectable} from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {combineLatest, map, Observable} from 'rxjs';
import {Avis} from '../../models/avis.model';
import {RestaurantModel} from '../../models/restaurant.model';
import {QuartierService} from '../quartier/quartier.service';
import {resoudreQuartier} from '../../utils/quartier';

@Injectable({
  providedIn: 'root',
})
export class RestaurantService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa, private quartierService: QuartierService) {}

  getRestaurants(forceRefresh = false): Observable<RestaurantModel[]> {
    return combineLatest([
      this.sheetsApi.getCsv('892590698', forceRefresh),
      this.quartierService.getQuartiers(forceRefresh)
    ]).pipe(
      map(([csv, quartiers]) => {
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

          // 3. Retourner l'objet restaurant complet

          return {
            ...row,
            Avis: avisData,
            Plats: row.Plats
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean)
              .map((nom: string) => ({Nom: nom})),
            Quartier: resoudreQuartier(quartiers, row.Quartier),
            id: 'restaurant_' + index
          } as RestaurantModel;
          })
        }
      )
    );
  }


}
