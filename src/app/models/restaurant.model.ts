
import {QuartierModel} from './quartier.model';
import {Plat} from '../components/plat/plat.component';
import {Avis} from './avis.model';
import {VilleModel} from './ville.model';
import {GeolocationService} from '../service/geolocation/GeolocationService';

export class RestaurantModel {
  id: string;
  Ville: VilleModel;
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


  constructor(id: string, Ville: VilleModel, Liens: string, Quartier: QuartierModel, Nom: string, Description: string, Prix: string, Plats: Plat[], Commentaires: string, Avis: Avis, Localisation: string, Video: string, Menu: string) {
    this.id = id;
    this.Ville = Ville;
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
