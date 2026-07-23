// Modèle "vue" qui unifie Restaurant / Activite / Plat pour l'affichage
// dans les listes de la home. Ne remplace pas vos models métier existants,
// c'est juste une couche de présentation construite à partir d'eux.

import {QuartierModel} from './quartier.model';

export type TypeLieu = 'restaurant' | 'activite' | 'plat';

export interface LieuAffichable {
  id: string;
  type: TypeLieu;
  nom: string;
  quartier: QuartierModel[];
  latitude: number | null;
  longitude: number | null;
  prixIndicatif?: string;      // ex: '¥', '¥¥', 'Gratuit'
  estOuvert?: boolean;         // calculé à partir des horaires si dispo
  horaireTexte?: string;       // ex: 'Ferme à 17h'
  distanceMetres?: number | null;     // calculé côté client via géoloc
  icone: string;               // nom d'icône Ionic (ex: 'restaurant-outline')
}
