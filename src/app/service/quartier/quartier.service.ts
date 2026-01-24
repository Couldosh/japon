import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {Ville} from '../ville/ville.service';
import {QuartierModel} from '../../models/quartier.model';

@Injectable({
  providedIn: 'root',
})
export class QuartierService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getQuartiers(): Observable<QuartierModel[]> {
    return this.sheetsApi.getCsv('357846773').pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        }).data as QuartierModel[]
      )
    );
  }
}
