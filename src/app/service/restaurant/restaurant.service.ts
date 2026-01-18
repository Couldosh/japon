import {Injectable} from '@angular/core';
import {SheetsApi} from '../google/sheets-api.service';
import {Papa} from 'ngx-papaparse';
import {map, Observable} from 'rxjs';
import {Plat} from '../../components/plat/plat.component';
import {Avis} from '../../models/avis.model';

export interface Restaurant {
  Ville: string,
  Liens: string,
  Quartier: string,
  Nom: string,
  Description: string,
  Prix: string,
  Plats: Plat[],
  Commentaires: string,
  Avis: Avis,
  Localisation: string,
  Video: string,
  Menu: string
}

@Injectable({
  providedIn: 'root',
})
export class RestaurantService {
  constructor(private sheetsApi: SheetsApi, private papa: Papa) {}

  getRestaurants(): Observable<Restaurant[]> {
    return this.sheetsApi.getCsv('892590698').pipe(
      map(csv => {
          const result = this.papa.parse(csv, {
            header: true,
            skipEmptyLines: true,
          })
        return result.data.map((row: any) => {
          // 1. Parser les avis
          const avisData = new Avis({
            Valérian: this.countX(row.Valérian),
            Laurie: this.countX(row.Laurie),
            Greg: this.countX(row.Greg),
            Alex: this.countX(row.Alex),
            Mela: this.countX(row.Mela),
            Tiffa: this.countX(row.Tiffa),
            Tony: this.countX(row.Tony),
            Fabrice: this.countX(row.Fabrice)
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
              .map((nom: string) => ({Nom: nom}))
          }
          })
        }
      )
    );
  }

  /**
   * Compte le nombre de caractères 'X' dans une chaîne
   */
  private countX(value: string): number {
    if (!value) return 0;
    return (value.match(/X/gi) || []).length;
  }

}
