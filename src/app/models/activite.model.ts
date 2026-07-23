import {QuartierModel} from './quartier.model';
import {Avis} from './avis.model';
import {GeolocationService} from '../service/geolocation/GeolocationService';

export class ActiviteModel {
  id: string
  Quartier: QuartierModel[];
  Nom: string;
  Description: string;
  Prix: string;
  Temps: string;
  Commentaires: string;
  Avis: Avis;
  Localisation: string;
  latitude: number | null;
  longitude: number | null;
  Liens: string;


  constructor(id: string, Quartier: QuartierModel[], Nom: string, Description: string, Prix: string, Temps: string, Commentaires: string, Avis: Avis, Localisation: string, Liens: string) {
    this.id = id;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Description = Description;
    this.Prix = Prix;
    this.Temps = Temps;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
    this.Localisation = Localisation;
    this.Liens = Liens;

    const coordonnees = GeolocationService.extraireCoordonnees(Localisation);
    this.latitude = coordonnees?.latitude ?? null;
    this.longitude = coordonnees?.longitude ?? null;
  }
}
