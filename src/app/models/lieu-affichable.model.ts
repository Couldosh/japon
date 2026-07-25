// Modèle "vue" qui unifie Restaurant / Activite / Magasin pour l'affichage
// dans les listes de la home. Ne remplace pas vos models métier existants,
// c'est juste une couche de présentation construite à partir d'eux.

import {QuartierModel} from './quartier.model';

export type TypeLieu = 'restaurant' | 'activite' | 'magasin';

export interface LieuAffichable {
  id: string;
  type: TypeLieu;
  nom: string;
  quartier: QuartierModel;
  latitude: number | null;
  longitude: number | null;
  prixIndicatif?: string;      // ex: '¥', '¥¥', 'Gratuit'
  estOuvert?: boolean;         // calculé à partir des horaires si dispo
  horaireTexte?: string;       // horaires du jour courant, ex: '09:00 - 18:00'
  distanceMetres?: number | null;     // calculé côté client via géoloc
  icone: string;               // emoji représentatif du lieu (ex: '🍣' pour un restaurant de sushi)
  platsNoms?: string[];         // restaurant uniquement : noms des plats servis, pour le filtre par plat
  typeMagasin?: string;         // magasin uniquement : catégorie du magasin, pour le filtre par type
}
