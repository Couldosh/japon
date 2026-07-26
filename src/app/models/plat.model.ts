export interface Plat {
  Nom: string;
  Categorie: PlatCategory;
  Description: string;
  Commentaires: string;
  Wiki: string;
}

export enum PlatCategory {
  Plat = 'Plat',
  Snack = 'Snack'
}
