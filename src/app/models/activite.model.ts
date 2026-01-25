import {QuartierModel} from './quartier.model';
import {Avis} from './avis.model';
import {VilleModel} from './ville.model';

export class ActiviteModel {
  Ville: VilleModel;
  Quartier: QuartierModel;
  Nom: string;
  Description: string;
  Prix: string;
  Temps: string;
  Commentaires: string;
  Avis: Avis;


  constructor(Ville: VilleModel, Quartier: QuartierModel, Nom: string, Description: string, Prix: string, Temps: string, Commentaires: string, Avis: Avis) {
    this.Ville = Ville;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Description = Description;
    this.Prix = Prix;
    this.Temps = Temps;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
  }
}
