import {Injectable, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SheetsApi {
  baseUrl: string;
  constructor(private http: HttpClient) {
    this.baseUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIQ3ubHj9wlK-m3PwBWXkag_mS5S0Qdp3SKOgsZ4QEuFwjIcsJCiJADh14n_Nc-ZS8uYF1snQduWXR/pub?single=true&output=csv'

  }

  // getCsv(gid: string) {
  //   console.log(this.baseUrl+'&gid='+gid)
  //   return this.http.get(this.baseUrl+'&gid='+gid, { responseType: 'text' });
  // }

  getCsv(gid: string): Observable<string> {
    const url =
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQIQ3ubHj9wlK-m3PwBWXkag_mS5S0Qdp3SKOgsZ4QEuFwjIcsJCiJADh14n_Nc-ZS8uYF1snQduWXR/pub?single=true&output=csv&gid='+gid;

    return this.http.get(url, {
      responseType: 'text'
    });
  }


}
