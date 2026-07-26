import {QuartierModel} from './quartier.model';
import {Avis} from './avis.model';

export class MagasinModel {
  id: string;
  Liens: string;
  Localisation: string;
  Quartier: QuartierModel[];
  Nom: string;
  Type: string;
  Commentaires: string;
  Avis: Avis;
  latitude: number | null;
  longitude: number | null;
  Horaires?: string; // format compact JSON produit par scripts/fetch-horaires.mjs


  constructor(id: string, Liens: string, Localisation: string, Quartier: QuartierModel[], Nom: string, Type: string, Commentaires: string, Avis: Avis, latitude: number | null, longitude: number | null) {
    this.id = id;
    this.Liens = Liens;
    this.Localisation = Localisation;
    this.Quartier = Quartier;
    this.Nom = Nom;
    this.Type = Type;
    this.Commentaires = Commentaires;
    this.Avis = Avis;
    this.latitude = latitude;
    this.longitude = longitude;
  }
}
