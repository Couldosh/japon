import {Ville} from '../service/ville/ville.service';

export class QuartierModel {
  Ville: Ville;
  Nom: string;
  Mood: string;


  constructor(Ville: Ville, Nom: string, Mood: string) {
    this.Ville = Ville;
    this.Nom = Nom;
    this.Mood = Mood;
  }
}
