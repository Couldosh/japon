import {QuartierModel} from './quartier.model';
import {Avis} from './avis.model';
import {VilleModel} from './ville.model';

export class MagasinModel {
  Liens: string;
  Localisation: string;
  Quartier: QuartierModel[];
  Nom: string;
  Type: string;
  Commentaires: string;
  Avis: Avis


  constructor(Liens: string, Localisation: string, Quartier: QuartierModel[], Nom: string, Type: string, Commentaires: string, Avis: Avis) {
    this.Liens = Liens;
    this.Localisation = Localisation;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Type = Type;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
  }
}
