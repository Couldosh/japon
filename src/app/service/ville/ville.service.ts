import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {VilleModel} from '../../models/ville.model';

@Injectable({
  providedIn: 'root',
})
export class VilleService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getVilles(forceRefresh = false): Observable<VilleModel[]> {
    return this.sheetsApi.getCsv('357846773', forceRefresh).pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        }).data as VilleModel[]
      )
    );
  }
}
