import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {Plat} from '../../components/plat/plat.component';
import {Activite} from '../../components/activite.component/activite.component';

@Injectable({
  providedIn: 'root',
})
export class ActiviteService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {

  }

  getActivites(): Observable<Activite[]> {
    return this.sheetsApi.getCsv('0').pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        }).data as Activite[]
      )
    );
  }

}
