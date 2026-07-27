import {Injectable} from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {combineLatest, map, Observable} from 'rxjs';
import {ActiviteModel} from '../../models/activite.model';
import {Avis} from '../../models/avis.model';
import {QuartierService} from '../quartier/quartier.service';
import {resoudreQuartier} from '../../utils/quartier';
import {GeolocationService} from '../geolocation/GeolocationService';

@Injectable({
  providedIn: 'root',
})
export class ActiviteService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa, private quartierService: QuartierService) {

  }

  getActivites(forceRefresh = false): Observable<ActiviteModel[]> {
    return combineLatest([
      this.sheetsApi.getCsv('0', forceRefresh),
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

            // 3. Retourner l'objet activité complet
            // Objet littéral (pas "new ActiviteModel(...)") : le calcul des
            // coordonnées fait par le constructeur ne se déclenche jamais, il
            // faut le refaire explicitement ici, comme pour les magasins.
            const coordonnees = GeolocationService.extraireCoordonnees(row.Localisation);

            return {
              ...row,
              Avis: avisData,
              Quartier: resoudreQuartier(quartiers, row.Quartier),
              latitude: coordonnees?.latitude ?? null,
              longitude: coordonnees?.longitude ?? null,
              id: 'activite_' + index
            } as ActiviteModel;
          })
        }
      )
    );
  }

}
