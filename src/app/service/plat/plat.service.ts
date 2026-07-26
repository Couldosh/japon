import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Plat, PlatCategory} from '../../models/plat.model';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PlatService {

  constructor(private sheetsApi: SheetsApi, private papa: Papa) {

  }

  getPlats(forceRefresh = false): Observable<Plat[]> {
    return this.sheetsApi.getCsv('2053739160', forceRefresh).pipe(
      map(csv =>
        (this.papa.parse(csv, {
          header: true,
          skipEmptyLines: 'greedy'
        }).data as Plat[]).filter(plat => plat.Nom?.trim())
      )
    );
  }

  getSeverity(category: PlatCategory) {
    switch (category) {
      case PlatCategory.Plat:
        return 'success'
      case PlatCategory.Snack:
        return "danger"
    }
    return 'success'
  }

}
