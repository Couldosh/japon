
import {QuartierModel} from './quartier.model';
import {Plat} from '../components/plat/plat.component';
import {Avis} from './avis.model';
import {VilleModel} from './ville.model';

export class RestaurantModel {
  Ville: VilleModel;
  Liens: string;
  Quartier: QuartierModel[];
  Nom: string;
  Description: string;
  Prix: string;
  Plats: Plat[];
  Commentaires: string;
  Avis: Avis;
  Localisation: string;
  Video: string;
  Menu: string;


  constructor(Ville: VilleModel, Liens: string, Quartier: QuartierModel[], Nom: string, Description: string, Prix: string, Plats: Plat[], Commentaires: string, Avis: Avis, Localisation: string, Video: string, Menu: string) {
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
  }
}
