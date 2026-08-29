import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { EkiStampModel } from '../../models/eki-stamp.model';

/**
 * Charge `public/eki-stamps.json` (généré une fois depuis EKI_STAMPS_itineraire_FR.kmz
 * par scripts/generer-eki-stamps.mjs — voir docs/architecture-et-pieges.md). Fichier
 * statique servi tel quel par Angular (dossier `public/`), pas de pipeline SheetsApi :
 * ces données ne viennent pas du Google Sheet et n'ont pas vocation à changer souvent.
 *
 * `shareReplay(1)` met en cache la requête HTTP (~700 Ko) : CarteComponent ne la
 * déclenche qu'au premier affichage de la couche "Eki stamps" (voir
 * `basculerEkiStamps()`), pas au chargement de l'app — un utilisateur qui n'active
 * jamais cette couche ne télécharge jamais ce fichier.
 */
@Injectable({ providedIn: 'root' })
export class EkiStampService {
  private readonly http = inject(HttpClient);
  private stamps$?: Observable<EkiStampModel[]>;

  getEkiStamps(): Observable<EkiStampModel[]> {
    if (!this.stamps$) {
      this.stamps$ = this.http.get<EkiStampModel[]>('eki-stamps.json').pipe(shareReplay(1));
    }
    return this.stamps$;
  }
}
