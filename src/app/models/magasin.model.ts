import {QuartierModel} from './quartier.model';
import {Avis} from './avis.model';
import {VilleModel} from './ville.model';

export class MagasinModel {
  Ville: VilleModel;
  Liens: string;
  Quartier: QuartierModel[];
  Nom: string;
  Type: string;
  Commentaires: string;
  Avis: Avis


  constructor(Ville: VilleModel, Liens: string, Quartier: QuartierModel[], Nom: string, Type: string, Commentaires: string, Avis: Avis) {
    this.Ville = Ville;
    this.Liens = Liens;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Type = Type;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
  }
}
