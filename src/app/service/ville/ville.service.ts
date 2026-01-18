import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';

export interface Ville {
  Nom: string;
}

@Injectable({
  providedIn: 'root',
})
export class VilleService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getVilles(): Observable<Ville[]> {
    return this.sheetsApi.getCsv('357846773').pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        }).data as Ville[]
      )
    );
  }
}
