
import {QuartierModel} from './quartier.model';
import {Plat} from './plat.model';
import {Avis} from './avis.model';
import {GeolocationService} from '../service/geolocation/GeolocationService';

export class RestaurantModel {
  id: string;
  Liens: string;
  Quartier: QuartierModel;
  Nom: string;
  Description: string;
  Prix: string;
  Plats: Plat[];
  Commentaires: string;
  Avis: Avis;
  Localisation: string;
  latitude: number | null;
  longitude: number | null;
  Video: string;
  Menu: string;
  Horaires?: string; // format compact JSON produit par scripts/fetch-horaires.mjs


  constructor(id: string, Liens: string, Quartier: QuartierModel, Nom: string, Description: string, Prix: string, Plats: Plat[], Commentaires: string, Avis: Avis, Localisation: string, Video: string, Menu: string) {
    this.id = id;
    this.Liens = Liens;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Description = Description;
    this.Prix = Prix;
    this.Plats = Plats;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
    this.Localisation = Localisation;
    this.Video = Video;
    this.Menu = Menu;

    const coordonnees = GeolocationService.extraireCoordonnees(Localisation);
    this.latitude = coordonnees?.latitude ?? null;
    this.longitude = coordonnees?.longitude ?? null;

  }
}
