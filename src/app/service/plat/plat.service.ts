import { Injectable } from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Plat, PlatCategory} from '../../components/plat/plat.component';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PlatService {

  constructor(private sheetsApi: SheetsApi, private papa: Papa) {

  }

  getPlats(): Observable<Plat[]> {
    return this.sheetsApi.getCsv('2053739160').pipe(
      map(csv =>
        this.papa.parse(csv, {
          header: true,
          skipEmptyLines: true
        }).data as Plat[]
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
  }

}
