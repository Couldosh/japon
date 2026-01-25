import {VilleModel} from './ville.model';


export class QuartierModel {
  Ville: VilleModel;
  Nom: string;
  Mood: string;


  constructor(Ville: VilleModel, Nom: string, Mood: string) {
    this.Ville = Ville;
    this.Nom = Nom;
    this.Mood = Mood;
  }
}
