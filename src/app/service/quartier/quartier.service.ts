import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {QuartierModel} from '../../models/quartier.model';
import {VilleModel} from '../../models/ville.model';

@Injectable({
  providedIn: 'root',
})
export class QuartierService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getQuartiers(forceRefresh = false): Observable<QuartierModel[]> {
    return this.sheetsApi.getCsv('1855356526', forceRefresh).pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: 'greedy'
        }).data
          .filter((row: any) => row.Nom?.trim())
          .map((row: any) => ({
            ...row,
            Ville: ({Nom: row.Ville} as VilleModel)
          } as QuartierModel))
      )
    );
  }
}
