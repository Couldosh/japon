// Modèle "vue" pour l'onglet Hébergement du Sheet, sur le même principe que
// PlanningActivite : les dates/heures sont normalisées au chargement (ISO /
// HH:mm) plutôt que de garder le format brut, potentiellement variable, du Sheet.
export interface HebergementModel {
  id: string;
  nom: string;
  adresse: string;
  /** Lien Google Maps, optionnel — sert aussi à extraire latitude/longitude. */
  localisation?: string;
  latitude: number | null;
  longitude: number | null;
  /** Format ISO "yyyy-MM-dd", triable directement en chaîne. */
  dateArrivee: string;
  /** Format "HH:mm". */
  heureCheckIn: string;
  /** Format ISO "yyyy-MM-dd". */
  dateDepart: string;
  /** Format "HH:mm". */
  heureCheckOut: string;
  commentaires?: string;
}
